//article.ts
import {defineStore} from 'pinia'
import {ref} from 'vue'
import {DirEntry, exists, mkdir, readDir, readTextFile, rename, stat, writeTextFile} from '@tauri-apps/plugin-fs'
import {Store} from '@tauri-apps/plugin-store'
import {logger} from '@/utils/logger'
import {cloneDeep, uniq} from 'lodash-es'
import {join} from '@tauri-apps/api/path'

// 导入路径/工作区工具函数
import {getFilePathOptions, getWorkspacePath, toWorkspaceRelativePath} from '@/lib/workspace'
import {getCurrentFolder} from '@/lib/path'
import {useEncryptionStore} from '@/stores/encryption'
import {useVectorStore} from '@/stores/vector'

// 类型定义
export type SortType = 'name' | 'created' | 'modified' | 'none'
export type SortDirection = 'asc' | 'desc'

export interface DirTree extends DirEntry {
    children?: DirTree[]
    parent?: DirTree
    sha?: string
    isEditing?: boolean
    isLocale: boolean
    createdAt?: string
    modifiedAt?: string
}

export interface Article {
    article: string
    path: string
    createdAt?: string
    modifiedAt?: string
}

// tore
export const useArticleStore = defineStore('article', () => {
    // -------- 状态管理 --------
    const loading = ref(false)
    const activeFilePath = ref('')
    const matchPosition = ref<number | null>(null)
    const html2md = ref(false)
    const sortType = ref<SortType>('none')
    const sortDirection = ref<SortDirection>('asc')
    const fileTree = ref<DirTree[]>([])
    const fileTreeLoading = ref(false)
    const collapsibleList = ref<string[]>([])
    const currentArticle = ref('')
    const fileBuffers = ref<Record<string, string>>({}) // 新增：全局文件内容缓冲池
    const allArticle = ref<Article[]>([])
    const errorMsg = ref<string | null>(null)
    const selectedFolder = ref('') // 当前选中的文件夹路径
    // 大纲控制状态（显式标注 boolean 类型，初始值 false）
    const enableOutline = ref(false)
    // -------- 基础状态设置方法 --------
    // 新增：设置大纲显示状态
    async function setEnableOutline(val: boolean) {
        enableOutline.value = val
        try {
            const store = await Store.load('store.json')
            await store.set('enableOutline', val)
            await store.save()
        } catch (err) {
            errorMsg.value = `保存大纲配置失败：${(err as Error).message}`
            logger.explorer.warn('Failed to save enableOutline:', err)
        }
    }

// 新增：初始化大纲配置（从本地存储读取）
    async function initEnableOutline() {
        try {
            const store = await Store.load('store.json')
            const res = await store.get<boolean>('enableOutline')
            enableOutline.value = res ?? false // 兜底：无值时默认 false
        } catch (err) {
            errorMsg.value = `初始化大纲配置失败：${(err as Error).message}`
            logger.explorer.warn('Failed to init enableOutline:', err)
        }
    }
    function setLoading(val: boolean) {
        loading.value = val
    }

    async function setActiveFilePath(path: string) {
        // 如果点击的是当前已打开的文件，不要重复设置，避免清空内容
        if (activeFilePath.value === path) {
            return
        }
        activeFilePath.value = path
        // 关键修复：切换路径时先清空当前文章内容，防止内容污染
        currentArticle.value = ''
        try {
            const store = await Store.load('store.json')
            await store.set('activeFilePath', path)
            await store.save()
        } catch (err) {
            errorMsg.value = `保存活跃文件路径失败：${(err as Error).message}`
            logger.explorer.warn('Failed to save activeFilePath:', err)
        }
    }

    function setMatchPosition(position: number | null) {
        matchPosition.value = position
    }

    // HTML转MD配置
    async function initHtml2md() {
        try {
            const store = await Store.load('store.json')
            const res = await store.get<boolean>('html2md')
            html2md.value = res || false
        } catch (err) {
            errorMsg.value = `初始化html2md配置失败：${(err as Error).message}`
            logger.explorer.warn('Failed to init html2md:', err)
        }
    }

    async function setHtml2mdValue(val: boolean) {
        html2md.value = val
        try {
            const store = await Store.load('store.json')
            await store.set('html2md', val)
            await store.save()
        } catch (err) {
            errorMsg.value = `保存html2md配置失败：${(err as Error).message}`
            logger.explorer.warn('Failed to save html2md:', err)
        }
    }

    // 排序相关方法
    async function setSortType(newSortType: SortType) {
        sortType.value = newSortType
        try {
            const store = await Store.load('store.json')
            await store.set('sortType', newSortType)
            fileTree.value = sortFileTree(fileTree.value)
        } catch (err) {
            logger.explorer.warn('Failed to save sortType:', err)
        }
    }

    async function setSortDirection(newDirection: SortDirection) {
        sortDirection.value = newDirection
        try {
            const store = await Store.load('store.json')
            await store.set('sortDirection', newDirection)
            fileTree.value = sortFileTree(fileTree.value)
        } catch (err) {
            logger.explorer.warn('Failed to save sortDirection:', err)
        }
    }

    // 文件树排序逻辑
    function sortFileTree(tree: DirTree[]): DirTree[] {
        if (sortType.value === 'none') return tree

        const sortedTree = cloneDeep(tree)
        const sortFunction = (a: DirTree, b: DirTree) => {
            // 文件夹优先排序
            if (a.isDirectory && !b.isDirectory) return -1
            if (!a.isDirectory && b.isDirectory) return 1

            let result: number
            switch (sortType.value) {
                case 'name':
                    result = a.name.localeCompare(b.name)
                    break
                case 'created':
                    if (a.createdAt && b.createdAt) {
                        result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    } else {
                        logger.explorer.debug(`[Sort] Missing createdAt: a=${a.name}(${a.createdAt}), b=${b.name}(${b.createdAt})`)
                        result = a.name.localeCompare(b.name)
                    }
                    break
                case 'modified':
                    if (a.modifiedAt && b.modifiedAt) {
                        result = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime()
                    } else {
                        result = a.name.localeCompare(b.name)
                    }
                    break
                default:
                    result = 0
            }
            return sortDirection.value === 'asc' ? result : -result
        }

        // 排序根节点
        sortedTree.sort(sortFunction)

        // 递归排序子节点
        const sortChildren = (items: DirTree[]) => {
            for (const item of items) {
                if (item.children && item.children.length > 0) {
                    item.children.sort(sortFunction)
                    sortChildren(item.children)
                }
            }
        }
        sortChildren(sortedTree)

        return sortedTree
    }

    // 更新文件统计信息（创建/修改时间）
    async function updateFileStats(basePath: string, tree: DirTree[]): Promise<DirTree[]> {
        const workspace = await getWorkspacePath()

        for (const entry of tree) {
            const filePath = await join(basePath, entry.name)
            try {
                let fileStat
                if (workspace.isCustom) {
                    fileStat = await stat(filePath)
                } else {
                    const relPath = await toWorkspaceRelativePath(filePath)
                    const pathOptions = await getFilePathOptions(relPath)
                    fileStat = await stat(pathOptions.path, { baseDir: pathOptions.baseDir })
                }
                entry.createdAt = fileStat.birthtime?.toISOString()
                entry.modifiedAt = fileStat.mtime?.toISOString()
            } catch (error) {
                logger.explorer.error(`Error getting stats for ${filePath}:`, error)
            }

            if (entry.isDirectory && entry.children) {
                const dirPath = await join(basePath, entry.name)
                await updateFileStats(dirPath, entry.children)
            }
        }
        return tree
    }

    // 设置文件树（自动排序）
    function setFileTree(tree: DirTree[]) {
        fileTree.value = sortFileTree(tree)
    }

    // 添加文件到文件树
    function addFile(file: DirTree) {
        fileTree.value = [file, ...fileTree.value]
    }

    // 加载文件树
    async function loadFileTree() {
        fileTreeLoading.value = true
        fileTree.value = []
        errorMsg.value = null

        try {
            // 获取当前工作区路径
            const workspace = await getWorkspacePath()

            // 确保工作区目录存在
            if (!workspace.isCustom) {
                // 不再回退到默认的Appdata目录，如果没有配置仓库，直接视为空
                fileTree.value = []
                fileTreeLoading.value = false
                return
            }

            const isWorkspaceExists = await exists(workspace.path)
            if (!isWorkspaceExists) {
                // 不得私自创建已被外部删除的目录
                errorMsg.value = '仓库对应本地文件夹不存在或已被移出原位置。'
                fileTree.value = []
                fileTreeLoading.value = false
                return
            }

            // 读取工作区文件
            let dirs: DirTree[]
            dirs = (await readDir(workspace.path))
                .filter(file =>
                    file.name !== '.DS_Store' &&
                    !file.name.startsWith('.') &&
                    (file.isDirectory || file.name.endsWith('.md') || file.name.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i))
                ).map(file => ({
                    ...file,
                    isEditing: false,
                    isLocale: true,
                    parent: undefined,
                    sha: '',
                    createdAt: undefined,
                    modifiedAt: undefined
                }))

            // 递归处理工作区下的所有文件和文件夹（内联函数）
            async function processEntriesRecursively(parent: string, entries: DirTree[]) {
                const workspace = await getWorkspacePath()
                for (const entry of entries) {
                    if (entry.isDirectory) {
                        const dir = await join(parent, entry.name)
                        let children: DirTree[] = []

                        if (workspace.isCustom) {
                            children = (await readDir(dir))
                                .filter(file =>
                                    file.name !== '.DS_Store' &&
                                    !file.name.startsWith('.') &&
                                    (file.isDirectory || file.name.endsWith('.md') || file.name.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i))
                                ).map(file => ({
                                    ...file,
                                    parent: entry,
                                    isEditing: false,
                                    isLocale: true,
                                    sha: ''
                                })) as DirTree[]
                        }

                        entry.children = children
                        await processEntriesRecursively(dir, children)
                    }
                }
            }

            await processEntriesRecursively(workspace.path, dirs as DirTree[])

            // 更新文件统计信息并排序
            await updateFileStats(workspace.path, dirs)
            fileTree.value = sortFileTree(dirs)

        } catch (error) {
            errorMsg.value = `加载文件树失败：${(error as Error).message}`
            logger.explorer.error('[ArticleStore] loadFileTree error:', error)
        } finally {
            fileTreeLoading.value = false
        }
    }

    // 空实现（远程同步）
    async function loadCollapsibleFiles(_fullpath: string) {
        // 无需实现：已移除远程同步功能（Github/Gitee/Gitlab）
    }

    // 初始化折叠列表
    async function initCollapsibleList() {
        errorMsg.value = null
        try {
            const store = await Store.load('store.json')
            const res = await store.get<string[]>('collapsibleList')
            const activeFilePathStored = await store.get<string>('activeFilePath')

            if (activeFilePathStored) {
                activeFilePath.value = activeFilePathStored
            }

            collapsibleList.value = res ? uniq(res.filter(item => !item.includes('.md'))) : []
        } catch (err) {
            errorMsg.value = `初始化折叠列表失败：${(err as Error).message}`
            logger.explorer.warn('Failed to init collapsibleList:', err)
        }
    }

    // 设置折叠列表项
    async function setCollapsibleListItem(path: string, value: boolean) {
        errorMsg.value = null
        try {
            const list = cloneDeep(collapsibleList.value)
            if (value) {
                list.push(path)
            } else {
                const idx = list.indexOf(path)
                if (idx !== -1) list.splice(idx, 1)
            }

            const store = await Store.load('store.json')
            await store.set('collapsibleList', list)
            await store.save()

            collapsibleList.value = uniq(list).filter(item => !item.includes('.md'))
        } catch (err) {
            errorMsg.value = `保存折叠列表失败：${(err as Error).message}`
            logger.explorer.warn('Failed to save collapsibleList:', err)
        }
    }

    // 展开所有文件夹
    async function expandAllFolders() {
        errorMsg.value = null
        try {
            const getAllFolderPaths = (tree: DirTree[], parentPath: string = ''): string[] => {
                let paths: string[] = []
                for (const item of tree) {
                    if (!item.isFile) {
                        const currentPath = parentPath ? `${parentPath}/${item.name}` : item.name
                        paths.push(currentPath)
                        if (item.children && item.children.length > 0) {
                            paths = [...paths, ...getAllFolderPaths(item.children, currentPath)]
                        }
                    }
                }
                return paths
            }

            const folderPaths = getAllFolderPaths(fileTree.value)
            const store = await Store.load('store.json')
            await store.set('collapsibleList', folderPaths)
            await store.save()

            collapsibleList.value = uniq(folderPaths)

            // 空实现：加载远程文件
            for (const path of folderPaths) {
                await loadCollapsibleFiles(path)
            }
        } catch (err) {
            errorMsg.value = `展开所有文件夹失败：${(err as Error).message}`
            logger.explorer.warn('Failed to expand all folders:', err)
        }
    }

    // 折叠所有文件夹
    async function collapseAllFolders() {
        errorMsg.value = null
        try {
            const store = await Store.load('store.json')
            await store.set('collapsibleList', [])
            await store.save()

            collapsibleList.value = []
        } catch (err) {
            errorMsg.value = `折叠所有文件夹失败：${(err as Error).message}`
            logger.explorer.warn('Failed to collapse all folders:', err)
        }
    }

    // 切换所有文件夹状态
    async function toggleAllFolders() {
        if (collapsibleList.value.length > 0) {
            await collapseAllFolders()
        } else {
            await expandAllFolders()
        }
    }

    // 清空折叠列表
    async function clearCollapsibleList() {
        errorMsg.value = null
        try {
            collapsibleList.value = []
            const store = await Store.load('store.json')
            await store.set('collapsibleList', [])
            await store.save()
        } catch (err) {
            errorMsg.value = `清空折叠列表失败：${(err as Error).message}`
            logger.explorer.warn('Failed to clear collapsibleList:', err)
        }
    }

    // 读取文章内容（集成加密支持）
    async function readArticle(path: string, _sha?: string, isLocale = true): Promise<string> {
        setLoading(true)
        errorMsg.value = null
        try {
            if (isLocale) {
                const workspace = await getWorkspacePath()
                const pathOptions = await getFilePathOptions(path)
                let content = ''

                if (!workspace.isCustom) {
                    currentArticle.value = ''
                    return ''
                }

                const fileExists = await exists(pathOptions.path)

                if (fileExists) {
                    // 检查文件是否已加密
                    const encryptionStore = useEncryptionStore()
                    const isEncrypted = await encryptionStore.checkFileEncrypted(path)

                    if (isEncrypted) {
                        // 加密文件：需要后端解锁
                        if (!encryptionStore.isUnlocked) {
                            // 后端未解锁，设置特殊标记让 UI 层弹出密码框
                            currentArticle.value = ''
                            errorMsg.value = '__ENCRYPTED_NEED_PASSWORD__'
                            return ''
                        }
                        // 后端已解锁，直接解密（无需传递密码）
                        try {
                            content = await encryptionStore.readEncryptedNote(path)
                        } catch (e) {
                            errorMsg.value = `解密失败：${(e as Error).message}`
                            return ''
                        }
                    } else {
                        // 普通文件：直接读取
                        content = await readTextFile(pathOptions.path)
                    }
                    
                    // 同步到缓冲区和旧状态（兼容旧组件）
                    fileBuffers.value[path] = content
                    if (activeFilePath.value === path) {
                        currentArticle.value = content
                    }
                    return content
                } else {
                    errorMsg.value = `本地文件不存在：${path}`
                    return ''
                }
            }
            return ''
        } catch (error) {
            errorMsg.value = `读取文章失败：${(error as Error).message}`
            logger.explorer.error('[ArticleStore] readArticle error:', error)
            return ''
        } finally {
            setLoading(false)
        }
    }

    // 更新单个文档的缓冲区内容
    function updateFileBuffer(path: string, content: string) {
        fileBuffers.value[path] = content
        if (activeFilePath.value === path) {
            currentArticle.value = content
        }
    }

    // 保存指定文章（集成加密支持）
    async function saveArticle(path: string, content: string) {
        if (!path) return

        try {
            const workspace = await getWorkspacePath()
            if (!workspace.isCustom) return
            
            const pathOptions = await getFilePathOptions(path)
            const isLocale = await exists(pathOptions.path)

            // 确保目录结构存在
            if (path.includes('/')) {
                let dir = ''
                const dirPath = path.split('/')
                for (let index = 0; index < dirPath.length - 1; index += 1) {
                    dir += `${dirPath[index]}/`
                    const dirOptions = await getFilePathOptions(dir)
                    if (!(await exists(dirOptions.path))) {
                        await mkdir(dirOptions.path)
                    }
                }
            }

            const encryptionStore = useEncryptionStore()
            const isEncrypted = encryptionStore.isEncrypted(path)

            // 写入磁盘
            await writeTextFile(pathOptions.path, content)

            // 加密处理
            if (isEncrypted && encryptionStore.isUnlocked) {
                await encryptionStore.encryptNote(path)
            }

            // 同步内部状态
            fileBuffers.value[path] = content
            if (activeFilePath.value === path) {
                currentArticle.value = content
            }

            // 更新文件树（如果是新文件）
            if (!isLocale) {
                const cacheTree = cloneDeep(fileTree.value)
                const current = path.includes('/')
                    ? getCurrentFolder(path, cacheTree)
                    : cacheTree.find(item => item.name === path)
                if (current) {
                    current.isLocale = true
                    fileTree.value = cacheTree
                }
            }
        } catch (error) {
            errorMsg.value = `保存失败：${(error as Error).message}`
            logger.explorer.error('[ArticleStore] saveArticle error:', error)
        }
    }

    // 保存当前激活的文章（保持向下兼容）
    async function saveCurrentArticle(content: string) {
        if (!activeFilePath.value) return
        await saveArticle(activeFilePath.value, content)
    }

    // 加载所有文章（用于搜索）
    async function loadAllArticle() {
        errorMsg.value = null
        try {
            const workspace = await getWorkspacePath()
            if (!workspace.isCustom) {
                allArticle.value = []
                return
            }
            
            let allArticles: Article[]

            const readDirRecursively = async (dirPath: string, basePath: string): Promise<Article[]> => {
                let articles: Article[] = []

                // 读取当前目录
                const res = await readDir(dirPath)

                // 过滤并读取MD文件
                const files = res.filter(file =>
                    file.isFile &&
                    file.name !== '.DS_Store' &&
                    !file.name.startsWith('.') &&
                    file.name.endsWith('.md')
                )

                for (const file of files) {
                    const relativePath = (await join(basePath, file.name)).replace(/\\/g, '/')
                    const fullPath = await join(dirPath, file.name)
                    const articleContent = await readTextFile(fullPath)
                    
                    // 获取文件属性时间 (对齐文件树逻辑)
                    const fileStat = await stat(fullPath)
                    const createdAt = fileStat.birthtime?.toISOString()
                    const modifiedAt = fileStat.mtime?.toISOString()

                    articles.push({ 
                        article: articleContent, 
                        path: relativePath,
                        createdAt,
                        modifiedAt
                    })
                }

                // 递归处理子目录
                const directories = res.filter(entry =>
                    entry.isDirectory &&
                    !entry.name.startsWith('.')
                )

                for (const dir of directories) {
                    const newDirPath = await join(dirPath, dir.name)
                    const newBasePath = await join(basePath, dir.name)
                    const subDirArticles = await readDirRecursively(newDirPath, newBasePath)
                    articles = [...articles, ...subDirArticles]
                }

                return articles
            }

            allArticles = await readDirRecursively(workspace.path, '')

            allArticle.value = allArticles
        } catch (error) {
            errorMsg.value = `加载所有文章失败：${(error as Error).message}`
            logger.explorer.error('[ArticleStore] loadAllArticle error:', error)
        }
    }

    // 设置选中的文件夹路径
    function setSelectedFolder(path: string) {
        selectedFolder.value = path
    }

    // 清除选中的文件夹路径
    function clearSelectedFolder() {
        selectedFolder.value = ''
    }

    // 移动文件或文件夹
    async function moveItem(sourceRelativePath: string, targetDirRelativePath: string) {
        errorMsg.value = null
        
        try {
            const workspace = await getWorkspacePath()
            if (!workspace.isCustom) return { success: false }

            // 1. 计算路径并进行规范化
            const sourceAbsolutePath = await join(workspace.path, sourceRelativePath)
            const itemName = sourceRelativePath.split(/[\\/]/).pop() || ''
            const targetRelativePath = targetDirRelativePath 
                ? `${targetDirRelativePath}/${itemName}` 
                : itemName
            
            const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^\/+/, '')
            const normalizedSource = normalize(sourceRelativePath)
            const normalizedTarget = normalize(targetRelativePath)
            
            const targetAbsolutePath = await join(workspace.path, targetRelativePath)

            // 2. 原位移动检测 (No-Op)
            if (normalizedSource === normalizedTarget) {
                return { success: true, newPath: targetRelativePath, isNoOp: true }
            }

            // 3. 安全与冲突校验 (直接抛出，由 catch 统一处理 UI 提示)
            if (targetRelativePath.startsWith(`${sourceRelativePath}/`)) {
                throw new Error('Cannot move an item into its own subdirectories.')
            }

            if (await exists(targetAbsolutePath)) {
                throw new Error(`An item with the name "${itemName}" already exists in the target folder.`)
            }

            // 4. 执行物理移动与状态更新
            await rename(sourceAbsolutePath, targetAbsolutePath)

            // 5. 同步更新向量数据库中的路径
            try {
                const vectorStore = useVectorStore()
                await vectorStore.renameDocument(normalizedSource, normalizedTarget)
            } catch (err) {
                logger.explorer.error('[ArticleStore] renameDocument error:', err)
            }

            if (activeFilePath.value === sourceRelativePath) {
                activeFilePath.value = targetRelativePath
                const store = await Store.load('store.json')
                await store.set('activeFilePath', targetRelativePath)
                await store.save()
            }
            
            await loadFileTree()
            return { success: true, newPath: targetRelativePath }

        } catch (error) {
            const msg = (error as Error).message
            errorMsg.value = `移动失败：${msg}`
            logger.explorer.error('[ArticleStore] moveItem error:', error)
            throw error // 重新抛出以便组件捕获
        }
    }

    // -暴露状态和方法
    return {
        // 状态
        loading,
        activeFilePath,
        matchPosition,
        html2md,
        sortType,
        sortDirection,
        fileTree,
        fileTreeLoading,
        collapsibleList,
        currentArticle,
        fileBuffers,
        allArticle,
        errorMsg,
        selectedFolder,
        enableOutline,

        // 方法
        setLoading,
        setActiveFilePath,
        setMatchPosition,
        initHtml2md,
        setHtml2mdValue,
        setSortType,
        setSortDirection,
        sortFileTree,
        updateFileStats,
        setFileTree,
        addFile,
        loadFileTree,
        loadCollapsibleFiles,
        initCollapsibleList,
        setCollapsibleListItem,
        expandAllFolders,
        collapseAllFolders,
        toggleAllFolders,
        clearCollapsibleList,
        readArticle,
        updateFileBuffer,
        saveArticle,
        setSelectedFolder,
        clearSelectedFolder,
        saveCurrentArticle,
        setEnableOutline,
        initEnableOutline,
        loadAllArticle,
        moveItem
    }
})

export default useArticleStore