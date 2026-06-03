import { readTextFile, readDir, BaseDirectory, DirEntry } from "@tauri-apps/plugin-fs";
import { fetchEmbedding, rerankDocuments, checkRerankModelAvailable } from "./ai";
import { 
  upsertVectorDocument, 
  deleteVectorDocumentsByFilename, 
  renameVectorDocuments,
  getAllVectorDocumentFilenames,
  getSimilarDocuments,
  getFtsDocuments,
  initVectorDb,
  getVectorDocumentCount
} from "@/db/vector";
import { invoke } from "@tauri-apps/api/core";
import { MarkdownChunker, ChunkerOptions } from "./markdown-chunker";

// 重新导出核心方法，使其可在其他模块中导入
export { initVectorDb, getVectorDocumentCount, checkRerankModelAvailable, deleteVectorDocumentsByFilename, renameVectorDocuments };
import { getFilePathOptions, getWorkspacePath, toWorkspaceRelativePath } from "./workspace";
import { DirTree } from "@/stores/article";
import { toast } from "@/components/ui/toast/use-toast";
import { join } from "@tauri-apps/api/path";
import { Store } from "@tauri-apps/plugin-store";
import { logger } from "@/utils/logger";
import { reciprocalRankFusion, FusionSource } from "./search-fusion";

/**
 * 文本分块函数，用于将大文本分成小块
 * 升级版：集成 Markdown AST 解析与语义感知分块
 */
export async function chunkText(
  text: string, 
  options: ChunkerOptions,
  filename: string = "unknown"
): Promise<string[]> {
  const chunker = new MarkdownChunker(options);
  return await chunker.chunk(text, filename);
}

/**
 * 处理单个Markdown文件，计算向量并存储到数据库
 */
export async function processMarkdownFile(
  relativeFilePath: string, 
  fileContent?: string
): Promise<boolean> {
  try {
    let content: string
    if (fileContent) {
      content = fileContent
    } else {
      // 统一使用项目标准的路径解析逻辑
      const { path: resolvedPath, baseDir } = await getFilePathOptions(relativeFilePath)
      content = await readTextFile(resolvedPath, { baseDir })
    }
    
    const store = await Store.load('store.json')
    const chunkSize = await store.get<number>('ragChunkSize') || 1000;
    const chunkOverlap = await store.get<number>('ragChunkOverlap') || 200;
    const enableSemantic = await store.get<boolean>('ragEnableSemantic') || false;
    const semanticThreshold = await store.get<number>('ragSemanticThreshold') || 0.7;
    
    // 数据库中统一存储逻辑相对路径作为 filename
    const filename = relativeFilePath;
    
    const chunks = await chunkText(content, {
      chunkSize,
      chunkOverlap,
      enableSemantic,
      semanticThreshold
    }, filename);
    
    // 先删除该文件的旧记录
    await deleteVectorDocumentsByFilename(filename);
    
    // 处理每个文本块
    logger.rag.info(`⏳ [向量索引] 正在为 ${chunks.length} 个分块生成向量...`);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // 计算嵌入向量 (批量处理时开启静默模式)
      const embedding = await fetchEmbedding(chunk, false, true);
      
      if (!embedding) {
        logger.rag.error(`❌ 无法计算文件 ${filename} 第 ${i+1} 块的向量。分块内容如下：\n---\n${chunk}\n---`);
        continue;
      }
      
      // 保存到数据库
      await upsertVectorDocument({
        filename,
        chunk_id: i,
        content: chunk,
        embedding: JSON.stringify(embedding),
        updated_at: Date.now()
      });
    }
    
    return true;
  } catch (error) {
    logger.rag.error(`处理文件 ${relativeFilePath} 失败:`, error);
    return false;
  }
}

/**
 * 获取工作区目录树
 */
