import {db} from './index';
import {logger} from '@/utils/logger';

// 向量数据库表结构定义
export interface VectorDocument {
  id: number;
  filename: string;   // 文件名
  chunk_id: number;   // 分块ID
  content: string;    // 分块内容
  embedding: string;  // 存储为JSON字符串的向量
  updated_at: number; // 时间戳
}

// 初始化向量数据库表
export async function initVectorDb() {
  await db!.execute(`
    create table if not exists vector_documents (
      id integer primary key autoincrement,
      filename text not null,
      chunk_id integer not null,
      content text not null,
      embedding text not null,
      updated_at integer not null,
      unique(filename, chunk_id)
    )
  `);
  
  // 初始化 FTS5 全文检索表 (使用 content 字段进行索引)
  // 注意: FTS5 是 SQLite 的虚表扩展
  await db!.execute(`
    create virtual table if not exists vector_documents_fts using fts5(
      filename,
      chunk_id unindexed,
      content,
      content='vector_documents',
      content_rowid='id'
    )
  `);

  // 创建触发器实现自动同步 (可选，但为了性能和可靠性此处采用代码同步)
  
  // 创建用于快速查找文件的索引
  await db!.execute(`
    create index if not exists idx_vector_documents_filename 
    on vector_documents(filename)
  `);
}

// 插入或更新向量文档
export async function upsertVectorDocument(doc: Omit<VectorDocument, 'id'>) {
  // 1. 更新主表
  const result = await db!.execute(
    "insert into vector_documents (filename, chunk_id, content, embedding, updated_at) values ($1, $2, $3, $4, $5) on conflict(filename, chunk_id) do update set content = excluded.content, embedding = excluded.embedding, updated_at = excluded.updated_at",
    [doc.filename, doc.chunk_id, doc.content, doc.embedding, doc.updated_at]);
  
  const lastInsertId = result.lastInsertId;

  // 2. 同步到 FTS5 虚表
  // 由于 FTS5 虚表不能直接 ON CONFLICT，我们先尝试删除对应的旧条目或直接由于外部处理逻辑（已预先删除）直接插入
  // 这里通过主表的 rowid (lastInsertId) 来同步
  if (lastInsertId) {
    await db!.execute(
      "insert into vector_documents_fts(rowid, filename, chunk_id, content) values ($1, $2, $3, $4)",
      [lastInsertId, doc.filename, doc.chunk_id, doc.content]
    );
  } else {
    // 这种情况下是更新了已有记录，我们需要根据 filename 和 chunk_id 找到 id 并更新 FTS
    const existing = await db!.select<{id: number}[]>(
      "select id from vector_documents where filename = $1 and chunk_id = $2",
      [doc.filename, doc.chunk_id]
    );
    if (existing && existing[0]) {
      await db!.execute(
        "insert into vector_documents_fts(vector_documents_fts, rowid, filename, chunk_id, content) values('delete', $1, $2, $3, $4)",
        [existing[0].id, doc.filename, doc.chunk_id, doc.content]
      );
      await db!.execute(
        "insert into vector_documents_fts(rowid, filename, chunk_id, content) values ($1, $2, $3, $4)",
        [existing[0].id, doc.filename, doc.chunk_id, doc.content]
      );
    }
  }
}

// 获取指定文件名的所有向量文档
export async function getVectorDocumentsByFilename(filename: string) {
  return await db!.select<VectorDocument[]>(
    "select * from vector_documents where filename = $1 order by chunk_id",
    [filename]);
}

// 通过文件名/文件夹路径删除向量文档（支持前缀删除，同步清理 FTS5 索引）
export async function deleteVectorDocumentsByFilename(filename: string) {
  const prefix = filename + '/';
  
  // 1. 查找所有受影响的文档
  const docs = await db!.select<{id: number, filename: string, chunk_id: number, content: string}[]>(
    "select id, filename, chunk_id, content from vector_documents where filename = $1 or filename like $2",
    [filename, prefix + '%']
  );
  
  if (!docs.length) return;

  for (const doc of docs) {
    // 2. 从 FTS5 虚拟表中删除旧的索引记录 (遵循 FTS5 外部内容表同步规范)
    await db!.execute(
      "insert into vector_documents_fts(vector_documents_fts, rowid, filename, chunk_id, content) values('delete', $1, $2, $3, $4)",
      [doc.id, doc.filename, doc.chunk_id, doc.content]
    );
  }

  // 3. 从主表中删除
  await db!.execute(
    "delete from vector_documents where filename = $1 or filename like $2",
    [filename, prefix + '%']
  );
}

