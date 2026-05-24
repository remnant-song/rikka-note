import { toast } from "@/components/ui/toast/use-toast";
import { Store } from "@tauri-apps/plugin-store";
import OpenAI from 'openai';
import { AiConfig } from "@/lib/ai.types";
import { fetch } from "@tauri-apps/plugin-http";
import { logger } from "@/utils/logger";
import { i18n } from '@/locales';

/**
 * 获取当前的prompt内容
 */
async function getPromptContent(): Promise<string> {
  const store = await Store.load('store.json')
  const currentPromptId = await store.get<string>('currentPromptId')
  let promptContent = ''
  
  if (currentPromptId) {
    const promptList = await store.get<Array<{id: string, content: string}>>('promptList')
    if (promptList) {
      const currentPrompt = promptList.find(prompt => prompt.id === currentPromptId)
      if (currentPrompt && currentPrompt.content) {
        promptContent = currentPrompt.content
      }
    }
  }
  
  return promptContent
}

/**
 * 获取AI设置
 */
async function getAISettings(modelType?: string): Promise<AiConfig | undefined> {
  const store = await Store.load('store.json')
  const aiConfigs = await store.get<AiConfig[]>('aiModelList')
  const modelKey = await store.get<string>(modelType || 'primaryModel')
  
  const keyToFind = modelKey || await store.get<string>('primaryModel')
  
  // Special handling for local injected models
  if (keyToFind === 'local-llama-server') {
    const port = await store.get<number>('localChatPort') || 8081
    const modelStr = await store.get<string>('localChatModelStr') || 'local-model'
    return {
      key: 'local-llama-server',
      title: '本地推理模型',
      baseURL: `http://127.0.0.1:${port}/v1`,
      model: modelStr,
      modelType: 'chat'
    }
  }

  if (keyToFind === 'local-embedding-server') {
    const port = await store.get<number>('localEmbeddingPort') || 8080
    const modelStr = await store.get<string>('localEmbeddingModelStr') || 'local-model'
    return {
      key: 'local-embedding-server',
      title: '本地向量模型',
      baseURL: `http://127.0.0.1:${port}/v1`,
      model: modelStr,
      modelType: 'embedding'
    }
  }

  return aiConfigs?.find(item => item.key === keyToFind)
}

/**
 * 检查AI服务配置是否有效
 */
async function validateAIService(baseURL: string | undefined): Promise<string | null> {
  if (!baseURL) {
    toast({
      title: 'AI 错误',
      description: '请先设置 AI 地址',
      variant: 'destructive',
      duration: 1500,
    })
    return null
  }
  return baseURL
}

/**
 * 处理AI请求错误
 */
export function handleAIError(error: any, showToast = true): string | null {
  const errorMessage = error instanceof Error ? error.message : '未知错误'
  // 检查是否是取消请求的错误，如果是则静默处理
  if (error.message === 'Request was aborted.') {
    // 静默处理取消请求，不显示任何消息
    return null
  }
  
  if (showToast) {
    toast({
      description: errorMessage || 'AI错误',
      variant: 'destructive',
      duration: 1500,
    })
  }
  
  return `请求失败: ${errorMessage}`
}

// 嵌入请求响应类型
interface EmbeddingResponse {
  object: string;
  model: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * 获取嵌入模型信息
 */
async function getEmbeddingModelInfo() {
  const store = await Store.load('store.json');
  const embeddingModel = await store.get<string>('embeddingModel');
  if (!embeddingModel) return null;
  
  const aiModelList = await store.get<AiConfig[]>('aiModelList');
  if (!aiModelList) return null;
  
  const modelInfo = aiModelList.find(item => 
    item.key === embeddingModel
  );
  
  return modelInfo || null;
}

/**
 * 获取重排序模型信息
 */
export async function getRerankModelInfo() {
  const store = await Store.load('store.json');
  const rerankModel = await store.get<string>('rerankModel');
  if (!rerankModel) return null;
  
  const aiModelList = await store.get<AiConfig[]>('aiModelList');
  if (!aiModelList) return null;
  
  const modelInfo = aiModelList.find(item => 
    item.key === rerankModel
  );
  
  return modelInfo || null;
}

/**
 * 检查是否有重排序模型可用
 */
export async function checkRerankModelAvailable(): Promise<boolean> {
  try {
    // 获取重排序模型信息
    const modelInfo = await getRerankModelInfo();
    if (!modelInfo) return false;
    
    const { baseURL, apiKey, model } = modelInfo;
    if (!baseURL || !model) return false;
    
    // 测试重排序模型
    const testQuery = '测试查询';
    const testDocuments = [
      '这是一个测试文档', 
      '这是另一个测试文档'
    ];
    
    // 发送测试请求
    const response = await fetch(baseURL + '/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        query: testQuery,
        documents: testDocuments
      })
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return !!(data && data.results);
  } catch (error) {
    logger.rag.error('重排序模型检查失败:', error);
    return false;
  }
}

