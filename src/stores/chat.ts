import {defineStore} from 'pinia'
import { ref, watch } from 'vue'
import {
    type Chat,
    clearChatsBySessionId,
    deleteChat as deleteChatDb,
    getChats,
    insertChat,
    updateChat as updateChatDb
} from '@/db/chats'
import {
    type ChatSession,
    insertChatSession,
    getChatSessions,
    updateChatSession,
    deleteChatSession,
    updateChatSessionTime
} from '@/db/chat_sessions'
import { getDb } from '@/db'
import { logger } from '@/utils/logger'
import { useWorkspaceStore } from '@/stores/workspace'

export const useChatStore = defineStore('chat', () => {
    // 基础状态
    const chats = ref<Chat[]>([])
    const sessions = ref<ChatSession[]>([])
    const currentSessionId = ref<number | null>(null)
    
    // UI状态
    const loading = ref(false)
    const isPlaceholderEnabled = ref(true)
    const syncState = ref(false)
    const lastSyncTime = ref('')
    const useThink = ref(false)

    // AI 编辑模式状态
    const isEditMode = ref(false)
    const editSelection = ref('')
    const editFullContent = ref('')
    const editFilePath = ref('')

    // 初始化整个聊天环境
    const init = async () => {
        logger.assistant.debug('ChatStore.init() 开始执行...')
        const db = getDb()
        logger.assistant.debug('ChatStore.init(): 数据库已就绪，准备拉取会话历史...')

        loading.value = true
        try {
            await fetchSessions()
            logger.assistant.debug(`ChatStore.init(): 会话列表拉取完成, 数量: ${sessions.value.length}`)
            
            // 如果有会话，默认加载第一个（最近的）
            if (sessions.value.length > 0) {
                logger.assistant.debug(`ChatStore.init(): 默认加载第一个会话 [ID: ${sessions.value[0].id}]`)
                await switchSession(sessions.value[0].id)
            } else {
                logger.assistant.debug('ChatStore.init(): 当前工作区没有会话历史')
                currentSessionId.value = null
                chats.value = []
            }
        } catch (e) {
            logger.assistant.error('ChatStore.init() 发生异常:', e)
        } finally {
            loading.value = false
            logger.assistant.debug('ChatStore.init() 流程结束')
        }
    }

    // 获取会话列表
    const fetchSessions = async () => {
        sessions.value = await getChatSessions()
    }

    // 新建会话
    const createSession = async (title: string = 'New Chat') => {
        const res = await insertChatSession({
            title
        })
        if (res.lastInsertId) {
            await fetchSessions()
            await switchSession(res.lastInsertId)
            return res.lastInsertId
        }
        return null
    }

    // 删除会话
    const removeSession = async (id: number) => {
        await deleteChatSession(id)
        await clearChatsBySessionId(id) // 同步清理此会话下的所有聊天
        await fetchSessions()
        
        // 如果删除的是当前会话，自动切换到上一个或置空
        if (currentSessionId.value === id) {
            if (sessions.value.length > 0) {
                await switchSession(sessions.value[0].id)
            } else {
                currentSessionId.value = null
                chats.value = []
            }
        }
    }

    // 切换会话
    const switchSession = async (id: number) => {
        logger.assistant.debug(`ChatStore.switchSession(${id}): 开始加载聊天记录...`)
        currentSessionId.value = id
        chats.value = await getChats(id)
        logger.assistant.debug(`ChatStore.switchSession(${id}): 记录加载完成, 数量: ${chats.value.length}`)
    }

    // 更新会话标题
    const editSessionTitle = async (id: number, title: string) => {
        const session = sessions.value.find((s: ChatSession) => s.id === id)
        if (session) {
            await updateChatSession({
                id,
                title,
                updatedAt: Date.now()
            })
            await fetchSessions()
        }
    }

    // ---------------------------------------------
    // Chats 操作
    // ---------------------------------------------

    // 插入聊天
    const insert = async (chat: Omit<Chat, 'id' | 'createdAt' | 'sessionId'>) => {
        let sessionId = currentSessionId.value
        
        // 如果当前没有会话，自动创建一个新会话
        if (!sessionId) {
            let title = 'New Chat'
            if (chat.role === 'user' && chat.content) {
                // 取开头作为标题
                title = chat.content.slice(0, 15) + (chat.content.length > 15 ? '...' : '')
            }
            const newId = await createSession(title)
            if (newId) {
                sessionId = newId
            } else { return null }
        } else {
            // Check if this is the first real user message in an existing empty/default session
            const session = sessions.value.find((s: ChatSession) => s.id === sessionId)
            if (session && chats.value.length === 0 && chat.role === 'user' && chat.content) {
                const newTitle = chat.content.slice(0, 15) + (chat.content.length > 15 ? '...' : '')
                await editSessionTitle(sessionId!, newTitle)
            } else {
                // 如果有会话插入消息，更新一下会话时间，以便排序置顶
                await updateChatSessionTime(sessionId!)
                await fetchSessions() // 刷新列表以反应顺序变化
            }
        }

        if (!sessionId) {
            logger.assistant.error("Null sessionId")
            return null
        }

        const res = await insertChat({
            ...chat,
            sessionId: sessionId
        })
        
        if (res.lastInsertId) {
            const newChat: Chat = {
                id: res.lastInsertId,
                sessionId: sessionId,
                createdAt: Date.now(),
                ...chat
            }
            chats.value.push(newChat)
            return newChat
        }
        return null
    }

    // 更新聊天
    const updateChat = (chat: Chat) => {
        const index = chats.value.findIndex((item: Chat) => item.id === chat.id)
        if (index !== -1) {
            chats.value[index] = Object.assign({}, chats.value[index], chat)
        }
    }

    // 保存聊天（持久化）
    const saveChat = async (chat: Chat, isSave = false) => {
        updateChat(chat)
        if (isSave) {
            await updateChatDb(chat)
        }
    }

    // 删除聊天
    const deleteChat = async (id: number) => {
        chats.value = chats.value.filter((item: Chat) => item.id !== id)
        await deleteChatDb(id)
    }
    
    // 清空当前会话
    const clearCurrentSession = async () => {
        if (!currentSessionId.value) return
        chats.value = []
        await clearChatsBySessionId(currentSessionId.value)
    }


    // 更新编辑上下文
    const setEditContext = (selection: string, fullContent: string, filePath: string) => {
        editSelection.value = selection
        editFullContent.value = fullContent
        editFilePath.value = filePath
    }

    // 切换编辑模式
    const toggleEditMode = (val?: boolean) => {
        isEditMode.value = val !== undefined ? val : !isEditMode.value
    }

    const setUseThink = (val: boolean) => {
        useThink.value = val
    }

    // 监听工作区状态，自动初始化
    const workspaceStore = useWorkspaceStore()
    watch(() => workspaceStore.activeWorkspace, async (newVal) => {
        logger.assistant.debug('[ChatStore Watch] workspaceStore.activeWorkspace 变化:', newVal?.name || 'NULL')
        if (newVal) {
            logger.assistant.debug('[ChatStore Watch] 准备执行 init()...')
            await init()
        } else {
            logger.assistant.debug('[ChatStore Watch] 清空聊天状态 (新工作区为 NULL)')
            sessions.value = []
            chats.value = []
            currentSessionId.value = null
        }
    }, { immediate: true })

    return {
        chats,
        sessions,
        currentSessionId,
        loading,
        isPlaceholderEnabled,
        syncState,
        lastSyncTime,
        init,
        fetchSessions,
        createSession,
        removeSession,
        switchSession,
        editSessionTitle,
        insert,
        updateChat,
        saveChat,
        deleteChat,
        clearCurrentSession,
        isEditMode,
        editSelection,
        editFullContent,
        editFilePath,
        setEditContext,
        toggleEditMode,
        useThink,
        setUseThink
    }
})