// 重命名文件或文件夹的向量文档
export async function renameVectorDocuments(oldPath: string, newPath: string) {
  const oldPrefix = oldPath + '/';
  const newPrefix = newPath + '/';
  
  // 1. 查找所有受影响的文档
  const docs = await db!.select<{id: number, filename: string, chunk_id: number, content: string}[]>(
    "select id, filename, chunk_id, content from vector_documents where filename = $1 or filename like $2",
    [oldPath, oldPrefix + '%']
  );
  
  if (!docs.length) return;

  for (const doc of docs) {
    // 2. 从 FTS5 虚拟表中删除旧的索引记录
    await db!.execute(
      "insert into vector_documents_fts(vector_documents_fts, rowid, filename, chunk_id, content) values('delete', $1, $2, $3, $4)",
      [doc.id, doc.filename, doc.chunk_id, doc.content]
    );

    // 计算新的文件名
    let newFilename = doc.filename;
    if (doc.filename === oldPath) {
      newFilename = newPath;
    } else if (doc.filename.startsWith(oldPrefix)) {
      newFilename = newPrefix + doc.filename.substring(oldPrefix.length);
    }

    // 3. 更新主表中的文件名
    await db!.execute(
      "update vector_documents set filename = $1 where id = $2",
      [newFilename, doc.id]
    );

    // 4. 将新纪录插入到 FTS5 虚拟表以重建索引
    await db!.execute(
      "insert into vector_documents_fts(rowid, filename, chunk_id, content) values ($1, $2, $3, $4)",
      [doc.id, newFilename, doc.chunk_id, doc.content]
    );
  }
}

// 检查文件是否已存在于向量数据库中
export async function checkVectorDocumentExists(filename: string) {
  const result = await db!.select<{ count: number }[]>(
    "select count(*) as count from vector_documents where filename = $1",
    [filename]);
  
  return result[0]?.count > 0;
}

// 获取最相似的文档片段
export async function getSimilarDocuments(
  queryEmbedding: number[], 
  limit: number = 5,
  threshold: number = 0.5
): Promise<{id: number, filename: string, content: string, similarity: number}[]> {
  // 获取所有文档向量 (待优化: 大规模数据下应使用向量数据库或更高效的索引方式)
  const docs = await db!.select<VectorDocument[]>(`
    select id, filename, content, embedding from vector_documents
  `);
  
  if (!docs.length) {
    logger.rag.warn('Vector database is empty');
    return [];
  }
  
  // 计算余弦相似度并排序
  return docs.map(doc => {
    let docEmbedding: number[];
    try {
      docEmbedding = JSON.parse(doc.embedding) as number[];
    } catch (e) {
      logger.rag.error(`Failed to parse embedding for doc ${doc.id}:`, e);
      return null;
    }

    if (!docEmbedding || docEmbedding.length !== queryEmbedding.length) {
      logger.rag.warn(`Dimension mismatch for doc ${doc.id}: doc=${docEmbedding?.length}, query=${queryEmbedding.length}`);
      return null;
    }

    const similarity = cosineSimilarity(queryEmbedding, docEmbedding);

    return {
      id: doc.id,
      filename: doc.filename,
      content: doc.content,
      chunk_id: (doc as any).chunk_id || 0, // 确保返回分块 ID
      similarity
    };
  })
      .filter((doc): doc is { id: number, filename: string, content: string, chunk_id: number, similarity: number } =>
          doc !== null && doc.similarity >= threshold
      )
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
}

/**
 * 使用 FTS5 进行全文检索 (BM25)
 * @param query 搜索词
 * @param limit 限制数量
 */
export async function getFtsDocuments(
  query: string,
  limit: number = 20
): Promise<{id: number, filename: string, content: string, score: number, type: string}[]> {
  // 预处理 query，防止 SQL 注入或格式错误，简单的处理是将特殊字符转义或包裹
  // FTS5 MATCH 语法比较严格
  const safeQuery = query.replace(/['"/\\;]/g, ' ');
  
  if (!safeQuery.trim()) return [];

  try {
    // 使用 rank 功能获取 BM25 评分 (rank 越小越相关，但在 FTS5 中 rank 是负数，排序时需注意)
    // 也可以使用 bm25(vector_documents_fts) 如果编译了相关库，但 rank 是内置的
    const results = await db!.select<any[]>(`
      select 
        rowid as id, 
        filename, 
        content, 
        chunk_id,
        rank as fts_score
      from vector_documents_fts 
      where vector_documents_fts match $1 
      order by rank 
      limit $2
    `, [safeQuery, limit]);

    return results.map(r => ({
      id: r.id,
      filename: r.filename,
      content: r.content,
      chunk_id: r.chunk_id || 0,
      // 将 rank 转为正向分数以便 RRF 逻辑处理 (FTS5 rank 默认越小越相关)
      score: Math.abs(r.fts_score) || 0,
      type: 'fts'
    }));
  } catch (e) {
    logger.rag.error('FTS5 search failed:', e);
    return [];
  }
}

// 余弦相似度计算
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    logger.rag.error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 清空向量数据库
export async function clearVectorDb() {
  await db!.execute(`
    delete from vector_documents_fts
  `);
  await db!.execute(`
    delete from vector_documents
  `);
}

// 获取所有向量文档的文件名列表
export async function getAllVectorDocumentFilenames() {
  return await db!.select<{filename: string}[]>(`
    select distinct filename from vector_documents
  `);
}

// 获取向量文档总数
export async function getVectorDocumentCount() {
  const result = await db!.select<{count: number}[]>(`
    select count(*) as count from vector_documents
  `);
  return result[0]?.count || 0;
}
