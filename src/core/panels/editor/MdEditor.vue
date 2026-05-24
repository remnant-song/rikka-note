<template>
  <div class="flex-1 relative w-full h-full flex flex-col overflow-hidden dark:bg-zinc-950">
    <MdEditor
        v-model="text"
        :theme="isDark ? 'dark' : 'light'"
        :toolbars="toolbars"
        :editor-id="editorId"
        @onUploadImg="onUploadImg"
        @onGetControl="onGetControl"
        @click="updateSelection"
        @keyup="updateSelection"
        @focus="handleFocus"
        class="flex-1"
    />
  </div>
</template>
<script setup lang="ts">
import {onMounted, onUnmounted, ref, watch, computed} from 'vue';
import {MdEditor, config} from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import {v4 as uuid} from 'uuid';
import {useI18n} from '@/composables/useI18n';

// ============================================
// 配置 md-editor-v3 使用本地库
// ============================================
import screenfull from 'screenfull';
import mermaid from 'mermaid';
import katex from 'katex';
import * as echarts from 'echarts';
import Cropper from 'cropperjs';
import * as prettier from 'prettier';
import prettierPluginMarkdown from 'prettier/plugins/markdown';
import hljs from 'highlight.js';

import {getWorkspacePath} from '@/lib/workspace';

const props = defineProps<{
  path: string;
  id: string; // 标签 ID
}>();

// 缓存工作区路径，用于同步渲染器预览图片
let cachedWorkspacePath = '';
const updateWorkspaceCache = async () => {
  const ws = await getWorkspacePath();
  cachedWorkspacePath = ws.path;
};

// 配置编辑器使用本地库
config({
  markdownItConfig(md) {
    const defaultRender = md.renderer.rules.image || function (tokens: any, idx: number, options: any, _env: any, self: any) {
      return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.image = (tokens: any, idx: number, options: any, env: any, self: any) => {
      const token = tokens[idx];
      const srcIndex = token.attrIndex('src');
      const src = token.attrs[srcIndex][1];

      if (src.startsWith('images/') && cachedWorkspacePath) {
        const absolutePath = `${cachedWorkspacePath}/${src}`;
        token.attrs[srcIndex][1] = convertFileSrc(absolutePath);
      }

      return defaultRender(tokens, idx, options, env, self);
    };
  },
  editorExtensions: {
    screenfull: { instance: screenfull },
    mermaid: { instance: mermaid },
    katex: { instance: katex },
    echarts: { instance: echarts },
    cropper: { instance: Cropper },
    highlight: { instance: hljs },
    prettier: {
      prettierInstance: prettier,
      parserMarkdownInstance: prettierPluginMarkdown,
    },
  },
});

import {join} from '@tauri-apps/api/path';
import {exists, mkdir, writeFile} from '@tauri-apps/plugin-fs';
import {useArticleStore} from '@/stores/article';
import {useChatStore} from '@/stores/chat';
import {convertFileSrc} from '@tauri-apps/api/core';
import { logger } from '@/utils/logger';
import {useSettingStore} from '@/stores/setting';
import {fetchAiDescByImage} from '@/lib/ai';
import { useToast } from '@/composables/useToast';

const {t} = useI18n();
const articleStore = useArticleStore();
const chatStore = useChatStore();
const settingStore = useSettingStore();
const { info, success, error: toastError } = useToast();

// 编辑器内容：初始化从缓冲区取值，或读取文件
const text = ref('');
// 健壮性处理：防止 props.id 未定义导致 substring 崩溃
const editorId = computed(() => `md-editor-${(props.id || uuid()).substring(0, 8)}`);
const isDark = ref(document.documentElement.classList.contains('dark'));
const isAnalyzing = ref(false);

const toolbars = computed(() => [...settingStore.editorToolbar] as any);

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.attributeName === 'class') {
      isDark.value = document.documentElement.classList.contains('dark');
    }
  });
});

onMounted(async () => {
  logger.editor.debug(`[MdEditor] Mounted - id: ${props.id}, path: ${props.path}`);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  updateWorkspaceCache();

  // 如果缓冲区没有该文件，则读取之
  if (!articleStore.fileBuffers[props.path]) {
    logger.editor.debug(`[MdEditor] Buffer miss, reading article: ${props.path}`);
    await articleStore.readArticle(props.path);
  }
  text.value = articleStore.fileBuffers[props.path] || '';
});

// 监听缓冲区变化（用于同步分屏修改）
watch(
  () => articleStore.fileBuffers[props.path],
  (newVal) => {
    if (newVal !== undefined && newVal !== text.value) {
      logger.editor.debug(`[MdEditor] Syncing from buffer for: ${props.path}`);
      text.value = newVal;
    }
  }
);

// 监听本地 text 变化，更新缓冲区并触发保存
let saveTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => text.value,
  (newContent) => {
    if (newContent !== articleStore.fileBuffers[props.path]) {
      articleStore.updateFileBuffer(props.path, newContent);
      logger.editor.debug(`监听本地 text 变化，更新缓冲区并触发保存`);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          await articleStore.saveArticle(props.path, newContent);
        } catch (err) {
          logger.editor.error('Auto-save failed:', err);
        }
      }, 300);
    }
  }
);

