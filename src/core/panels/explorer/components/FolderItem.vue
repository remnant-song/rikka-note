// FolderItem.vue
<template>
  <Collapsible :open="isExpanded">

    <ContextMenu>
      <ContextMenuTrigger as-child>
        <div
            class="flex items-center gap-1 px-2 py-1 text-sm cursor-pointer hover:bg-accent rounded w-full whitespace-nowrap box-border transition-colors"
            :class="{ 
              'bg-accent text-accent-foreground': isSelected,
              'outline-2 outline-brand-purple outline-dashed -outline-offset-2 bg-brand-purple/5': isDragging
            }"
            draggable="true"
            style="-webkit-user-drag: element; user-select: none;"
            @click="handleFolderClick"
            @dragstart="handleDragStart"
            @drop="handleDrop"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
        >
          <div class="flex items-center gap-1 w-full select-none">
            <ChevronRight
                class="transition-transform size-4 flex-shrink-0 cursor-pointer text-muted-foreground"
                :class="isExpanded && 'rotate-90'"
                @click.stop="toggleExpand"
            />

            <Folder class="size-4 flex-shrink-0 text-blue-500 fill-blue-500/20" />

            <input
                v-if="isEditing"
                ref="inputRef"
                v-model="name"
                class="h-5 rounded-sm text-xs px-0 font-normal flex-1 mr-1 bg-transparent border-none outline-none min-w-0 focus:ring-1 focus:ring-primary focus:rounded-sm"
                @blur="handleRename"
                @input="handleInputChange"
                @compositionstart="isComposing = true"
                @compositionend="handleCompositionEnd"
                @keydown.enter="handleRename"
                @keydown.escape="handleEditEnd"
                @click.stop
            />

            <span
                v-else
                class="text-xs flex-1 whitespace-nowrap overflow-hidden text-ellipsis text-left"
            >
              {{ item.name }}
            </span>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem @click="handleNewFile">{{ t('article.contextMenu.newFile') }}</ContextMenuItem>
        <ContextMenuItem @click="handleNewFolder">{{ t('article.contextMenu.newFolder') }}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @click="handleShowFileManager">{{ t('article.contextMenu.showInFileManager') }}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @click="handleStartRename">{{ t('article.contextMenu.rename') }}</ContextMenuItem>
        <ContextMenuItem
            @click="handleDeleteFolder"
            class="text-red-900"
        >
          {{ t('article.contextMenu.delete') }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <CollapsibleContent>
      <div class="pl-4 border-l ml-2 border-border/40">
        <TreeItem
            v-for="child in item.children"
            :key="child.name"
            :item="child"
        />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, ref} from 'vue'
import {ChevronRight, Folder} from 'lucide-vue-next'
import {ask} from '@tauri-apps/plugin-dialog'
import {openPath} from '@tauri-apps/plugin-opener'
import {join} from '@tauri-apps/api/path'
import {exists, mkdir, remove, rename, writeTextFile} from '@tauri-apps/plugin-fs'
import { getAbsoluteFilePath } from '@/lib/workspace'
import type {DirTree} from '@/stores/article'
import {useArticleStore} from '@/stores/article'
import TreeItem from './TreeItem.vue'
import {Collapsible, CollapsibleContent} from '@/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {useToast} from '@/composables/useToast'
import { useI18n } from '@/composables/useI18n'
import { useVectorStore } from '@/stores/vector'
import { logger } from '@/utils/logger'

interface Props {
  item: DirTree
}

const props = defineProps<Props>()
const articleStore = useArticleStore()
const vectorStore = useVectorStore()
const { show } = useToast()
const { t } = useI18n()

// --- 状态定义 (仿照 FileItem) ---
const isEditing = ref(props.item.isEditing ?? false)
const name = ref(props.item.name)
const isComposing = ref(false)
const inputRef = ref<HTMLInputElement>()

// --- 计算属性 ---
const path = computed(() => computePath(props.item))