/**
 * 请求嵌入向量
 * @param text 需要嵌入的文本
 * @param throwError 是否抛出错误，默认为false
 * @param silent 是否静默输出，默认为false
 * @returns 嵌入向量结果，如果失败则返回null
 */
export async function fetchEmbedding(text: string, throwError = false, silent = false): Promise<number[] | null> {
  try {
    if (text.length) {
      const store = await Store.load('store.json');
      const useLocalEmbedding = await store.get<boolean>('useLocalEmbedding');
      
      let baseURL, apiKey, model;

      if (useLocalEmbedding) {
        const port = await store.get<number>('localEmbeddingPort') || 8080;
        const localModelStr = await store.get<string>('localEmbeddingModelStr') || 'local-model';
        baseURL = `http://127.0.0.1:${port}/v1`;
        apiKey = 'llama.cpp';
        model = localModelStr;
      } else {
        const modelInfo = await getEmbeddingModelInfo();
        if (!modelInfo) {
          throw new Error(i18n.global.t('settings.rag.error.embeddingModelNotConfigured'));
        }
        baseURL = modelInfo.baseURL;
        apiKey = modelInfo.apiKey;
        model = modelInfo.model;
      }

      if (!silent) {
        if (useLocalEmbedding) {
          logger.rag.info(`🚀 [向量核心] 使用本地引擎: ${model}`);
        } else {
          logger.rag.info(`☁️ [向量核心] 使用远程服务: ${model}`);
        }
      }

      if (!baseURL || !model) {
        const missing = !baseURL ? 'baseURL' : 'model';
        logger.rag.error(`嵌入模型配置不完整: 缺失 ${missing}`, { baseURL, model });
        throw new Error(i18n.global.t('settings.rag.error.embeddingModelIncomplete', { missing }));
      }
      
      // 发送嵌入请求，增加对本地服务的重试机制（模型加载可能需要几秒钟）
      const maxRetries = useLocalEmbedding ? 5 : 1;
      let attempt = 0;
      let response: any = null;
      let lastError: any = null;

      if (!silent) {
        logger.rag.debug(`开始发起 Embedding 请求，内容长度: ${text.length} 字符...`);
      }

      while (attempt < maxRetries) {
        try {
          response = await fetch(baseURL + '/embeddings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey || ''}`
            },
            body: JSON.stringify({
              model: model,
              input: text,
              encoding_format: 'float'
            })
          });
          
          if (response.ok) {
            if (!silent) {
              logger.rag.debug(`✅ Embedding 获取成功 (Attempt: ${attempt + 1})`);
            }
            break; // 成功则跳出重试循环
          } else {
             const errorData = await response.json().catch(() => ({}));
             lastError = new Error(`嵌入请求失败: ${response.status} ${errorData.error?.message || response.statusText}`);
             if (response.status === 413) {
               logger.rag.error(`🚫 [Token 溢出] 分块过大（约 ${text.length} 字符），超过了模型的 512 Tokens 限制。建议减小切块 Size (当前 300 可能因为 Overlap 导致实际文本量过大)。`);
             }
             logger.rag.warn(`❌ Embedding HTTP 错误: ${response.status}`, errorData);
          }
        } catch (e: any) {
          lastError = e;
          logger.rag.warn(`❌ Embedding 网络/框架异常: ${e.message}`);
        }

        attempt++;
        if (attempt < maxRetries) {
           logger.rag.info(`⏳ 引擎服务尚未完全就绪，正在发起重试 (${attempt}/${maxRetries})... 请稍候 2s`);
           await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('嵌入请求失败');
      }
      
      const data = await response.json() as EmbeddingResponse;
      if (!data || !data.data || !data.data[0] || !data.data[0].embedding) {
        throw new Error(i18n.global.t('settings.rag.error.embeddingFormatError'));
      }
      
      return data.data[0].embedding;
    }
    
    return null;
  } catch (error) {
    if (throwError) {
      throw error;
    }
    handleAIError(error);
    return null;
  }
}