async function getWorkspaceFiles(): Promise<DirTree[]> {
  const workspace = await getWorkspacePath();
  
  // 递归处理目录的辅助函数
  async function processDirectory(dirPath: string, useCustomPath: boolean): Promise<DirTree[]> {
    let entries: DirEntry[];
    
    if (useCustomPath) {
      entries = await readDir(dirPath);
    } else {
      entries = await readDir(dirPath, { baseDir: BaseDirectory.AppData });
    }
    
    const result: DirTree[] = [];
    
    for (const entry of entries) {
      if (entry.name === '.DS_Store' || entry.name.startsWith('.')) continue;
      if (!entry.isDirectory && !entry.name.endsWith('.md')) continue;
      
      // 创建DirTree对象
      const item: DirTree = {
        name: entry.name,
        isFile: !entry.isDirectory,
        isDirectory: entry.isDirectory,
        isSymlink: false, // Tauri FS API不直接提供isSymlink
        children: [],
        isLocale: true,
        isEditing: false
      };
      
      // 如果是目录，递归读取子目录
      if (entry.isDirectory) {
        const childPath = await join(dirPath, entry.name);
        // 递归处理子目录
        item.children = await processDirectory(childPath, useCustomPath);
        
        // 设置父级关系
        item.children.forEach(child => {
          child.parent = item;
        });
      }
      
      result.push(item);
    }
    
    return result;
  }
  
  // 开始处理根目录
  const rootPath = workspace.isCustom ? workspace.path : 'article';
  return await processDirectory(rootPath, workspace.isCustom);
}

/**
 * 处理工作区中的所有Markdown文件
 */
export async function processAllMarkdownFiles(): Promise<{
  total: number;
  success: number;
  failed: number;
}> {
  try {
    // 获取工作区中的所有文件
    const fileTree = await getWorkspaceFiles();
    
    // 统计结果
    const result = {
      total: 0,
      success: 0,
      failed: 0
    };
    
    // 记录本次扫描到的所有现有文件的逻辑相对路径
    const existingFiles = new Set<string>();
    
    // 递归处理文件树
    async function processTree(tree: DirTree[]): Promise<void> {
      for (const item of tree) {
        if (item.isFile && item.name.endsWith('.md')) {
          result.total++;
          // 获取逻辑路径（相对路径）
          const logicalPath = getLogicalPath(item);
          existingFiles.add(logicalPath);
          const success = await processMarkdownFile(logicalPath);
          if (success) {
            result.success++;
          } else {
            result.failed++;
          }
        }
        
        // 递归处理子目录
        if (item.children && item.children.length > 0) {
          await processTree(item.children);
        }
      }
    }
    await processTree(fileTree);
    
    // 清理向量数据库中已不存在于当前工作区的旧文件向量
    const dbDocs = await getAllVectorDocumentFilenames();
    for (const doc of dbDocs) {
      if (!existingFiles.has(doc.filename)) {
        logger.rag.info(`文件 ${doc.filename} 在工作区中已不存在，正在清理其旧向量数据`);
        await deleteVectorDocumentsByFilename(doc.filename);
      }
    }
    
    return result;
  } catch (error) {
    logger.rag.error('处理工作区Markdown文件失败:', error);
    throw error;
  }
}

/**
 * 根据 DirTree 项获取逻辑上的相对路径（作为系统内的唯一标识）
 */
function getLogicalPath(item: DirTree): string {
  const parts: string[] = []
  let current: DirTree | undefined = item
  
  while (current) {
    parts.unshift(current.name)
    current = current.parent
  }
  
  return parts.join('/')
}

/**
 * 为fuzzy_search准备的搜索项结构
 */
interface SearchItem {
  id?: string;
  desc?: string;
  title?: string;
  article?: string;
  url?: string;
  search_type?: string;
  score?: number;
  matches?: {
    key: string;
    indices: [number, number][];
    value: string;
  }[];
}

/**
 * fuzzy_search返回的结果结构
 */
interface FuzzySearchResult {
  item: SearchItem;
  refindex: number;
  score: number;
  matches: {
    key: string;
    indices: [number, number][];
    value: string;
  }[];
}

