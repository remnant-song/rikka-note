<script setup lang="ts">
import RootLayout from '@/layouts/RootLayout.vue'
import { onErrorCaptured } from 'vue'
import { useToast } from '@/composables/useToast'

const { error } = useToast()

onErrorCaptured((err) => {
  let message = err instanceof Error ? err.message : String(err)

  error(message, '应用运行异常', { duration: 0 })
  
  // 返回 true 以允许错误继续向上传递到 main.ts 的 errorHandler
  return true
})
</script>

<template>
  <RootLayout>
    <router-view />
  </RootLayout>
</template>

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

/* 主题过渡禁用类 */
.disable-theme-transition * {
  transition: none !important;
  animation: none !important;
}
</style>