/**
 * 使用重排序模型重新排序检索的文档
 * @param query 用户查询
 * @param documents 要重新排序的文档列表
 * @returns 重新排序后的文档列表
 */
export async function rerankDocuments(
  query: string,
  documents: {id: number, filename: string, content: string, similarity: number}[]
): Promise<{id: number, filename: string, content: string, similarity: number}[]> {
  try {
    // 检查是否有文档需要重排序
    if (!documents.length) {
      return documents;
    }
    
    // 获取重排序模型信息
    const modelInfo = await getRerankModelInfo();
    if (!modelInfo) {
      // 如果没有配置重排序模型，返回原始排序
      return documents;
    }
    
    const { baseURL, apiKey, model } = modelInfo;
    
    if (!baseURL || !model) {
      return documents; // 配置不完整，返回原始排序
    }
    
    // 构建重排序请求数据
    // 注意：这里使用了OpenAI的格式，但可能需要根据实际使用的模型调整
    const passages = documents.map(doc => doc.content);
    
    const response = await fetch(baseURL + '/rerank', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Origin': ""
      },
      body: JSON.stringify({
        model: model,
        query: query,
        documents: passages
      })
    });
    
    if (!response.ok) {
      throw new Error(i18n.global.t('settings.rag.error.rerankRequestFailed', { status: response.status, statusText: response.statusText }));
    }
    
    // 解析响应
    const data = await response.json();
    
    // 检查响应格式
    if (!data || !data.results) {
      throw new Error(i18n.global.t('settings.rag.error.rerankFormatError'));
    }
    
    // 处理重排序结果
    // 将原始文档与新的相似度分数结合
    const rerankResults = data.results.map((result: any, index: number) => {
      return {
        ...documents[result.document_index || result.index || index],
        similarity: result.relevance_score || result.score || documents[index].similarity
      };
    });
    
    // 根据新的相似度分数排序
    return rerankResults.sort((a: {similarity: number}, b: {similarity: number}) => b.similarity - a.similarity);
  } catch (error) {
    logger.rag.error('重排序失败:', error);
    // 发生错误时返回原始排序
    return documents;
  }
}

/**
 * 为不同AI类型准备消息
 */
