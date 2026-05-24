<template>
  <div class="p-4 border-t bg-background">
    <!-- RAG 显式授权确认区域 -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform translate-y-4 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform translate-y-4 opacity-0"
    >
      <div v-if="isConfirmingRag" class="mx-[5px] mb-4 space-y-2">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2 text-xs font-medium text-primary">
            <AlertCircle class="h-3.5 w-3.5" />
            <span>{{ t('record.chat.rag.confirmTitle') }}</span>
          </div>
          <Button variant="ghost" size="icon" class="h-6 w-6 hover:bg-destructive/10 hover:text-destructive transition-colors" @click="cancelRag">
            <X class="h-3 w-3" />
          </Button>
        </div>
        
        <div class="grid gap-2 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
          <div 
            v-for="(doc, index) in retrievedDocs" 
            :key="doc.filename + index"
            class="group relative flex flex-col p-3 bg-muted/30 rounded-xl border border-border/50 hover:border-primary/40 hover:bg-muted/50 cursor-pointer transition-all duration-200 shadow-sm overflow-hidden"
            @click="navigateToDoc(doc)"
          >
            <!-- 单个移除按钮 -->
            <Button 
              variant="ghost" 
              size="icon" 
              class="absolute top-0 right-0 h-6 w-6 rounded-full bg-background/50 backdrop-blur-sm border opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-white transition-all z-10"
              @click.stop="removeDoc(index)"
            >
              <X class="h-3 w-3" />
            </Button>

            <div class="flex items-center gap-2 mb-1.5">
              <div class="p-1 bg-primary/10 rounded-md">
                <FileText class="h-3.5 w-3.5 text-primary" />
              </div>
              <span class="text-sm font-semibold truncate flex-1 pr-6">{{ doc.filename }}</span>
              <span class="text-[10px] font-medium px-1.5 py-0 bg-primary/5 text-primary/70 rounded-full border border-primary/10">
                {{ t('record.chat.rag.relevance') }}: {{ (doc.score * 100).toFixed(0) }}%
              </span>
            </div>
            <p class="text-xs text-muted-foreground line-clamp-2 leading-relaxed pl-7">
              {{ doc.content.slice(0, 50).replace(/\n/g, ' ').trim() }}{{ doc.content.length > 50 ? '...' : '' }}
            </p>
          </div>
        </div>

        <div class="text-[10px] text-center text-muted-foreground pt-1 flex items-center justify-center gap-1">
          <span>{{ t('record.chat.rag.confirmHint') }}</span>
        </div>
      </div>
    </Transition>

    <!-- AI 编辑模式上下文提示 -->
    <div v-if="chatStore.isEditMode && articleStore.activeFilePath" class="mb-2 px-1 flex items-center justify-between">
      <div class="flex items-center gap-2 text-[10px] font-medium text-purple-500 animate-pulse">
        <Sparkles class="h-3 w-3" />
        <span v-if="chatStore.editSelection">{{ t('record.chat.editMode.editingSelection', { length: chatStore.editSelection.length }) }}</span>
        <span v-else>{{ t('record.chat.editMode.editingFullFile') }}</span>
      </div>
      <Button variant="ghost" size="xs" class="h-5 text-[10px] text-muted-foreground hover:text-foreground" @click="chatStore.toggleEditMode(false)">
        {{ t('record.chat.editMode.close') }}
      </Button>
    </div>

    <div class="relative">
      <Textarea 
        v-model="input" 
        :placeholder="isConfirmingRag ? '点击发送或 Enter 确认...' : t('record.chat.input.placeholder')" 
        class="min-h-[80px] pr-12 pl-4 resize-none focus-visible:ring-1 transition-all"
        :class="{ 'border-primary ring-1 ring-primary/20': isConfirmingRag }"
        @keydown.enter="handleEnter"
      />
      <Button 
        class="absolute bottom-2 right-2 h-8 w-8 transition-all" 
        :class="{ 'bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 scale-110': isConfirmingRag }"
        size="icon" 
        :disabled="!input.trim() || isSending"
        @click="sendMessage"
      >
        <Send class="h-4 w-4" />
      </Button>
      
      <!-- 语音输入按钮 -->
      <VoiceInputButton
        class="absolute bottom-2 right-20 h-8 w-8"
        :on-result="handleVoiceResult"
      />

      <!-- AI 编辑模式切换按钮 -->
      <Button 
        variant="ghost" 
        size="icon" 
        class="absolute bottom-2 right-11 h-8 w-8 transition-all hover:bg-purple-500/10 hover:text-purple-500" 
        :class="{ 'text-purple-500 bg-purple-500/10': chatStore.isEditMode }"
        @click="chatStore.toggleEditMode()"
        :title="t('record.chat.editMode.title')"
      >
        <Wand2 class="h-4 w-4" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useVectorStore } from '@/stores/vector'