const isExpanded = computed({
  get() {
    return articleStore.collapsibleList.includes(path.value)
  },
  set(value) {
    articleStore.setCollapsibleListItem(path.value, value)
  }
})

const isSelected = computed(() => articleStore.selectedFolder === path.value)

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

const handleStartRename = async () => {
  isEditing.value = true
  await nextTick()
  inputRef.value?.focus()
}

const handleRename = async () => {
  // 1. 空值检查，如果为空则取消编辑
  if (!name.value.trim()) {
    handleEditEnd()
    return
  }

  // 2. 格式化名称 (仿照 FileItem)
  const finalName = name.value.replace(/\s+/g, '_')

  // 3. 计算新路径 (注意：文件夹没有后缀名)
  const newPath = path.value.replace(/[^/]*$/, finalName)

  // 如果名称没变，直接结束编辑
  if (finalName === props.item.name) {
    isEditing.value = false
    return
  }

  try {
    // 4. 执行文件系统操作
    if (props.item.name) {
      // --- 情况 A: 现有文件夹重命名 ---
      const oldFullPath = await getAbsoluteFilePath(path.value)
      const newFullPath = await getAbsoluteFilePath(newPath)

      // 检查目标是否存在
      if (await exists(newFullPath)) {
        show({ title: t('article.contextMenu.folderAlreadyExists'), variant: 'warning' })
        // 恢复原名并退出编辑，或者保持编辑状态让用户重试
        // 此处仿照 FileItem 逻辑，如果存在则警告并不做操作，但 FileItem 此处逻辑是 return
        return
      }

      await rename(oldFullPath, newFullPath)

      // 同步更新向量数据库中文件夹及其下文件的路径记录
      try {
        await vectorStore.renameDocument(path.value, newPath)
      } catch (err) {
        logger.explorer.error('Update vector DB filename failed on folder rename:', err)
      }
    } else {
      // --- 情况 B: 新建文件夹创建 ---
      const fullPath = await getAbsoluteFilePath(newPath)

      if (await exists(fullPath)) {
        show({ title: 'Folder already exists', variant: 'warning' })
        return
      }

      await mkdir(fullPath)
    }

    // 5. 更新状态与 Store
    isEditing.value = false
    await articleStore.loadFileTree()

    // 如果之前选中了这个文件夹，更新选中路径
    if (isSelected.value) {
      articleStore.setSelectedFolder(newPath)
    }

  } catch (error) {
    logger.explorer.error('Rename failed:', error)
    show({
      title: t('article.contextMenu.renameFailed'),
      variant: 'error'
    })
  }
}

const handleEditEnd = () => {
  isEditing.value = false
  // 如果是新建的空文件夹（没有名字），需要从UI中移除
  if (!props.item.name) {
    // 逻辑：如果是根节点，从 store 移除；如果是子节点，从父节点移除
    if (props.item.parent) {
      props.item.parent.children = props.item.parent.children?.filter((c: DirTree) => c !== props.item)
    } else {
      articleStore.setFileTree(articleStore.fileTree.filter((f: DirTree) => f.name !== ''))
    }
  }
}

// --- 辅助逻辑 ---

function computePath(item: DirTree): string {
  const parts: string[] = []
  let current: DirTree | undefined = item

  while (current) {
    parts.unshift(current.name)
    current = current.parent
  }

  return parts.join('/')
}

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

const handleFolderClick = (e: MouseEvent) => {
  e.stopPropagation() // 阻止事件冒泡，避免触发 FileManager 的点击事件
  // 防止右键或编辑状态下触发
  if (e.button === 2 || isEditing.value) return

  articleStore.setSelectedFolder(path.value)
  isExpanded.value = !isExpanded.value
}

// --- 其他文件夹特有操作 (保持原有逻辑，确保不冲突) ---

