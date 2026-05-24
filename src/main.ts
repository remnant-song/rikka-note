import { createApp } from "vue";
import { createPinia } from 'pinia'
import App from "./App.vue";
import './shared/globals.scss'
import i18n from './locales'
import dayjs from 'dayjs'
import { initStores } from './stores'
import router from '@router'
import { logger } from '@/utils/logger.ts'

// 设置 dayjs locale 与初始值（从 localStorage 读取）
const saved = localStorage.getItem('locale') || 'zh'
dayjs.locale(saved === 'zh' ? 'zh-cn' : 'en')
const pinia = createPinia()
// 创建Vue应用并安装i18n插件
const app = createApp(App)

// 配置全局未捕获异常处理
app.config.errorHandler = (err, instance, info) => {
    logger.general.error('[Vue Global Error]', err, info)
    console.error('[Vue Global Error]', err, info)
}

app.use(i18n) // 安装i18n插件，这是useI18n函数能正常工作的前提
app.use(pinia)
app.use(router)
// app.mount("#app");
async function bootstrap() {
    await initStores(pinia)
    app.mount('#app')
}

bootstrap()