import { useI18n } from '@/composables/useI18n'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Send, FileText, X, AlertCircle, Wand2, Sparkles } from 'lucide-vue-next'
import VoiceInputButton from '@/components/ui/speech/VoiceInputButton.vue'
import { fetchAiStream } from '@/lib/ai'
import { getRetrievedDocs, type RetrievedDoc } from '@/lib/rag'
import { logger } from '@/utils/logger'
import { invoke } from '@tauri-apps/api/core'
import { storeToRefs } from 'pinia'
import { useToast } from '@/composables/useToast'
import { useArticleStore } from '@/stores/article'
import { useWorkspaceLayoutStore } from '@/stores/workspaceLayout'
import { useEvaluationStore } from '@/stores/evaluation'

const input = ref('')
const isSending = ref(false)
const isConfirmingRag = ref(false)
const retrievedDocs = ref<RetrievedDoc[]>([])
const pendingContent = ref('')

const chatStore = useChatStore()
const vectorStore = useVectorStore()
const articleStore = useArticleStore()
const layoutStore = useWorkspaceLayoutStore()
const { t } = useI18n()
const { info, error } = useToast()
const evalStore = useEvaluationStore()
const { isRagEnabled, documentCount } = storeToRefs(vectorStore)

const handleVoiceResult = (text: string) => {
  // 将识别结果追加到输入框
  input.value = input.value ? `${input.value} ${text}` : text
}

