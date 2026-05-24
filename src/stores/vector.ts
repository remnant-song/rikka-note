import { defineStore } from 'pinia';
import { ref } from 'vue';
import { 
  initVectorDb as initDb, 
  processAllMarkdownFiles, 
  processMarkdownFile, 
  checkEmbeddingModelAvailable,
  getVectorDocumentCount
} from '@/lib/rag';
import { checkRerankModelAvailable } from '@/lib/ai';
import { Store } from "@tauri-apps/plugin-store";
import { useToast } from "@/composables/useToast";
import { logger } from "@/utils/logger.ts";
import { useI18n } from "@/composables/useI18n";

export const useVectorStore = defineStore('vector', () => {
  // State
  const isVectorDbEnabled = ref(false);
  const isRagEnabled = ref(false);
  const isProcessing = ref(false);
  const lastProcessTime = ref<number | null>(null);
  const hasRerankModel = ref(false);
  const documentCount = ref(0);
  const { success, error, info } = useToast();
  const { t } = useI18n();

  // 检查嵌入模型可用性
  const checkEmbeddingModel = async () => {
    try {
      const result = await checkEmbeddingModelAvailable();
      if (typeof result === 'string') {
        logger.rag.error('检查嵌入模型失败:', result);
        return false;
      }
      return result;
    } catch (error) {
      logger.rag.error('检查嵌入模型失败:', error);
      return false;
    }
  };

  const checkRerankModel = async () => {
    try {
      const modelAvailable = await checkRerankModelAvailable();
      hasRerankModel.value = modelAvailable;
      return modelAvailable;
    } catch (error) {
      logger.rag.error('检查重排序模型失败:', error);
      hasRerankModel.value = false;
      return false;
    }
  };

  const setVectorDbEnabled = async (enabled: boolean) => {
    try {
      const store = await Store.load('store.json');
      await store.set('isVectorDbEnabled', enabled);
      await store.save(); // Ensure save is called if needed, though set might auto-save depending on plugin version

      isVectorDbEnabled.value = enabled;

      // 如果启用向量数据库，检查嵌入模型是否可用
      if (enabled) {
        const modelAvailable = await checkEmbeddingModel();
        if (!modelAvailable) {
          error(t('rag.toast.embeddingModelNotConfigured'));

          // 自动禁用
          await store.set('isVectorDbEnabled', false);
          await store.save();
          isVectorDbEnabled.value = false;
        }
      }
    } catch (error) {
      logger.rag.error('设置向量数据库状态失败:', error);
    }
  };

  const setRagEnabled = async (enabled: boolean) => {
    try {
      const store = await Store.load('store.json');
      await store.set('isRagEnabled', enabled);
      await store.save();

      isRagEnabled.value = enabled;

      // 如果启用RAG但向量数据库未启用，自动启用向量数据库
      if (enabled && !isVectorDbEnabled.value) {
        await setVectorDbEnabled(true);
      }
    } catch (error) {
      logger.rag.error('设置RAG状态失败:', error);
    }
  };

  const initVectorDb = async () => {
    try {
      await initDb();

      // 读取用户设置
      const store = await Store.load('store.json');
      const savedIsVectorDbEnabled = await store.get<boolean>('isVectorDbEnabled');
      const savedIsRagEnabled = await store.get<boolean>('isRagEnabled');
      const savedLastProcessTime = await store.get<number>('lastVectorProcessTime');

      isVectorDbEnabled.value = savedIsVectorDbEnabled || false;
      isRagEnabled.value = savedIsRagEnabled || false;
      lastProcessTime.value = savedLastProcessTime || null;
      
      // Load document count
      documentCount.value = await getVectorDocumentCount();
      
    } catch (error) {
      logger.rag.error('初始化向量数据库失败:', error);
    }
  };

  const processAllDocuments = async () => {
    // 如果已经在处理中，直接返回
    if (isProcessing.value) return;

    try {
      // 检查嵌入模型是否可用
      const modelAvailable = await checkEmbeddingModel();
      if (!modelAvailable) {
        error(t('rag.toast.embeddingModelNotConfigured'));
        return;
      }

      // 设置处理状态
      isProcessing.value = true;

      // 显示处理开始的提示
      info(t('rag.toast.processingVectorsInfo'));

      // 处理所有文档
      const result = await processAllMarkdownFiles();

      // 更新处理时间和状态
      const currentTime = Date.now();
      const store = await Store.load('store.json');
      await store.set('lastVectorProcessTime', currentTime);
      await store.save();

      isProcessing.value = false;
      lastProcessTime.value = currentTime;
      documentCount.value = result.success; // Note: result might not return total count in exact same structure, need to verify

      // 显示处理结果
      success(t('rag.toast.vectorProcessSuccess', { success: result.success, failed: result.failed }));
    } catch (error: any) {
      logger.rag.error('处理文档向量失败:', error);
      isProcessing.value = false;

      error(t('rag.toast.vectorProcessFailed'));
    }
  };

  const processDocument = async (filename: string, content?: string): Promise<boolean> => {
    // 如果向量数据库未启用，直接返回
    if (!isVectorDbEnabled.value) return false;
    
    try {
      const success = await processMarkdownFile(filename, content);
      
      // 更新文档计数
      documentCount.value = await getVectorDocumentCount();
      
      return success;
    } catch (error) {
      logger.rag.error(`处理文档 ${filename} 向量失败:`, error);
      return false;
    }
  };

  return {
    isVectorDbEnabled,
    isRagEnabled,
    isProcessing,
    lastProcessTime,
    hasRerankModel,
    documentCount,
    initVectorDb,
    setVectorDbEnabled,
    setRagEnabled,
    processAllDocuments,
    processDocument,
    checkEmbeddingModel,
    checkRerankModel
  };
});