async function prepareMessages(text: string, includeLanguage = false, history: {role: string, content: string}[] = [], enableThinking = false, supportsThinking = false): Promise<{
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  geminiText?: string
}> {
  // 获取prompt内容
  let promptContent = await getPromptContent()
  
  // Inject think token for Gemma 4 if enabled
  if (enableThinking && supportsThinking) {
    promptContent = `<|think|>${promptContent}`
  }
  
  if (includeLanguage) {
    const store = await Store.load('store.json')
    const chatLanguage = await store.get<string>('chatLanguage') || 'en'
    promptContent = `[IMPORTANT] YOU MUST ONLY SPEAK ${chatLanguage}. ALL RESPONSES IN ${chatLanguage}.` +promptContent
  }
  // 定义消息数组
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
  let geminiText: string | undefined
  
  if (promptContent) {
    messages.push({
      role: 'system',
      content: promptContent
    })
  }
  
  // 添加历史消息
  if (history.length > 0) {
    history.forEach(msg => {
      // 确保role是合法的OpenAI role
      const role = (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') ? msg.role : 'user'
      if (msg.content) {
        messages.push({
          role: role as any,
          content: msg.content
        })
      }
    })
  }
  
  messages.push({
    role: 'user',
    content: text
  })
  
  return { messages, geminiText }
}

/**
 * 创建OpenAI客户端，适用于所有AI类型
 */
export async function createOpenAIClient(AiConfig?: AiConfig) {
  const store = await Store.load('store.json')
  let baseURL
  let apiKey
  if (AiConfig) {
    baseURL = AiConfig.baseURL
    apiKey = AiConfig.apiKey
  } else {
    baseURL = await store.get<string>('baseURL')
    apiKey = await store.get<string>('apiKey')
  }
  const proxyUrl = await store.get<string>('proxy')
  
  // 创建OpenAI客户端
  return new OpenAI({
    apiKey: apiKey || '',
    baseURL: baseURL,
    dangerouslyAllowBrowser: true,
    fetch: fetch, // 使用 Tauri 提供的 HTTP 插件，以绕过 CORS/CSP 限制并处理大体积文件上传
    defaultHeaders:{
      "x-stainless-arch": null,
      "x-stainless-lang": null,
      "x-stainless-os": null,
      "x-stainless-package-version": null,
      "x-stainless-retry-count": null,
      "x-stainless-runtime": null,
      "x-stainless-runtime-version": null,
      "x-stainless-timeout": null,
      ...(AiConfig?.customHeaders || {})
    },
    ...(proxyUrl ? { httpAgent: proxyUrl } : {})
  })
}

/**
 * 非流式方式获取AI结果
 */
export async function fetchAi(text: string, history: {role: string, content: string}[] = []): Promise<string> {
  try {
    // 获取AI设置
    const aiConfig = await getAISettings()
    
    // 验证AI服务
    if (validateAIService(aiConfig?.baseURL) === null) return ''
    
    // 获取思考模式状态
    const store = await Store.load('store.json')
    const useThink = await store.get<boolean>('useThink') || false

    // 准备消息
    const { messages } = await prepareMessages(text, false, history, useThink, aiConfig?.supportsThinking)

    const openai = await createOpenAIClient(aiConfig)
    
    // Merge local advanced settings if applicable
    let temperature = aiConfig?.temperature || 1
    let top_p = aiConfig?.topP || 1
    let max_tokens = undefined
    let frequency_penalty = undefined
    let presence_penalty = undefined
    let stop = undefined

    if (aiConfig?.key === 'local-llama-server') {
       temperature = await store.get<number>('localChatTemp') ?? 0.7
       top_p = await store.get<number>('localChatTopP') ?? 1.0
       max_tokens = await store.get<number>('localChatMaxTokens') ?? 2048
       frequency_penalty = await store.get<number>('localChatFreqPen') ?? 0.0
       presence_penalty = await store.get<number>('localChatPresPen') ?? 0.0
       const stopStr = await store.get<string>('localChatStop')
       if (stopStr) {
          stop = stopStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
       }
    }

    const completion = await openai.chat.completions.create({
      model: aiConfig?.model || '',
      messages: messages,
      temperature,
      top_p,
      max_tokens,
      frequency_penalty,
      presence_penalty,
      stop,
    } as any)
    
    return completion.choices[0].message.content || ''
  } catch (error) {
    return handleAIError(error) || ''
  }
}

/**
 * 流式方式获取AI结果
 * @param text 请求文本
 * @param onUpdate 每次收到流式内容时的回调函数
 * @param abortSignal 用于终止请求的信号
 * @param history 历史消息上下文
 */
export async function fetchAiStream(text: string, onUpdate: (content: string) => void, abortSignal?: AbortSignal, history: {role: string, content: string}[] = []): Promise<string> {
  try {
    
    // 获取AI设置
    const aiConfig = await getAISettings()
    
    // 验证AI服务
    if (await validateAIService(aiConfig?.baseURL) === null) return ''
    
    // 加载思考模式开关状态
    const store = await Store.load('store.json')
    const useThink = await store.get<boolean>('useThink') || false

    // 准备消息
    const { messages } = await prepareMessages(text, true, history, useThink, aiConfig?.supportsThinking)

    logger.assistant.debug('--- AI Request Debug ---')
    logger.assistant.debug('Model:', aiConfig?.model)
    logger.assistant.debug('Messages:', messages)
    logger.assistant.debug('Config:', { temperature: aiConfig?.temperature, top_p: aiConfig?.topP })

    const openai = await createOpenAIClient(aiConfig)
    
    // Merge local advanced settings if applicable
    let temperature = aiConfig?.temperature || 1
    let top_p = aiConfig?.topP || 1
    let max_tokens = undefined
    let frequency_penalty = undefined
    let presence_penalty = undefined
    let stop = undefined

    if (aiConfig?.key === 'local-llama-server') {
       temperature = await store.get<number>('localChatTemp') ?? 0.7
       top_p = await store.get<number>('localChatTopP') ?? 1.0
       max_tokens = await store.get<number>('localChatMaxTokens') ?? 2048
       frequency_penalty = await store.get<number>('localChatFreqPen') ?? 0.0
       presence_penalty = await store.get<number>('localChatPresPen') ?? 0.0
       const stopStr = await store.get<string>('localChatStop')
       if (stopStr) {
          stop = stopStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
       }
    }

    const stream = await openai.chat.completions.create({
      model: aiConfig?.model || '',
      messages: messages,
      temperature,
      top_p,
      max_tokens,
      frequency_penalty,
      presence_penalty,
      stop,
      stream: true,
    } as any, {
      signal: abortSignal
    })
    
    
    let thinking = ''
    let fullContent = ''
    
    for await (const chunk of stream) {
      if (abortSignal?.aborted) {
        break;
      }
      
      const thinkingContent = (chunk.choices[0]?.delta as any)?.reasoning_content || ''
      const content = chunk.choices[0]?.delta?.content || ''
      if (thinkingContent) {
        thinking += thinkingContent
        fullContent = `<thinking>${thinking}</thinking>`
      }
      if (content) {
        fullContent += content
      }
      onUpdate(fullContent)
    }
    
    return fullContent
  } catch (error) {
    return handleAIError(error) || ''
  }
}

/**
 * 流式方式获取AI结果，每次返回本次 token
 * @param text 请求文本
 * @param onUpdate 每次收到流式内容时的回调函数
 * @param abortSignal 用于终止请求的信号
 * @param history 历史消息上下文
 */
export async function fetchAiStreamToken(text: string, onUpdate: (content: string) => void, abortSignal?: AbortSignal, history: {role: string, content: string}[] = []): Promise<string> {
  try {
    // 获取AI设置
    const aiConfig = await getAISettings()
    
    // 验证AI服务
    if (await validateAIService(aiConfig?.baseURL) === null) return ''
    
    // 加载思考模式开关状态
    const store = await Store.load('store.json')
    const useThink = await store.get<boolean>('useThink') || false

    // 准备消息
    const { messages } = await prepareMessages(text, true, history, useThink, aiConfig?.supportsThinking)
  
    const openai = await createOpenAIClient(aiConfig)

    const stream = await openai.chat.completions.create({
      model: aiConfig?.model || '',
      messages: messages,
      temperature: aiConfig?.temperature,
      top_p: aiConfig?.topP,
      stream: true,
    }, {
      signal: abortSignal
    })
    
    for await (const chunk of stream) {
      if (abortSignal?.aborted) {
        break;
      }
      
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        onUpdate(content)
      }
    }
    
    return ''
  } catch (error) {
    return handleAIError(error) || ''
  }
}