const handleEnter = (e: KeyboardEvent) => {
  if (!e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const cancelRag = () => {
  isConfirmingRag.value = false
  retrievedDocs.value = []
  pendingContent.value = ''
}

const removeDoc = (index: number) => {
  retrievedDocs.value.splice(index, 1)
  if (retrievedDocs.value.length === 0) {
    cancelRag()
  }
}

const navigateToDoc = async (doc: RetrievedDoc) => {
  try {
    const path = doc.path || doc.filename
    
    // 确保已加载所有文章
    if (articleStore.allArticle.length === 0) {
      await articleStore.loadAllArticle()
    }
    
    // 直接通过相对路径匹配（精准匹配）
    const match = articleStore.allArticle.find(a => a.path === path)
    
    if (match) {
      await layoutStore.openFile(match.path)
      info(t('record.chat.toast.viewingNote', { filename: doc.filename }))
    } else {
      // 兜底逻辑：如果精准匹配失败，尝试 endsWith（处理旧索引数据）
      const fuzzyMatch = articleStore.allArticle.find(a => a.path.endsWith(doc.filename))
      if (fuzzyMatch) {
         await layoutStore.openFile(fuzzyMatch.path)
         info(t('record.chat.toast.viewingNote', { filename: doc.filename }))
      } else {
         error(t('record.chat.toast.fileNotFound', { filename: doc.filename }))
      }
    }
  } catch (err) {
    logger.assistant.error('Navigation failed:', err)
  }
}

const sendMessage = async () => {
  const content = input.value.trim()
  if (!content && !pendingContent.value) return
  if (isSending.value) return

  // 1. 如果当前处于 RAG 确认状态，且内容未变，则执行真正的发送
  if (isConfirmingRag.value && (content === pendingContent.value || !content)) {
    const finalContentToUse = content || pendingContent.value
    await performSendMessage(finalContentToUse, retrievedDocs.value)
    cancelRag()
    return
  }

  // 2. 如果开启了 RAG，进行检索预检
  if (isRagEnabled.value && documentCount.value > 0) {
    isSending.value = true
    try {
      logger.assistant.debug('Pre-fetching RAG context for verification...')
      
      let keywords: { text: string; weight: number }[]
      if (content.length > 10) {
        const rawKeywords = await invoke<{text: string, weight: number}[]>('rank_keywords', { 
          text: content, 
          topK: 3 
        })
        keywords = rawKeywords.map(k => ({ text: k.text, weight: 1.0 }))
      } else {
        keywords = [{ text: content, weight: 1.0 }]
      }

      const docs = await getRetrievedDocs(content, keywords)
      
      if (docs.length > 0) {
        retrievedDocs.value = docs
        isConfirmingRag.value = true
        pendingContent.value = content
        isSending.value = false
        return
      }
    } catch (error) {
      logger.assistant.error('Failed to pre-fetch RAG docs:', error)
    } finally {
      isSending.value = false
    }
  }

  // 3. 不使用 RAG 或未检索到任何内容，直接发送
  await performSendMessage(content, [])
}

const performSendMessage = async (content: string, docs: RetrievedDoc[]) => {
  isSending.value = true
  try {
    // 1. Insert User Message
    await chatStore.insert({
      role: 'user',
      content: content,
      type: 'chat'
    })

    // 2. Insert AI Placeholder
    const aiChat = await chatStore.insert({
      role: 'assistant',
      content: 'Thinking...',
      type: 'chat'
    })

    if (aiChat) {
      // 3. Prepare Context String
      let ragContext = ''
      if (docs.length > 0) {
        ragContext = `
Your knowledge library is the most relevant content related to this question. Please use these information to answer the question:
${docs.map(ctx => `文件：${ctx.filename}\n${ctx.content}\n`).join('\n---\n\n')}
`
        logger.assistant.info(`📝 [集成上下文] 最终带入 ${docs.length} 个参考分块，总计约 ${ragContext.length} 字符`);
        logger.rag.debug(`   - 参考来源: ${docs.map(d => d.filename).join(', ')}`);
      }

      // 构建最终提示词
      let finalContent = ''
      
      if (chatStore.isEditMode) {
        // AI 编辑模式专项 Prompt
        const targetText = chatStore.editSelection || chatStore.editFullContent
        const isFullFile = !chatStore.editSelection
        
        finalContent = `
IMPORTANT: You are in "Edit Mode". Your task is to modify the provided text based on the user's instruction.
Return the modified version wrapped in a \`\`\`proposal\`\`\` code block. 

TARGET TEXT (${isFullFile ? 'Full File' : 'Selected Fragment'}):
${targetText}

USER INSTRUCTION:
${content.trim()}

Please provide the revised content inside a \`\`\`proposal\`\`\` block.
`.trim()
      } else {
        // 普通聊天模式
        finalContent = `
${ragContext.trim()}
${content.trim()}
`.trim()
      }

      // 5. Stream AI Response
      logger.assistant.debug('--- Sending AI Request ---')

      const history = chatStore.chats.slice(0, -2).map(chat => ({
        role: chat.role === 'user' ? 'user' : 'assistant',
        content: chat.content || ''
      }))

      let fullContent = ''
      await fetchAiStream(finalContent, (chunk) => {
        fullContent = chunk
        chatStore.updateChat({
          ...aiChat,
          content: fullContent
        })
      }, undefined, history)

      // 6. 如果是编辑模式，附加元数据
      if (chatStore.isEditMode) {
        const originalText = chatStore.editSelection || chatStore.editFullContent;
        // 使用 Base64 编码原文以避免 HTML/Markdown 冲突 (处理中文需要 encodeURIComponent)
        const encodedOriginal = btoa(encodeURIComponent(originalText));
        fullContent += `\n\n<!-- rikka-edit-meta: {"original": "${encodedOriginal}", "status": "suggestion", "isFull": ${!chatStore.editSelection}} -->`;
      }

      // 7. Save Final AI Message
      await chatStore.saveChat({
        ...aiChat,
        content: fullContent
      }, true)

      logger.assistant.debug('--- AI Request Completed ---')

      // 8. 后台异步 RAG 评估（不阻塞用户体验）
      if (docs.length > 0 && fullContent) {
        const contexts = docs.map(d => d.content)
        evalStore.evaluateInBackground(content, fullContent, contexts).catch(() => {})
      }
    }
  } catch (e) {
    logger.assistant.error('Failed to perform send message', e)
    error(t('record.chat.toast.aiRequestFailed'))
  } finally {
    isSending.value = false
    input.value = ''
  }
}
</script>