const handleFocus = () => {
    // 聚焦时更新全局活跃路径，保持与旧系统逻辑一致（如侧边栏高亮）
    articleStore.setActiveFilePath(props.path);
};

const editorRef = ref<any>(null);
const onGetControl = (ctrl: any) => { editorRef.value = ctrl; };

const updateSelection = () => {
    const selection = editorRef.value?.getSelection() || window.getSelection()?.toString() || '';
    chatStore.setEditContext(selection, text.value, props.path);
};

watch(() => chatStore.isEditMode, (enabled: boolean) => {
    if (enabled) updateSelection();
});

// 监听 matchPosition 变化，自动滚动到指定行
watch(() => articleStore.matchPosition, (line) => {
  if (line !== null && editorRef.value) {
    logger.editor.info(`[MdEditor] 收到跳转指令，跳转到行: ${line}`);
    // md-editor-v3 的实例提供了 scrollIntoView 方法，传入行号
    try {
      editorRef.value.scrollIntoView(line);
      // 跳转后清空标记，防止下次无法触发相同行的跳转
      articleStore.setMatchPosition(null);
    } catch (e) {
      logger.editor.warn('[MdEditor] 跳转失败，实例可能未完全就绪:', e);
    }
  }
});

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer);
  observer.disconnect();
});

// 图片上传处理 (保持原逻辑，但使用 props.path 相关的上下文)
const onUploadImg = async (files: File[], callback: (urls: string[]) => void) => {
  try {
    const workspace = await getWorkspacePath();
    if (!workspace.path) {
        toastError('未检测到活跃仓库。', t('common.error'));
        return;
    }

    const imagesDir = await join(workspace.path, 'images');
    if (!(await exists(imagesDir))) {
      await mkdir(imagesDir, { recursive: true });
    }

    const relativeImageUrls: string[] = await Promise.all(
        files.map(async (file) => {
          try {
            const fileExt = file.name.split('.').pop() || 'png';
            const fileName = `${uuid()}.${fileExt}`;
            const fullPath = await join(imagesDir, fileName);
            const uint8Array = new Uint8Array(await file.arrayBuffer());
            await writeFile(fullPath, uint8Array);
            return `images/${fileName}`;
          } catch (error) {
            logger.editor.error(`保存图片失败:`, error);
            return 'error: image save failed';
          }
        })
    );

    callback(relativeImageUrls);

    if (settingStore.autoImageAnalyze) {
      for (const relUrl of relativeImageUrls) {
        const index = relativeImageUrls.indexOf(relUrl);
          const fullPath = await join(imagesDir, relUrl.replace('images/', ''));
          const safeUrl = convertFileSrc(fullPath);
          const reader = new FileReader();
          reader.onload = async (e) => {
            const base64 = e.target?.result as string;
            if (base64) await triggerVlmAnalysis(base64, safeUrl);
          };
          reader.readAsDataURL(files[index]);
      }
    }
  } catch (error) {
    logger.editor.error('图片上传流程失败:', error);
    callback(files.map(() => 'error: upload process failed'));
  }
};

const triggerVlmAnalysis = async (base64: string, url: string) => {
    isAnalyzing.value = true;
    logger.vision.info('triggerVlmAnalysis started. Image URL:', url);
    info(t('settings.vision.status.analyzingDesc'), t('settings.vision.status.analyzing'));
    try {
        const desc = await fetchAiDescByImage(base64);
        logger.vision.info('fetchAiDescByImage returned description. Length:', desc ? desc.length : 0);
        if (desc) {
            // 对 URL 进行解码，并提取末尾的 UUID 图片文件名
            const decodedUrl = decodeURIComponent(url);
            const filename = decodedUrl.substring(Math.max(decodedUrl.lastIndexOf('/'), decodedUrl.lastIndexOf('\\')) + 1);
            logger.vision.debug(`Decoded URL: "${decodedUrl}", extracted filename: "${filename}"`);

            const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // 构建正则以模糊匹配：! [ alt 字符 ] ( 任何非右括号路径 + 唯一文件名 )
            const imgRegex = new RegExp(`!\\[(.*?)\\]\\(([^)]*?)${escapedFilename}\\)`, 'g');
            const hasMatch = imgRegex.test(text.value);
            logger.vision.debug(`Escaping Filename: "${escapedFilename}", Regex test result against editor text:`, hasMatch);
            
            if (hasMatch) {
                logger.vision.info('Image markdown match found. Appending VLM description to text...');
                imgRegex.lastIndex = 0; // 重置正则状态索引以确保正确替换
                text.value = text.value.replace(imgRegex, (match) => {
                    return `${match}\n\n> 💡 **${t('settings.vision.editor.prefix')}**: ${desc.trim()}`;
                });
                success(t('settings.vision.status.successDesc'), t('settings.vision.status.success'));
            } else {
                logger.vision.warn(`VLM description was generated successfully, but the image Markdown with filename "${filename}" could not be found in the current text. No replacement was performed.`);
            }
        } else {
            logger.vision.warn('VLM analysis returned null or empty description.');
        }
    } catch (err) {
        logger.vision.error('VLM identification failed in editor component:', err);
    } finally {
        isAnalyzing.value = false;
    }
};
</script>
