import { getDb } from "./index"
import { logger } from '@/utils/logger'

export interface ChatSession {
  id: number
  title: string
  createdAt: number
  updatedAt: number
}

// 创建 chat_sessions 表
export async function initChatSessionsDb() {
  const db = getDb()
  if (!db) {
    logger.db.error('[DB Session] initChatSessionsDb 失败: db 为 null')
    return
  }
  await db.execute(`
    create table if not exists chat_sessions (
                                       id integer primary key autoincrement,
                                       title text not null,
                                       createdAt integer not null,
                                       updatedAt integer not null
    )
  `)
}

// 插入一条 chat_session
export async function insertChatSession(session: Omit<ChatSession, 'id' | 'createdAt' | 'updatedAt'>) {
  const db = getDb()
  if (!db) throw new Error('Database not initialized')
  const now = Date.now()
  return await db.execute(
      "insert into chat_sessions (title, createdAt, updatedAt) values ($1, $2, $3)",
      [session.title, now, now]
  )
}

// 获取所有 chat_sessions
export async function getChatSessions() {
  const db = getDb()
  if (!db) {
    logger.db.warn('[DB Session] getChatSessions 被调用，但 db 为 null')
    return []
  }
  const result = await db.select<ChatSession[]>(
      "select * from chat_sessions order by updatedAt desc"
  )
  logger.db.debug(`[DB Session] 获取会话列表成功，SQL 返回条数: ${result.length}`)
  return result
}

// 更新一条 chat_session 的标题或更新时间
export async function updateChatSession(session: Omit<ChatSession, 'createdAt'>) {
  const db = getDb()
  if (!db) throw new Error('Database not initialized')
  const now = Date.now()
  return await db.execute(
      "update chat_sessions set title = $1, updatedAt = $2 where id = $3",
      [session.title, now, session.id]
  )
}

// 更新一条 chat_session 的时间
export async function updateChatSessionTime(id: number) {
  const db = getDb()
  if (!db) throw new Error('Database not initialized')
  const now = Date.now()
  return await db.execute(
      "update chat_sessions set updatedAt = $1 where id = $2",
      [now, id]
  )
}

// 删除一条 chat_session
export async function deleteChatSession(id: number) {
  const db = getDb()
  if (!db) throw new Error('Database not initialized')
  return await db.execute(
      "delete from chat_sessions where id = $1",
      [id]
  )
}