/**
 * 压缩 base64 格式的图片，降低分辨率并转换为 jpeg 格式以减小体积
 */
async function compressImage(base64: string, maxWidth = 1024, maxHeight = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 避开可能跨域的问题
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // 缩放计算，等比例缩放限制在最大宽高度之内
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // 转为 jpeg 并设置质量以大大减小 Base64 长度
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    img.onerror = (err) => {
      reject(new Error('Image load failed during compression'));
    };
    img.src = base64;
  });
}

export async function fetchAiDescByImage(base64: string) {
  try {
    // 获取 VLM 相关 AI 设置
    const aiConfig = await getAISettings('imageMethodModel')
    if (!aiConfig) {
      logger.vision.warn('VLM 配置未找到，中止请求')
      toast({
        title: i18n.global.t('settings.vision.status.configError'),
        description: i18n.global.t('settings.vision.status.configErrorDesc'),
        variant: 'destructive',
        duration: 1500,
      })
      return null
    }

    // 确保 base64 格式正确 (OpenAI 要求包含 data:image/...;base64,前缀)
    let imageUrl = base64
    if (!base64.startsWith('data:image/')) {
        imageUrl = `data:image/jpeg;base64,${base64}`
    }
    
    // 对大图进行前端 Canvas 压缩，防止网络包过大被 SiliconFlow 限制或造成请求挂起
    logger.vision.info('Original Image URL length:', imageUrl.length)
    if (imageUrl.length > 200000) { // 大于约 150KB 时进行压缩
      try {
        logger.vision.debug('Image is large, compressing for VLM...')
        imageUrl = await compressImage(imageUrl, 1024, 1024, 0.7)
        logger.vision.info('Compressed Image URL length:', imageUrl.length)
      } catch (compressErr) {
        logger.vision.warn('Image compression failed, using original:', compressErr)
      }
    }

    logger.vision.info('Invoking AI image model:', aiConfig.model, 'BaseURL:', aiConfig.baseURL)
    const descContent = i18n.global.t('settings.vision.prompt')
    
    // 创建 OpenAI 客户端
    logger.vision.debug('Creating OpenAI client for VLM...')
    const openai = await createOpenAIClient(aiConfig)

    // 发起 VLM API 请求，并设置 45 秒超时限制防止网络原因或服务响应过慢导致无限挂起
    logger.vision.info(`Calling openai.chat.completions.create with model: ${aiConfig.model || ''}, timeout: 45s...`)
    const completion = await openai.chat.completions.create({
      model: aiConfig?.model || '',
      messages: [{
        role: 'user' as const,
        content: [
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          },
          {
            type: 'text',
            text: descContent
          }
        ]
      }],
      temperature: aiConfig?.temperature || 0.7,
      top_p: aiConfig?.topP || 0.7,
    }, {
      timeout: 45000 // 45 秒超时配置
    })
    
    const result = completion.choices[0]?.message?.content || ''
    logger.vision.info('VLM API call completed successfully. Response length:', result.length)
    logger.vision.debug('VLM Response preview:', result.substring(0, 100))
    return result
  } catch (error: any) {
    // 捕获并记录非常详细的错误信息
    logger.vision.error('VLM API call failed with exception:', error)
    if (error && typeof error === 'object') {
      logger.vision.error('VLM Detailed error info:', {
        name: error.name,
        message: error.message,
        status: error.status,
        headers: error.headers,
        stack: error.stack
      })
    }
    handleAIError(error, true)
    return null
  }
}

