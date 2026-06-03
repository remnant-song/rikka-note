// encryption.ts - 加密功能状态管理（后端密钥托管模式）
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { getAbsoluteFilePath, getWorkspacePath } from '@/lib/workspace'
import { join } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'

export const useEncryptionStore = defineStore('encryption', () => {
    // -------- 状态 --------
    // 当前已知的加密文件相对路径集合
    const encryptedFiles = ref<Set<string>>(new Set())
    // 后端是否已解锁（DEK 是否在内存中）
    const isUnlocked = ref(false)
    // 是否已初始化过加密（密钥文件是否存在）
    const isPasswordSet = ref(false)

    // -------- 密钥文件路径 --------

    /** 获取当前工作区的密钥文件路径 */
    async function getKeyFilePath(): Promise<string> {
        const workspace = await getWorkspacePath()
        return await join(workspace.path, '.encryption.key')
    }

    // -------- 初始化 --------

    /** 检查密钥文件是否存在，同步后端解锁状态 */
    async function initEncryption() {
        try {
            const keyPath = await getKeyFilePath()
            isPasswordSet.value = await exists(keyPath)
            // 同步后端解锁状态
            isUnlocked.value = await invoke<boolean>('is_encryption_unlocked')
        } catch {
            isPasswordSet.value = false
            isUnlocked.value = false
        }
    }

    // -------- 密码 / 密钥管理（全部在后端执行） --------

    /** 首次设置加密密码 */
    async function setupEncryption(password: string): Promise<void> {
        const keyPath = await getKeyFilePath()
        await invoke('setup_encryption', { password, keyFilePath: keyPath })
        isPasswordSet.value = true
        isUnlocked.value = true
    }

    /** 解锁：验证密码并加载 DEK 到后端内存 */
    async function unlock(password: string): Promise<void> {
        const keyPath = await getKeyFilePath()
        await invoke('unlock_encryption', { password, keyFilePath: keyPath })
        isUnlocked.value = true
    }

    /** 锁定：清除后端内存中的 DEK */
    async function lock(): Promise<void> {
        await invoke('lock_encryption')
        isUnlocked.value = false

        // 安全清理：引入 articleStore 并清除内存中被加密文件的所有明文缓存
        const { useArticleStore } = await import('@/stores/article')
        const articleStore = useArticleStore()
        for (const filePath of encryptedFiles.value) {
            if (articleStore.fileBuffers[filePath] !== undefined) {
                delete articleStore.fileBuffers[filePath]
            }
        }

        // 如果当前打开的文章属于加密文件，重置内容并重新读取以展示未解锁状态
        if (articleStore.activeFilePath && isEncrypted(articleStore.activeFilePath)) {
            articleStore.currentArticle = ''
            await articleStore.readArticle(articleStore.activeFilePath)
        }
    }

    /** 修改密码：O(1) 操作，只重新加密 DEK */
    async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
        const keyPath = await getKeyFilePath()
        await invoke('change_encryption_password', {
            oldPassword,
            newPassword,
            keyFilePath: keyPath
        })
    }

    // -------- 笔记加解密（不传递密码） --------

    /** 加密指定笔记 */
    async function encryptNote(relativePath: string): Promise<void> {
        const absPath = await getAbsoluteFilePath(relativePath)
        await invoke('encrypt_file', { path: absPath })
        encryptedFiles.value.add(relativePath)
    }

    /** 永久解除加密（恢复为明文文件） */
    async function removeEncryption(relativePath: string): Promise<string> {
        const absPath = await getAbsoluteFilePath(relativePath)
        // 解密获取明文
        const plaintext: string = await invoke('decrypt_file', { path: absPath })
        // 用明文覆盖写回文件
        const { writeTextFile } = await import('@tauri-apps/plugin-fs')
        await writeTextFile(absPath, plaintext)
        encryptedFiles.value.delete(relativePath)
        return plaintext
    }

    /** 读取加密笔记内容（不改变文件状态） */
    async function readEncryptedNote(relativePath: string): Promise<string> {
        const absPath = await getAbsoluteFilePath(relativePath)
        return await invoke('decrypt_file', { path: absPath })
    }

    /** 检查文件是否已加密 */
    async function checkFileEncrypted(relativePath: string): Promise<boolean> {
        const absPath = await getAbsoluteFilePath(relativePath)
        const result: boolean = await invoke('check_file_encrypted', { path: absPath })
        if (result) {
            encryptedFiles.value.add(relativePath)
        } else {
            encryptedFiles.value.delete(relativePath)
        }
        return result
    }

    /** 快速判断（基于缓存，不读磁盘） */
    function isEncrypted(relativePath: string): boolean {
        return encryptedFiles.value.has(relativePath)
    }

    return {
        // 状态
        encryptedFiles,
        isUnlocked,
        isPasswordSet,
        // 方法
        getKeyFilePath,
        initEncryption,
        setupEncryption,
        unlock,
        lock,
        changePassword,
        encryptNote,
        removeEncryption,
        readEncryptedNote,
        checkFileEncrypted,
        isEncrypted,
    }
})
