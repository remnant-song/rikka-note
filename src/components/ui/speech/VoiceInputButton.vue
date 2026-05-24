<template>
  <Button
    variant="ghost"
    size="icon"
    class="transition-all relative"
    :class="buttonClass"
    :title="buttonTitle"
    :disabled="isRecognizing"
    @click="handleClick"
  >
    <!-- 待机状态：麦克风图标 -->
    <Mic v-if="state === 'idle'" class="h-4 w-4" />

    <!-- 录音中：红色脉冲 -->
    <template v-if="state === 'recording'">
      <div class="absolute inset-0 rounded-md bg-red-500/20 animate-ping"></div>
      <MicOff class="h-4 w-4 text-red-500 relative z-10" />
    </template>

    <!-- 识别中：加载动画 -->
    <Loader2 v-if="state === 'recognizing'" class="h-4 w-4 animate-spin" />
  </Button>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Loader2 } from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import { useToast } from '@/composables/useToast.ts'
import { useI18n } from '@/composables/useI18n.ts'

const props = defineProps<{
  onResult: (text: string) => void
}>()

const { t } = useI18n()
const { error, info } = useToast()

type State = 'idle' | 'recording' | 'recognizing'
const state = ref<State>('idle')

const isRecognizing = computed(() => state.value === 'recognizing')

const buttonClass = computed(() => {
  switch (state.value) {
    case 'recording':
      return 'text-red-500 bg-red-500/10 hover:bg-red-500/20'
    case 'recognizing':
      return 'text-primary bg-primary/10'
    default:
      return 'hover:bg-muted'
  }
})

const buttonTitle = computed(() => {
  switch (state.value) {
    case 'recording':
      return t('settings.speech.stopRecording')
    case 'recognizing':
      return t('settings.speech.recognizing')
    default:
      return t('settings.speech.voiceInput')
  }
})

// ESC 键取消录音
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && state.value === 'recording') {
    cancelRecording()
  }
}

const cancelRecording = async () => {
  try {
    // 停止录音但不识别
    state.value = 'idle'
    // 仍然需要调用后端停止录音流
    await invoke<string>('stop_recording_and_recognize').catch(() => {})
  } catch {
    // 忽略取消时的错误
  }
  state.value = 'idle'
}

const handleClick = async () => {
  if (state.value === 'idle') {
    await startRecording()
  } else if (state.value === 'recording') {
    await stopAndRecognize()
  }
}

const startRecording = async () => {
  try {
    // 先检查模型是否可用
    const asrReady = await invoke<boolean>('check_speech_model_exists', { modelType: 'sense_voice' })
    if (!asrReady) {
      error(t('settings.speech.noModel'))
      return
    }

    await invoke('start_recording')
    state.value = 'recording'
    document.addEventListener('keydown', handleKeydown)
  } catch (e: any) {
    error(t('settings.speech.toast.recordStartFailed', { error: e }))
    state.value = 'idle'
  }
}

const stopAndRecognize = async () => {
  state.value = 'recognizing'
  document.removeEventListener('keydown', handleKeydown)

  try {
    const text = await invoke<string>('stop_recording_and_recognize')
    if (text && text.trim()) {
      props.onResult(text.trim())
    } else {
      info(t('settings.speech.emptyResult'))
    }
  } catch (e: any) {
    error(t('settings.speech.toast.recognitionFailed', { error: e }))
  } finally {
    state.value = 'idle'
  }
}

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  // 如果组件销毁时还在录音，自动停止
  if (state.value === 'recording') {
    invoke('stop_recording_and_recognize').catch(() => {})
  }
})
</script>