// placeholder
export async function fetchAiPlaceholder(text: string): Promise<string | false> {
  try {
    // 获取AI设置
    const aiConfig = await getAISettings('placeholderPrimaryModel')

    // 构建 placeholder 提示词
    const placeholderPrompt = `
      You are a note-taking software with an intelligent assistant. You can refer to the recorded content to take notes.
      Do not exceed 20 characters.
      There is only one line left. Line breaks are prohibited.
      Do not generate any special characters.
      Leave it as plain text and no format is required.
      Generate a question based on the following content:
      ${text}`

    // 准备消息
    const { messages } = await prepareMessages(`${placeholderPrompt}\n\n${text}`, false)
    
    const openai = await createOpenAIClient(aiConfig)
      
    const completion = await openai.chat.completions.create({
      model: aiConfig?.model || '',
      messages: messages,
      temperature: aiConfig?.temperature || 1,
      top_p: aiConfig?.topP || 1,
    })

    const result = completion.choices[0]?.message?.content || ''

    // 去掉所有换行符和各种特殊符号，不包括空格
    return result.trim()
  } catch {
    return false
  }
}

// 翻译
export async function fetchAiTranslate(text: string, targetLanguage: string): Promise<string> {
  try {
    // 获取AI设置
    const aiConfig = await getAISettings('translatePrimaryModel')
    
    // 构建翻译提示词
    const translationPrompt = `Translate the following text to ${targetLanguage}. Maintain the original formatting, markdown syntax, and structure:`
    
    // 准备消息
    const { messages } = await prepareMessages(`${translationPrompt}\n\n${text}`, false)
    const openai = await createOpenAIClient(aiConfig)
    
    const completion = await openai.chat.completions.create({
      model: aiConfig?.model || '',
      messages: messages,
      temperature: aiConfig?.temperature || 1,
      top_p: aiConfig?.topP || 1,
    })
    
    return completion.choices[0]?.message?.content || ''
  } catch (error) {
    return handleAIError(error) || ''
  }
}