/**
 * 废弃的旧方法: 从工作区中收集所有Markdown文件内容，用于模糊搜索
 * 现在由于使用了 FTS5，不再需要将全量内容加载到内存
 */
async function _collectMarkdownContentsDeprecated(): Promise<SearchItem[]> {
  try {
    // 获取工作区中的所有文件
    const fileTree = await getWorkspaceFiles();
    const items: SearchItem[] = [];
    
    // 递归处理文件树
    async function processTree(tree: DirTree[]): Promise<void> {
      for (const item of tree) {
        if (item.isFile && item.name.endsWith('.md')) {
          // 获取完整路径
          const filePath = await getFilePath(item);
          
          try {
            // 读取文件内容
            let content = '';
            const workspace = await getWorkspacePath();
            if (workspace.isCustom) {
              content = await readTextFile(filePath);
            } else {
              const { path, baseDir } = await getFilePathOptions(filePath);
              content = await readTextFile(path, { baseDir });
            }
            
            items.push({
              id: await toWorkspaceRelativePath(filePath),
              title: item.name,
              article: content,
              search_type: 'markdown'
            });
          } catch (error) {
            logger.rag.error(`读取文件 ${filePath} 内容失败:`, error);
          }
        }
        
        // 递归处理子目录
        if (item.children && item.children.length > 0) {
          await processTree(item.children);
        }
      }
    }
    
    await processTree(fileTree);
    return items;
  } catch (error) {
    logger.rag.error('收集Markdown内容失败:', error);
    return [];
  }
}

/**
 * 关键词及其权重类型定义
 */
export interface Keyword {
  text: string;
  weight: number;
}

/**
 * 检索到的文档片段结构
 */
export interface RetrievedDoc {
  filename: string;
  content: string;
  score: number;
  type?: string;
  keyword?: string;
  item?: { path: string };
}

/**
 * 根据关键词数组获取检索到的文档列表
 * @param query 
 * @param keywords 
 */