const handleNewFile = async () => {
  try {
    const fullPath = await getAbsoluteFilePath(path.value)
    let newFileName = 'New Article.md'
    let counter = 1
    while (await exists(await join(fullPath, newFileName))) {
      newFileName = `New Article ${counter}.md`
      counter++
    }
    const newFilePath = await join(fullPath, newFileName)
    await writeTextFile(newFilePath, '')
    // 展开当前文件夹以便看到新文件
    isExpanded.value = true
    await articleStore.loadFileTree()
  } catch (err) {
    logger.explorer.error('Create file failed:', err)
    show({ title: t('article.contextMenu.createFileFailed'), variant: 'error' })
  }
}

const handleNewFolder = async () => {
  // 这里其实应该插入一个临时的空 DirTree item 到 children 触发编辑模式
  // 但为了简化，这里保持原有逻辑创建一个默认名字的文件夹
  try {
    const fullPath = await getAbsoluteFilePath(path.value)
    let newFolderName = 'New Folder'
    let counter = 1
    while (await exists(await join(fullPath, newFolderName))) {
      newFolderName = `New Folder ${counter}`
      counter++
    }
    const newFolderPath = await join(fullPath, newFolderName)
    await mkdir(newFolderPath)
    isExpanded.value = true
    await articleStore.loadFileTree()
  } catch (err) {
    logger.explorer.error('Create folder failed:', err)
    show({ title: t('article.contextMenu.createFolderFailed'), variant: 'error' })
  }
}

const handleShowFileManager = async () => {
  try {
    const fullPath = await getAbsoluteFilePath(path.value)
    await openPath(fullPath)
  } catch (err) {
    logger.explorer.error('Open file manager failed:', err)
    show({ title: t('article.contextMenu.openFileManagerFailed'), variant: 'error' })
  }
}

const handleDeleteFolder = async () => {
  const confirmed = await ask(t('article.contextMenu.confirmDeleteFolderMessage', { name: props.item.name }), {
    title: t('article.contextMenu.confirmDeleteFolderTitle'),
    kind: 'warning'
  })

  if (!confirmed) return

  try {
    const fullPath = await getAbsoluteFilePath(path.value)
    await remove(fullPath, { recursive: true })

    // 同步从向量数据库删除该文件夹下所有文件的向量
    try {
      await vectorStore.deleteDocument(path.value)
    } catch (err) {
      logger.explorer.error('Delete folder vector documents failed:', err)
    }

    await articleStore.loadFileTree()

    if (articleStore.selectedFolder === path.value) {
      articleStore.setSelectedFolder('')
    }
  } catch (error) {
    logger.explorer.error('Delete folder failed:', error)
    show({ title: t('article.contextMenu.deleteFailed'), variant: 'error' })
  }
}

// 拖拽相关
const isDragging = ref(false)

const handleDragStart = (e: DragEvent) => {
  if (e.dataTransfer) {
    e.dataTransfer.setData('application/rikka-path', path.value)
    e.dataTransfer.effectAllowed = 'move'
  }
}

const handleDrop = async (e: DragEvent) => {
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false

  const sourcePath = e.dataTransfer?.getData('application/rikka-path')
  if (!sourcePath) return

  // 防止移入自身或父目录（moveItem 会处理，但前端提前拦截体验更好）
  if (sourcePath === path.value) return

  try {
    const result = await articleStore.moveItem(sourcePath, path.value)
    if (result && !result.isNoOp) {
      show({ title: t('article.contextMenu.moveSuccess'), variant: 'success' })
      // 如果目标文件夹未展开，建议展开它
      if (!isExpanded.value) {
        isExpanded.value = true
      }
    }
  } catch (err) {
    // 错误已由 store 处理并显示，这里可以做额外 UI 反馈
    show({ title: (err as Error).message || t('article.contextMenu.moveFailed'), variant: 'error' })
  }
}

const handleDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move'
  }
  isDragging.value = true
}

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
}

// 生命周期
onMounted(() => {
  if (props.item.isEditing) {
    isEditing.value = true
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})
</script>

