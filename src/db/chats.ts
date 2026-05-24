import { getDb } from "./index"

export type Role = 'system' | 'user' | 'assistant'
export type ChatType = 'chat' | 'note' | 'clipboard' | 'clear'

export interface Chat {
  id: number
  sessionId: number
  content?: string
  role: Role
  type: ChatType
  image?: string
  createdAt: number
}

// 创建 chats 表
export async function initChatsDb() {
  const db = getDb()
  


  await db.execute(`
    create table if not exists chats (
                                       id integer primary key autoincrement,
                                       sessionId integer not null,
                                       content text default null,
                                       role text not null,
                                       type text not null,
                                       image text default null,
                                       createdAt integer not null
    )
  `)
}

// 插入一条 chat
export async function insertChat(chat: Omit<Chat, 'id' | 'createdAt'>) {
  const db = getDb()
  const createdAt = Date.now();
  return await db.execute(
      "insert into chats (sessionId, content, role, type, image, createdAt) values ($1, $2, $3, $4, $5, $6)",
      [chat.sessionId, chat.content, chat.role, chat.type, chat.image, createdAt])
}

// 获取所有 chats
export async function getChats(sessionId: number) {
  const db = getDb()
  const result = await db.select<Chat[]>(
      "select * from chats where sessionId = $1 order by createdAt",
      [sessionId]
  )
  return result
}

// 获取所有 chats（用于同步）
export async function getAllChats() {
  const db = getDb()
  const result = await db.select<Chat[]>(
      "select * from chats order by createdAt",
      []
  )
  return result
}

// 插入多条 chat（用于同步）
export async function insertChats(chats: Chat[]) {
  const db = getDb()
  for (const chat of chats) {
    await db.execute(
        "insert into chats (sessionId, content, role, type, image, createdAt) values ($1, $2, $3, $4, $5, $6)",
        [chat.sessionId, chat.content, chat.role, chat.type, chat.image, chat.createdAt]
    )
  }
}

// 删除所有 chats（用于同步）
export async function deleteAllChats() {
  const db = getDb()
  return await db.execute(
      "delete from chats",
      []
  )
}

// 更新一条 chat
export async function updateChat(chat: Chat) {
  const db = getDb()
  return await db.execute(
      "update chats set content = $1, role = $2, type = $3, image = $4 where id = $5",
      [chat.content, chat.role, chat.type, chat.image, chat.id])
}

// 清空 sessionId 下的所有 chats
export async function clearChatsBySessionId(sessionId: number) {
  const db = getDb()
  return await db.execute(
      "delete from chats where sessionId = $1",
      [sessionId])
}


// 删除一条 chat
export async function deleteChat(id: number) {
  const db = getDb()
  return await db.execute(
      "delete from chats where id = $1",
      [id])
}