export async function getRetrievedDocs(query: string, keywords: Keyword[]): Promise<RetrievedDoc[]> {
  try {
    const store = await Store.load('store.json');
    const resultCount = await store.get<number>('ragResultCount') || 5;
    const similarityThreshold = await store.get<number>('ragSimilarityThreshold') || 0.5;
    const allContexts: { filename: string, content: string, score: number, keyword?: string, type?: string, item?: { path: string } }[] = [];
    const isMeaningfulQuery = query.trim().length > 2 && /[\u4e00-\u9fa5\u3040-\u30ffa-zA-Z0-9]/i.test(query);

    if (!isMeaningfulQuery) {
      logger.rag.debug('🔍 [意图解析] 查询过短或无意义，跳过向量检索。');
    } else {
      logger.rag.debug(`🔍 [意图解析] 原始查询: "${query}"`);
    }
    // ==========================================
    // 核心改进 1：使用【完整原句】进行一次向量检索 (最重要)
    // ==========================================
    if (isMeaningfulQuery && query && query.trim().length > 0) {
      const queryEmbedding = await fetchEmbedding(query, false, true); // 搜索时静默 Embedding 日志
      if (queryEmbedding) {
        let similarDocs = await getSimilarDocuments(queryEmbedding, resultCount, similarityThreshold);
        logger.rag.info(`🛰️ [多路检索] 向量路径命中了 ${similarDocs.length} 个片段`);

        if (similarDocs.length > 0) {
          for (const doc of similarDocs) {
            logger.rag.debug(`   - 命中: ${doc.filename} (Score: ${doc.similarity?.toFixed(4)})`);
            allContexts.push({
              filename: doc.filename,
              content: doc.content,
              score: doc.similarity || 0,
              path: doc.filename,
              chunk_id: (doc as any).chunk_id || 0,
              type: 'vector'
            });
          }
        }
      }
    }

    // ==========================================
    // 核心改进 2：过滤垃圾关键词
    // ==========================================
    // 过滤掉单字、限制权重上限
    const validKeywords = keywords
        .filter(k => k.text.length > 1 && k.weight < 1000)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);

    // ==========================================
    // 核心改进 3：使用 FTS5 (BM25) 进行全量关键词匹配 (替代原有的 Fuzzy Path)
    // ==========================================
    if (validKeywords.length > 0) {
      logger.rag.info(`🛰️ [多路检索] FTS5 路径正在匹配 ${validKeywords.length} 个关键词...`);
      for (const keyword of validKeywords) {
        const ftsResults = await getFtsDocuments(keyword.text, 15);
        if (ftsResults.length > 0) {
          logger.rag.debug(`   - 关键词 "${keyword.text}" (FTS5) 命中 ${ftsResults.length} 个片段`);
        }

        for (const doc of ftsResults) {
          // 归一化权重处理
          const normalizedWeight = Math.min(keyword.weight, 2.0);
          const finalScore = doc.score * normalizedWeight;

          allContexts.push({
            filename: doc.filename,
            path: doc.filename, // FTS5 存的是相对路径
            content: doc.content,
            score: finalScore,
            chunk_id: (doc as any).chunk_id || 0,
            keyword: keyword.text,
            type: 'fts',
            item: { path: doc.filename }
          });
        }
      }
    }

    if (allContexts.length === 0) return [];

    // 使用 RRF 合并不同检索源的结果
    const vectorResults = allContexts.filter(c => c.type === 'vector').sort((a, b) => b.score - a.score);
    const ftsResults = allContexts.filter(c => c.type === 'fts').sort((a, b) => b.score - a.score);

    const sources: FusionSource[] = [
        {
            name: 'fts',
            weight: 1.2, // 给 FTS5 (精准匹配) 略高的权重，解决关键词盲态
            items: ftsResults.map((r) => ({
                id: `${r.filename}#${(r as any).chunk_id || 0}`,
                score: r.score,
                data: { ...r, _source: 'fts' }
            }))
        },
        {
            name: 'vector',
            weight: 1.0,
            items: vectorResults.map((r) => ({
                id: `${r.filename}#${(r as any).chunk_id || 0}`,
                score: r.score,
                data: { ...r, _source: 'vector' }
            }))
        }
    ];

    let uniqueContexts = reciprocalRankFusion(sources, 60, 20);
    logger.rag.debug(`⚖️ [排名融合] RRF 融合完成，输出 top ${uniqueContexts.length} 个候选`);

    // 确保返回的结果中 filename 只是展示名，path 是逻辑路径
    uniqueContexts = uniqueContexts.map(ctx => ({
      ...ctx,
      // 如果 filename 包含路径分隔符，说明它是存储的相对路径，提取出最后的成分作为展示名
      filename: ctx.filename.includes('/') || ctx.filename.includes('\\') 
          ? ctx.filename.split(/[/\\]/).pop() 
          : ctx.filename,
      path: ctx.path || ctx.filename // 保证 path 始终可用
    }));

    // ==========================================
    // 核心改进 4：【精排阶段】对混合结果进行二次重排
    // ==========================================
    // 如果启用重排模型，对 RRF 筛选出的前 N 个结果进行最终的语意校验
    if (uniqueContexts.length > 0) {
      const rerankAvailable = await checkRerankModelAvailable();
      if (rerankAvailable) {
        logger.rag.info('⚖️ [精排阶段] 正在调用 Rerank 模型进行二次校准...');
        const candidates = uniqueContexts.slice(0, 10).map((ctx, idx) => ({
          id: idx,
          filename: ctx.filename,
          content: ctx.content,
          similarity: ctx.score,
          path: ctx.path,
          originalType: ctx.type // 保留原始召回源信息
        }));
        
        const reranked = await rerankDocuments(query, candidates);
        
        // 核心改进：精排置信度过滤 (阈值校准)
        // 过滤掉精排得分极低 (< 0.01) 的语义噪音
        const filteredReranked = reranked.filter(r => r.similarity >= 0.01);
        
        const rerankedCtxs = filteredReranked.map(r => ({
          filename: r.filename,
          content: r.content,
          score: r.similarity,
          path: (r as any).path || r.filename,
          type: 'rerank',
          originalType: (r as any).originalType // 传递原始类型用于指标统计
        }));
        
        const remaining = uniqueContexts.slice(10);
        uniqueContexts = [...rerankedCtxs, ...remaining];
        logger.rag.debug(`⚖️ [精排阶段] 重排完成，过滤掉 ${reranked.length - filteredReranked.length} 个低置信度噪音，首位结果: ${uniqueContexts[0]?.filename}`);
      }
    }

    return uniqueContexts.slice(0, resultCount);
  } catch (error) {
    logger.rag.error('获取查询文档失败:', error);
    return [];
  }
}

