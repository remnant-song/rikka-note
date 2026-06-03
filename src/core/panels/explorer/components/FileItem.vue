//FileItem.vue
<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div
          :id="`file-item-${path.replace(/\//g, '-')}`"
          class="group/file-item relative flex items-center gap-1 px-2 py-1 text-sm cursor-pointer rounded transition-colors duration-200 select-none"
          :class="[
          path === activeFilePath ? 'bg-brand-purple/10 text-brand-purple font-medium' : 'hover:bg-accent text-foreground'
        ]"
          draggable="true"
          style="-webkit-user-drag: element;"
          @click="(e) => handleSelectFile(e)"
          @dragstart="handleDragStart"
      >
        <!-- 活动指示条 -->
        <div
            class="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-brand-purple rounded-full transition-all duration-300 ease-in-out opacity-0"
            :class="{ 'opacity-100 h-4 scale-y-100': path === activeFilePath, 'scale-y-0': path !== activeFilePath }"
        />

        <!-- 编辑模式 -->
        <template v-if="isEditing">
          <span class="size-4 flex-shrink-0" />
          <FileIcon :item="item" />
          <input
              ref="inputRef"
              v-model="name"
              class="h-5 rounded-sm text-xs px-1 font-normal flex-1 mr-1 bg-background"
              @blur="handleRename"
              @input="handleInputChange"
              @compositionstart="isComposing = true"
              @compositionend="handleCompositionEnd"
              @keydown.enter="handleRename"
              @keydown.escape="handleEditEnd"
          />
        </template>

        <!-- 图片文件显示 -->
        <template v-else-if="isImageFile">
          <span class="size-4 flex-shrink-0" />
          <Image class="size-4" />
          <span class="text-xs flex-1 line-clamp-1">
            {{ item.name }}
          </span>
        </template>

        <!-- 普通文件显示 -->
        <template v-else>
          <span class="size-4 flex-shrink-0" />
          <FileIcon :item="item" />
          <span class="text-xs flex-1 truncate min-w-0">
            {{ item.name }}
          </span>
          <!-- 加密文件锁图标 -->
          <LockKeyhole v-if="fileIsEncrypted" class="size-3 text-brand-purple flex-shrink-0" />
        </template>
      </div>
    </ContextMenuTrigger>

    <!-- 右键菜单 -->
    <ContextMenuContent>
      <ContextMenuItem @click="handleOpenFileNewTab">
        {{ t('article.contextMenu.openInNewTab') }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem @click="handleShowFileManager">
        {{ t('article.contextMenu.showInFileManager') }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
          :disabled="!item.isLocale"
          @click="handleCutFile"
      >
        {{ t('article.contextMenu.cut') }}
      </ContextMenuItem>
      <ContextMenuItem @click="handleCopyFile">
        {{ t('article.contextMenu.copy') }}
      </ContextMenuItem>
      <ContextMenuItem
          :disabled="!clipboardItem"
          @click="handlePasteFile"
      >
        {{ t('article.contextMenu.paste') }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
          :disabled="!item.isLocale"
          @click="handleStartRename"
      >
        {{ t('article.contextMenu.rename') }}
      </ContextMenuItem>
      <ContextMenuItem
          :disabled="!item.isLocale || !item.name"
          @click="handleDeleteFile"
          class="text-red-900"
      >
        {{ t('article.contextMenu.delete') }}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <!-- 加密/解密操作 -->
      <ContextMenuItem
          v-if="!isImageFile && item.name.endsWith('.md') && !fileIsEncrypted"
          :disabled="!item.isLocale"
          @click="handleEncryptFile"
      >
        {{ t('article.contextMenu.encrypt') }}
      </ContextMenuItem>
      <ContextMenuItem
          v-if="fileIsEncrypted"
          @click="handleDecryptFile"
      >
        {{ t('article.contextMenu.decrypt') }}
      </ContextMenuItem>
      <ContextMenuSeparator v-if="!isImageFile && item.name.endsWith('.md')" />
      <ContextMenuItem
          v-if="!isImageFile && item.name.endsWith('.md')"
          :disabled="fileIsEncrypted"
          @click="handleVectorizeFile"
      >
        {{ t('article.contextMenu.vectorize') }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>

  <!-- 密码输入对话框 -->
  <PasswordDialog
    :visible="showPasswordDialog"
    :title="passwordDialogTitle"
    :description="passwordDialogDesc"
    :password-label="t('encryption.dialog.password')"
    :password-placeholder="t('encryption.dialog.passwordPlaceholder')"
    :submit-label="t('common.confirm')"
    :confirm-mode="passwordDialogConfirmMode"
    :show-warning="passwordDialogConfirmMode"
    ref="passwordDialogRef"
    @submit="handlePasswordSubmit"
    @cancel="showPasswordDialog = false"
  />
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {ask} from '@tauri-apps/plugin-dialog'
import {exists, readTextFile, remove, rename, writeTextFile} from '@tauri-apps/plugin-fs'
import {openPath} from '@tauri-apps/plugin-opener'
import {Image, LockKeyhole} from 'lucide-vue-next'
import type {DirTree} from '@/stores/article'
import {useArticleStore} from '@/stores/article'
import {useEncryptionStore} from '@/stores/encryption'
import { useVectorStore } from '@/stores/vector'
import { getAbsoluteFilePath, getFilePathOptions } from '@/lib/workspace'
import {useToast} from '@/composables/useToast'
import FileIcon from './FileIcon.vue'
import PasswordDialog from '@/core/pages/setting/encryption/PasswordDialog.vue'
import { useWorkspaceLayoutStore } from '@/stores/workspaceLayout'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import useClipboardStore, { type ClipboardItem } from '@/stores/clipboard'
import {convertImageByWorkspace} from '@/lib/utils'
import { useI18n } from '@/composables/useI18n'
import { logger } from '@/utils/logger'

interface Props {
  item: DirTree
}

const props = defineProps<Props>()

const articleStore = useArticleStore()
const layoutStore = useWorkspaceLayoutStore()
const { show } = useToast()
const clipboardStore = useClipboardStore()
const vectorStore = useVectorStore()
const { t } = useI18n()
const clipboardItem = computed(() => clipboardStore.clipboardItem)
const clipboardOperation = computed(() => clipboardStore.clipboardOperation)
const setClipboardItem = (item: ClipboardItem | null, op: 'copy' | 'cut' | 'none') => clipboardStore.setClipboardItem(item, op)

const isEditing = ref(props.item.isEditing ?? false)
const name = ref(props.item.name)
const isComposing = ref(false)
const inputRef = ref<HTMLInputElement>()

// 计算属性
const activeFilePath = computed(() => layoutStore.activeFilePath)
const path = computed(() => computePath(props.item))

// 自动滚动到可视区域 (Reveal)
watch(activeFilePath, (newVal) => {
  if (newVal === path.value) {
    nextTick(() => {
      const el = document.getElementById(`file-item-${path.value.replace(/\//g, '-')}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    })
  }
}, { immediate: true })
const isImageFile = computed(() =>
    props.item.name.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i)
)

// 加密相关
const encryptionStore = useEncryptionStore()
const fileIsEncrypted = ref(false)
const showPasswordDialog = ref(false)
const passwordDialogTitle = ref('')
const passwordDialogDesc = ref('')
const passwordDialogConfirmMode = ref(false)
const passwordDialogRef = ref<InstanceType<typeof PasswordDialog> | null>(null)
// 密码对话框提交后的回调
let pendingPasswordAction: ((password: string) => Promise<void>) | null = null

// 检查文件加密状态
async function checkEncryptionStatus() {
  if (props.item.isFile && props.item.name.endsWith('.md') && props.item.isLocale) {
    try {
      fileIsEncrypted.value = await encryptionStore.checkFileEncrypted(path.value)
    } catch {
      fileIsEncrypted.value = false
    }
  }
}

// 路径计算工具函数
function computePath(item: DirTree): string {
  const parts: string[] = []
  let current: DirTree | undefined = item

  while (current) {
    parts.unshift(current.name)
    current = current.parent
  }

  return parts.join('/')
}

// IME 输入处理（支持中文输入）
const handleInputChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const value = input.value
  const cursorPos = input.selectionStart ?? 0

  if (isComposing.value) {
    name.value = value
    return
  }

  if (value.includes(' ')) {
    name.value = value.replace(/\s+/g, '_')

    nextTick(() => {
      input.setSelectionRange(cursorPos, cursorPos)
    })
  } else {
    name.value = value
  }
}

const handleCompositionEnd = (e: CompositionEvent) => {
  isComposing.value = false
  const input = e.currentTarget as HTMLInputElement
  const value = input.value
  const cursorPos = input.selectionStart ?? 0

  if (value.includes(' ')) {
    name.value = value.replace(/\s+/g, '_')

    nextTick(() => {
      input.setSelectionRange(cursorPos, cursorPos)
    })
  }
}

// 文件操作处理
const handleSelectFile = async (e: Event) => {
  e.stopPropagation() // 阻止事件冒泡，避免触发 FileManager 的点击事件
  if (isImageFile.value) {
    try {
      const imgUrl = await convertImageByWorkspace(path.value)
      window.open(imgUrl, '_blank')
    } catch (err) {
      logger.explorer.error('Show image failed:', err)
      show({ title: 'Show image failed', variant: 'error' })
    }
  } else {
    // 异步检查并更新加密状态，确保是最新的
    const isEncrypted = await encryptionStore.checkFileEncrypted(path.value)
    fileIsEncrypted.value = isEncrypted

    // 如果是加密文件且后端未解锁，先弹出密码框，在成功解锁后再打开文件
    if (isEncrypted && !encryptionStore.isUnlocked) {
      passwordDialogTitle.value = t('encryption.dialog.unlockTitle')
      passwordDialogDesc.value = t('encryption.dialog.unlockDesc')
      passwordDialogConfirmMode.value = false
      pendingPasswordAction = async (password: string) => {
        try {
          await encryptionStore.unlock(password)
          showPasswordDialog.value = false
          // 解锁成功，再使用布局仓库打开文件
          await layoutStore.openFile(path.value, { newTab: false })
          await articleStore.readArticle(path.value)
        } catch {
          passwordDialogRef.value?.setError(t('encryption.dialog.wrongPassword'))
        }
      }
      showPasswordDialog.value = true
    } else {
      // 普通文件或已解锁文件，直接打开
      await layoutStore.openFile(path.value, { newTab: false })
    }
  }
}

const handleOpenFileNewTab = async () => {
  await layoutStore.openFile(path.value, { newTab: true })
}

const handleStartRename = async () => {
  isEditing.value = true
  await nextTick()
  if (inputRef.value) {
    inputRef.value.focus()
    // 优化：选中文件名，但不选中 .md 后缀
    const hasExtension = name.value.lastIndexOf('.')
    if (hasExtension !== -1) {
      inputRef.value.setSelectionRange(0, hasExtension)
    } else {
      inputRef.value.select()
    }
  }
}

const handleRename = async () => {
  // 1. 基础验证：如果处于 IME 输入状态或已关闭编辑，则不触发
  if (isComposing.value || !isEditing.value) return

  const originalName = props.item.name
  let inputName = name.value.trim()

  // 2. 如果输入为空，撤销编辑并恢复原名
  if (!inputName) {
    name.value = originalName
    handleEditEnd()
    return
  }

  // 3. 处理名称规范：替换空格和非法字符
  let finalName = inputName
      .replace(/[\\/:*?"<>|]/g, '') // 过滤 Windows/Unix 不允许的路径字符

  // 4. 智能后缀补全 (仅针对非图片文件)
  if (!isImageFile.value && !finalName.toLowerCase().endsWith('.md')) {
    finalName += '.md'
  }

  // 5. 核心判断：如果名字没变，直接退出
  if (finalName === originalName) {
    isEditing.value = false
    return
  }

  // 6. 路径准备
  const newPath = path.value.replace(/[^/]*$/, finalName)

  try {
    const oldFullPath = await getAbsoluteFilePath(path.value)
    const newFullPath = await getAbsoluteFilePath(newPath)

    // 7. 冲突检测
    if (await exists(newFullPath)) {
      show({ title: t('article.contextMenu.fileAlreadyExists'), variant: 'warning' })
      return // 不关闭编辑模式，让用户继续修改
    }

    // 8. 执行重命名
    // 这里不再需要判断 props.item.name 是否存在，因为 FileItem 实例必然对应一个物理文件
    await rename(oldFullPath, newFullPath)

    // 8.5 同步更新向量数据库的文件名
    try {
      await vectorStore.renameDocument(path.value, newPath)
    } catch (err) {
      logger.explorer.error('Update vector DB filename failed on rename:', err)
    }

    // 9. 后续处理
    isEditing.value = false
    await articleStore.loadFileTree()
    await articleStore.setActiveFilePath(newPath)

    show({ title: t('article.contextMenu.renameSuccess'), variant: 'success' })
  } catch (error) {
    logger.explorer.error('Rename failed:', error)
    show({ title: t('article.contextMenu.renameFailed'), variant: 'error' })
  }
}

const handleEditEnd = () => {
  isEditing.value = false
  // 如果是那种“新建后未命名就取消”的情况，才需要通知 store 清理
  if (!props.item.name) {
    articleStore.setFileTree(articleStore.fileTree.filter((f: DirTree) => f.name !== ''))
  }
}

const handleDeleteFile = async () => {
  const confirmed = await ask(t('article.contextMenu.confirmDeleteFileMessage', { name: props.item.name }), {
    title: t('article.contextMenu.confirmDeleteFileTitle'),
    kind: 'warning'
  })

  if (!confirmed) return

  try {
    const fullPath = await getAbsoluteFilePath(path.value)

    await remove(fullPath)
    
    // 从向量数据库删除该文件的向量
    try {
      await vectorStore.deleteDocument(path.value)
    } catch (err) {
      logger.explorer.error('Delete vector document failed:', err)
    }

    await articleStore.loadFileTree()

    if (path.value === activeFilePath.value) {
      await articleStore.setActiveFilePath('')
    }
  } catch (error) {
    logger.explorer.error('Delete failed:', error)
    show({
      title: t('article.contextMenu.deleteFailed'),
      variant: 'error'
    })
  }
}

const handleShowFileManager = async () => {
  const parentPath = path.value.substring(0, path.value.lastIndexOf('/'))
  const fullPath = await getAbsoluteFilePath(parentPath || '.')

  await openPath(fullPath)
}

const handleDragStart = (e: DragEvent) => {
  if (e.dataTransfer) {
    e.dataTransfer.setData('application/rikka-path', path.value)
    e.dataTransfer.effectAllowed = 'move'
  }
}

const handleCopyFile = () => {
  setClipboardItem({ path: path.value, name: props.item.name, isDirectory: false, sha: props.item.sha, isLocale: props.item.isLocale }, 'copy')
  show({ title: t('article.contextMenu.copied'), variant: 'success' })
}

const handleCutFile = () => {
  setClipboardItem({ path: path.value, name: props.item.name, isDirectory: false, sha: props.item.sha, isLocale: props.item.isLocale }, 'cut')
  show({ title: t('article.contextMenu.cutSuccess'), variant: 'success' })
}

const handlePasteFile = async () => {
  const item = clipboardItem.value
  if (!item) {
    show({ title: t('article.contextMenu.clipboardEmpty'), variant: 'error' })
    return
  }
  if (item.isDirectory) {
    show({ title: t('article.contextMenu.pasteNotSupportedForDirectory'), variant: 'error' })
    return
  }

  try {
    const sourceOpts = await getFilePathOptions(item.path)
    const targetDir = path.value.includes('/') ? path.value.substring(0, path.value.lastIndexOf('/')) : ''
    const targetPath = targetDir ? `${targetDir}/${item.name}` : `${item.name}`
    const targetOpts = await getFilePathOptions(targetPath)

    const existsTarget = targetOpts.baseDir ? await exists(targetOpts.path, { baseDir: targetOpts.baseDir }) : await exists(targetOpts.path)
    if (existsTarget) {
      const confirmOverwrite = await ask(t('article.contextMenu.confirmOverwrite', { name: item.name }), { title: t('article.contextMenu.confirmOverwriteTitle'), kind: 'warning' })
      if (!confirmOverwrite) return
    }

    const content = sourceOpts.baseDir ? await readTextFile(sourceOpts.path, { baseDir: sourceOpts.baseDir }) : await readTextFile(sourceOpts.path)
    if (targetOpts.baseDir) {
      await writeTextFile(targetOpts.path, content, { baseDir: targetOpts.baseDir })
    } else {
      await writeTextFile(targetOpts.path, content)
    }

    if (clipboardOperation.value === 'cut') {
      // 删除源文件并清空剪贴板
      if (sourceOpts.baseDir) {
        await remove(sourceOpts.path, { baseDir: sourceOpts.baseDir })
      } else {
        await remove(sourceOpts.path)
      }
      setClipboardItem(null, 'none')
    }

    await articleStore.loadFileTree()
    show({ title: t('article.contextMenu.pasted'), variant: 'success' })
  } catch (err) {
    logger.explorer.error('Paste failed:', err)
    show({ title: t('article.contextMenu.pasteFailed'), variant: 'error' })
  }
}


onMounted(() => {
  if (props.item.isEditing) {
    isEditing.value = true
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
  // 初始化加密状态检查
  checkEncryptionStatus()
})

// 加密操作
const handleEncryptFile = async () => {
  if (encryptionStore.isUnlocked) {
    // 后端已解锁，直接加密
    try {
      await encryptionStore.encryptNote(path.value)
      fileIsEncrypted.value = true
      show({ title: t('article.contextMenu.encryptSuccess'), variant: 'success' })
    } catch (e) {
      show({ title: t('article.contextMenu.encryptFailed'), variant: 'error' })
      logger.auth.error('Encrypt failed:', e)
    }
  } else if (encryptionStore.isPasswordSet) {
    // 已设置密码但未解锁，弹出解锁对话框
    passwordDialogTitle.value = t('encryption.dialog.unlockTitle')
    passwordDialogDesc.value = t('encryption.dialog.unlockDesc')
    passwordDialogConfirmMode.value = false
    pendingPasswordAction = async (password: string) => {
      try {
        await encryptionStore.unlock(password)
        await encryptionStore.encryptNote(path.value)
        fileIsEncrypted.value = true
        showPasswordDialog.value = false
        show({ title: t('article.contextMenu.encryptSuccess'), variant: 'success' })
      } catch {
        passwordDialogRef.value?.setError(t('encryption.dialog.wrongPassword'))
      }
    }
    showPasswordDialog.value = true
  } else {
    // 首次设置密码
    passwordDialogTitle.value = t('encryption.dialog.setPasswordTitle')
    passwordDialogDesc.value = t('encryption.dialog.setPasswordDesc')
    passwordDialogConfirmMode.value = true
    pendingPasswordAction = async (password: string) => {
      try {
        await encryptionStore.setupEncryption(password)
        await encryptionStore.encryptNote(path.value)
        fileIsEncrypted.value = true
        showPasswordDialog.value = false
        show({ title: t('article.contextMenu.encryptSuccess'), variant: 'success' })
      } catch (e) {
        passwordDialogRef.value?.setError(t('article.contextMenu.encryptFailed'))
        logger.auth.error('Setup encryption failed:', e)
      }
    }
    showPasswordDialog.value = true
  }
}

const handleDecryptFile = async () => {
  if (encryptionStore.isUnlocked) {
    try {
      await encryptionStore.removeEncryption(path.value)
      fileIsEncrypted.value = false
      if (path.value === activeFilePath.value) {
        await articleStore.readArticle(path.value)
      }
      show({ title: t('article.contextMenu.decryptSuccess'), variant: 'success' })
    } catch (e) {
      show({ title: t('article.contextMenu.decryptFailed'), variant: 'error' })
      logger.auth.error('Decrypt failed:', e)
    }
  } else {
    // 需要先解锁
    passwordDialogTitle.value = t('encryption.dialog.unlockTitle')
    passwordDialogDesc.value = t('encryption.dialog.unlockDesc')
    passwordDialogConfirmMode.value = false
    pendingPasswordAction = async (password: string) => {
      try {
        await encryptionStore.unlock(password)
        await encryptionStore.removeEncryption(path.value)
        fileIsEncrypted.value = false
        showPasswordDialog.value = false
        if (path.value === activeFilePath.value) {
          await articleStore.readArticle(path.value)
        }
        show({ title: t('article.contextMenu.decryptSuccess'), variant: 'success' })
      } catch {
        passwordDialogRef.value?.setError(t('encryption.dialog.wrongPassword'))
      }
    }
    showPasswordDialog.value = true
  }
}

// 向量化索引处理
const handleVectorizeFile = async () => {
  if (!vectorStore.isVectorDbEnabled) {
    show({ title: t('search.semanticSearchDisabled'), description: t('search.semanticSearchDisabledDesc'), variant: 'warning' })
    return
  }

  if (fileIsEncrypted.value) {
    show({ title: t('article.contextMenu.vectorizeFailed'), description: '无法索引加密文件，请先解密。', variant: 'warning' })
    return
  }

  try {
    show({ title: t('article.fileToolbar.processingVectors'), description: path.value, variant: 'default' })
    
    const successResult = await vectorStore.processDocument(path.value)
    
    if (successResult) {
      show({ title: t('article.contextMenu.vectorizeSuccess'), variant: 'success' })
    } else {
      show({ title: t('article.contextMenu.vectorizeFailed'), variant: 'error' })
    }
  } catch (err) {
    logger.rag.error('Vectorize file failed:', err)
    show({ title: t('article.contextMenu.vectorizeFailed'), variant: 'error' })
  }
}

// 密码对话框提交处理
const handlePasswordSubmit = async (password: string) => {
  if (pendingPasswordAction) {
    await pendingPasswordAction(password)
  }
}
</script>

