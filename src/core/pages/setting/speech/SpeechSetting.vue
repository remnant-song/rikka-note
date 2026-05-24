<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b">
      <div class="space-y-1.5 flex-1">
        <h3 class="text-2xl font-bold tracking-tight text-foreground">{{ t('settings.speech.title') }}</h3>
        <p class="text-sm text-muted-foreground max-w-2xl leading-relaxed">
          {{ t('settings.speech.description') }}
        </p>
      </div>
    </div>

    <!-- 模型状态面板 -->
    <div class="grid gap-3 animate-in fade-in duration-500">
      <!-- ASR 模型已就绪 -->
      <div v-if="isAsrModelReady" class="p-3.5 rounded-xl border border-emerald-200/50 bg-emerald-50/50 text-emerald-700 text-sm flex items-center gap-3 backdrop-blur-sm">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        </div>
        <div class="space-y-0.5">
          <p class="font-bold">{{ t('settings.speech.asrModelReady') }}</p>
          <p class="font-mono text-xs opacity-80">{{ t('settings.speech.modelDescriptionInt8') }}</p>
        </div>
      </div>

      <!-- ASR 模型未下载 -->
      <div v-else class="p-3.5 rounded-xl border border-amber-200/50 bg-amber-50/50 text-amber-700 text-sm flex items-center gap-3 backdrop-blur-sm">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
        </div>
        <p class="font-medium">{{ t('settings.speech.asrModelNotReady') }}</p>
      </div>

      <!-- VAD 模型已就绪 -->
      <div v-if="isVadModelReady" class="p-3.5 rounded-xl border border-emerald-200/50 bg-emerald-50/50 text-emerald-700 text-sm flex items-center gap-3 backdrop-blur-sm">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        </div>
        <p class="font-bold">{{ t('settings.speech.vadModelReady') }}</p>
      </div>

      <!-- VAD 模型未下载 -->
      <div v-else class="p-3.5 rounded-xl border border-amber-200/50 bg-amber-50/50 text-amber-700 text-sm flex items-center gap-3 backdrop-blur-sm">
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
        </div>
        <p class="font-medium">{{ t('settings.speech.vadModelNotReady') }}</p>
      </div>
    </div>

    <!-- 模型下载配置面板 -->
    <div class="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
      <div class="grid gap-6 grid-cols-1">
        
        <!-- ASR 模型下载卡片 -->
        <div class="flex flex-col space-y-4 p-5 border rounded-2xl bg-card shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center gap-3 font-semibold text-lg border-b pb-3 text-card-foreground">
            <div class="p-2 rounded-lg bg-primary/10 text-primary">
              <Mic class="w-5 h-5" />
            </div>
            {{ t('settings.speech.asrModel') }}
          </div>

          <div class="space-y-4">
            <div class="space-y-2">
              <Label class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {{ t('settings.speech.presetModel') }}
              </Label>
              <Select :model-value="selectedAsrModel" @update:model-value="onAsrModelSelect">
                <SelectTrigger class="h-10">
                  <SelectValue :placeholder="t('settings.speech.selectModel')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in asrModels" :key="m.id" :value="m.id">
                    {{ m.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- 镜像源选择 -->
          <div class="space-y-2">
            <Label class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {{ t('settings.speech.downloadSource') }}
            </Label>
            <Select :model-value="selectedMirror" @update:model-value="selectedMirror = $event as string">
              <SelectTrigger class="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="original">{{ t('settings.speech.sourceOriginal') }}</SelectItem>
                <SelectItem value="mirror">{{ t('settings.speech.sourceMirror') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center gap-3 pt-2">
            <Button @click="downloadAsrModel" :disabled="isAsrDownloading || isAsrModelReady" variant="secondary" class="flex-1 h-10 font-medium shrink-0">
              <Download class="w-4 h-4 mr-2" />
              {{ isAsrModelReady ? t('settings.speech.modelReady') : t('settings.speech.downloadModel') }}
            </Button>
            <Button variant="outline" @click="checkAsrModel(true)" :disabled="isAsrDownloading" class="flex-1 h-10 text-muted-foreground hover:text-primary transition-colors shrink-0">
              <RefreshCw class="w-4 h-4 mr-2" />
              {{ t('settings.speech.recheck') }}
            </Button>
          </div>
        </div>

        <!-- VAD 模型下载卡片 -->
        <div class="flex flex-col space-y-4 p-5 border rounded-2xl bg-card shadow-sm hover:shadow-md transition-shadow">
          <div class="flex items-center gap-3 font-semibold text-lg border-b pb-3 text-card-foreground">
            <div class="p-2 rounded-lg bg-primary/10 text-primary">
              <AudioWaveform class="w-5 h-5" />
            </div>
            {{ t('settings.speech.vadModel') }}
          </div>

          <p class="text-xs text-muted-foreground">
            {{ t('settings.speech.vadModelDesc') }}
          </p>

          <div class="flex items-center gap-3 pt-2">
            <Button @click="downloadVadModel" :disabled="isVadDownloading || isVadModelReady" variant="secondary" class="flex-1 h-10 font-medium shrink-0">
              <Download class="w-4 h-4 mr-2" />
              {{ isVadModelReady ? t('settings.speech.modelReady') : t('settings.speech.downloadModel') }}
            </Button>
            <Button variant="outline" @click="checkVadModel(true)" :disabled="isVadDownloading" class="flex-1 h-10 text-muted-foreground hover:text-primary transition-colors shrink-0">
              <RefreshCw class="w-4 h-4 mr-2" />
              {{ t('settings.speech.recheck') }}
            </Button>
          </div>
        </div>
      </div>

      <!-- 下载进度条 -->
      <div class="space-y-4">
        <div v-if="isAsrDownloading" class="space-y-2.5 p-5 border rounded-2xl bg-muted/30 backdrop-blur-sm">
          <div class="flex justify-between items-center text-sm">
            <span class="flex items-center gap-2 font-medium">
              <Loader2 class="w-4 h-4 animate-spin text-primary" />
              {{ t('settings.speech.downloadingAsr') }}: <span class="text-muted-foreground">{{ currentAsrFile }}</span>
            </span>
            <span v-if="asrDownloadTotal > 0" class="font-mono text-xs text-primary font-bold">
              {{ (asrDownloadedBytes / 1024 / 1024).toFixed(2) }} MB / {{ (asrDownloadTotal / 1024 / 1024).toFixed(2) }} MB
            </span>
          </div>
          <div class="w-full h-2 bg-muted rounded-full overflow-hidden border">
            <div class="h-full bg-primary transition-all duration-300 shadow-[0_0_10px_rgba(var(--primary),0.5)]" :style="{ width: `${asrDownloadProgress}%` }"></div>
          </div>
        </div>

        <div v-if="isVadDownloading" class="space-y-2.5 p-5 border rounded-2xl bg-muted/30 backdrop-blur-sm">
          <div class="flex justify-between items-center text-sm">
            <span class="flex items-center gap-2 font-medium">
              <Loader2 class="w-4 h-4 animate-spin text-primary" />
              {{ t('settings.speech.downloadingVad') }}
            </span>
            <span v-if="vadDownloadTotal > 0" class="font-mono text-xs text-primary font-bold">
              {{ (vadDownloadedBytes / 1024 / 1024).toFixed(2) }} MB / {{ (vadDownloadTotal / 1024 / 1024).toFixed(2) }} MB
            </span>
          </div>
          <div class="w-full h-2 bg-muted rounded-full overflow-hidden border">
            <div class="h-full bg-primary transition-all duration-300 shadow-[0_0_10px_rgba(var(--primary),0.5)]" :style="{ width: `${vadDownloadProgress}%` }"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/composables/useToast'
import { Download, RefreshCw, Loader2, Mic, AudioWaveform } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { logger } from '@/utils/logger'

const { t } = useI18n()
const { success, error, info } = useToast()

// 模型状态
const isAsrModelReady = ref(false)
const isVadModelReady = ref(false)

// 下载状态
const isAsrDownloading = ref(false)
const isVadDownloading = ref(false)
const asrDownloadProgress = ref(0)
const asrDownloadedBytes = ref(0)
const asrDownloadTotal = ref(0)
const currentAsrFile = ref('')
const vadDownloadProgress = ref(0)
const vadDownloadedBytes = ref(0)
const vadDownloadTotal = ref(0)

// 镜像源选择
const selectedMirror = ref('original')

// ASR 模型选择
const selectedAsrModel = ref('sense_voice_int8')

// ASR 模型列表
const asrModels = [
  {
    id: 'sense_voice_int8',
    name: t('settings.speech.modelNameInt8'),
    files: [
      { filename: 'model.int8.onnx', path: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/model.int8.onnx' },
      { filename: 'tokens.txt', path: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/tokens.txt' }
    ]
  }
]

// VAD 模型信息
const vadModel = {
  filename: 'silero_vad.onnx',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx'
}

// 构建下载 URL（支持镜像）
const getDownloadUrl = (path: string) => {
  const base = selectedMirror.value === 'mirror'
    ? 'https://hf-mirror.com'
    : 'https://huggingface.co'
  return `${base}/${path}`
}

let unlistenProgress: (() => void) | null = null

onMounted(async () => {
  await checkAsrModel()
  await checkVadModel()

  // 监听下载进度事件
  unlistenProgress = await listen<{ filename: string; downloaded: number; total: number }>(
    'speech-model-download-progress',
    (event) => {
      const { filename, downloaded, total } = event.payload
      
      if (filename === 'silero_vad.onnx') {
        vadDownloadedBytes.value = downloaded
        vadDownloadTotal.value = total || 1
        vadDownloadProgress.value = (downloaded / (total || 1)) * 100
        if (downloaded >= (total || 0) && total > 0) {
          isVadDownloading.value = false
          isVadModelReady.value = true
          vadDownloadProgress.value = 100
          success(t('settings.speech.downloadSuccess'), 'VAD')
        }
      } else {
        currentAsrFile.value = filename
        asrDownloadedBytes.value = downloaded
        asrDownloadTotal.value = total || 1
        asrDownloadProgress.value = (downloaded / (total || 1)) * 100
      }
    }
  )
})

onUnmounted(() => {
  if (unlistenProgress) unlistenProgress()
})

const checkAsrModel = async (showToast = false) => {
  try {
    const exists = await invoke<boolean>('check_speech_model_exists', { modelType: 'sense_voice' })
    isAsrModelReady.value = exists
    if (showToast) {
      exists ? info(t('settings.speech.modelReady')) : error(t('settings.speech.modelNotReady'))
    }
  } catch (e) {
    if (showToast) error(`${e}`)
  }
}

const checkVadModel = async (showToast = false) => {
  try {
    const exists = await invoke<boolean>('check_speech_model_exists', { modelType: 'vad' })
    isVadModelReady.value = exists
    if (showToast) {
      exists ? info(t('settings.speech.modelReady')) : error(t('settings.speech.modelNotReady'))
    }
  } catch (e) {
    if (showToast) error(`${e}`)
  }
}

const onAsrModelSelect = (val: any) => {
  if (val) selectedAsrModel.value = val.toString()
}

const downloadAsrModel = async () => {
  const model = asrModels.find(m => m.id === selectedAsrModel.value)
  if (!model) return

  isAsrDownloading.value = true
  asrDownloadProgress.value = 0
  asrDownloadedBytes.value = 0
  currentAsrFile.value = t('settings.speech.preparing')

  try {
    for (const file of model.files) {
      const url = getDownloadUrl(file.path)
      currentAsrFile.value = file.filename
      logger.ai.info(`[Speech] 开始下载: ${file.filename}`, { url })
      await invoke<string>('download_speech_model', { url, filename: file.filename })
    }
    isAsrModelReady.value = true
    success(t('settings.speech.downloadSuccess'), t('settings.speech.asrModel'))
  } catch (e: any) {
    logger.ai.error('[Speech] ASR 模型下载失败:', e)
    error(t('settings.speech.downloadFailed', { error: e }))
  } finally {
    isAsrDownloading.value = false
  }
}

const downloadVadModel = async () => {
  isVadDownloading.value = true
  vadDownloadProgress.value = 0
  vadDownloadedBytes.value = 0

  try {
    logger.ai.info('[Speech] 开始下载 VAD 模型')
    await invoke<string>('download_speech_model', { 
      url: vadModel.url, 
      filename: vadModel.filename 
    })
    isVadModelReady.value = true
    success(t('settings.speech.downloadSuccess'), 'VAD')
  } catch (e: any) {
    logger.ai.error('[Speech] VAD 模型下载失败:', e)
    error(t('settings.speech.downloadFailed', { error: e }))
  } finally {
    isVadDownloading.value = false
  }
}
</script>