/**
 * 根据关键词数组获取格式化后的上下文字符串
 * @param query
 * @param keywords 关键词数组，每个元素包含关键词文本和权重
 */
export async function getContextForQuery(query: string, keywords: Keyword[]): Promise<string> {
  const docs = await getRetrievedDocs(query, keywords);
  if (docs.length === 0) return '';
  return docs.map(ctx => `文件：${ctx.filename}\n${ctx.content}\n`).join('\n---\n\n');
}

/**
 * 当文件被更新时处理，更新向量数据库
 */
export async function handleFileUpdate(filename: string, content: string): Promise<void> {
  if (!filename.endsWith('.md')) return;
  
  try {
    await processMarkdownFile(filename, content);
  } catch (error) {
    logger.rag.error(`更新文件 ${filename} 的向量失败:`, error);
  }
}

/**
 * 检查是否有嵌入模型可用
 * @returns true if available, or error message string if failed
 */
export async function checkEmbeddingModelAvailable(): Promise<boolean | string> {
  try {
    // 尝试计算一个简单文本的向量，传入 true 以抛出错误
    const embedding = await fetchEmbedding('测试嵌入模型', true);
    return !!embedding;
  } catch (error) {
    logger.rag.error('嵌入模型检查失败:', error);
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * 显示向量处理进度的toast
 */
export function showVectorProcessingToast(message: string) {
  toast({
    title: '向量数据库更新',
    description: message,
    duration: 1500,
  });
}

/**
 * 检索性能指标
 */
export interface RetrievalMetrics {
  totalLatencyMs: number
  vectorCount: number
  fuzzyCount: number
  rerankApplied: boolean
}

/**
 * 带性能指标采集的检索包装函数
 * 内部调用 getRetrievedDocs() 并附加各阶段耗时与命中统计
 */
export async function getRetrievedDocsWithMetrics(
  query: string,
  keywords: Keyword[]
): Promise<{ docs: RetrievedDoc[], metrics: RetrievalMetrics }> {
  const startTime = performance.now()

  const docs = await getRetrievedDocs(query, keywords)

  const endTime = performance.now()

  // 从结果中统计各类型命中数 (修正：如果被重排序过，应优先查找 originalType)
  const vectorCount = docs.filter(d => (d.type === 'vector' || (d as any).originalType === 'vector')).length
  const ftsCount = docs.filter(d => (d.type === 'fts' || (d as any).originalType === 'fts')).length
  const rerankApplied = docs.some(d => d.type === 'rerank')

  const metrics: RetrievalMetrics = {
    totalLatencyMs: Math.round(endTime - startTime),
    vectorCount,
    fuzzyCount: ftsCount, // 映射到旧的指标字段以便前端展示
    rerankApplied
  }

  logger.rag.debug(
    `检索完成 — 耗时: ${metrics.totalLatencyMs}ms, ` +
    `向量: ${vectorCount}, FTS5: ${ftsCount}, Rerank: ${rerankApplied}`
  )

  return { docs, metrics }
}

