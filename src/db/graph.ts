import { getDb } from "./index"
import { logger } from '@/utils/logger'

export interface Graph {
  articlePath: string
  content: string
  updatedAt: number
  diagramType?: string
  granularity?: string
}

// 创建 graphs 表
export async function initGraphDb() {
  const db = getDb()
  if (!db) {
    logger.db.error('[DB Graph] initGraphDb 失败: db 为 null')
    return
  }
  
  // 初始化主表
  await db.execute(`
    create table if not exists graphs (
      articlePath text primary key,
      content text not null,
      updatedAt integer not null
    )
  `)

  // 尝试添加新列 (SQLite 不支持一次性添加多列，分两次尝试)
  try {
    await db.execute("ALTER TABLE graphs ADD COLUMN diagramType TEXT")
    logger.db.info('[DB Graph] 已新增 diagramType 列')
  } catch (e) {
    // 忽略已存在的列错误
  }

  try {
    await db.execute("ALTER TABLE graphs ADD COLUMN granularity TEXT")
    logger.db.info('[DB Graph] 已新增 granularity 列')
  } catch (e) {
    // 忽略已存在的列错误
  }
}

// 插入或更新图谱
export async function upsertGraph(graph: Graph) {
  const db = getDb()
  if (!db) throw new Error('Database not initialized')
  return await db.execute(
    "insert or replace into graphs (articlePath, content, updatedAt, diagramType, granularity) values ($1, $2, $3, $4, $5)",
    [graph.articlePath, graph.content, graph.updatedAt, graph.diagramType || 'auto', graph.granularity || 'medium']
  )
}

// 根据路径获取图谱
export async function getGraphByPath(articlePath: string) {
  const db = getDb()
  if (!db) {
    logger.db.warn('[DB Graph] getGraphByPath 被调用，但 db 为 null')
    return null
  }
  const result = await db.select<Graph[]>(
    "select * from graphs where articlePath = $1",
    [articlePath]
  )
  return result.length > 0 ? result[0] : null
}

// 删除图谱
export async function deleteGraph(articlePath: string) {
  const db = getDb()
  if (!db) throw new Error('Database not initialized')
  return await db.execute(
    "delete from graphs where articlePath = $1",
    [articlePath]
  )
}
