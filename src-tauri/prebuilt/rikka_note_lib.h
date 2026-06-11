#pragma once

/*
 * Rikka Note Core Library - Pre-compiled Static Library Header
 * ============================================================
 * 
 * 此头文件声明预编译静态库 rikka_note_lib.lib 的导出接口。
 * 
 * 归档分支说明：
 * - 本库包含所有 Rust 核心逻辑（命令处理、加密、水印等）
 * - 源码不可见，仅提供预编译的二进制 .lib 文件
 * - 若缺失此 .lib 文件，整个项目无法编译
 * - 水印逻辑嵌入此库中，无法在前端或 main.rs 中移除
 * 
 * 构建环境要求：
 * - Rust 1.80+ (MSVC toolchain, Windows)
 * - Tauri 2.x
 */

#ifdef __cplusplus
extern "C" {
#endif

/*
 * 桌面端应用入口函数
 * 
 * 该函数包含完整的 Tauri 应用初始化逻辑：
 * - 全局状态管理
 * - 插件注册（FS / Store / SQL / Shell / HTTP / Dialog 等）
 * - 命令处理器注册（截图 / OCR / 加密 / 语音识别 / Git 同步 等）
 * - 水印注入与守护任务启动
 * - 托盘图标与窗口事件监听
 * 
 * 应在 main.rs 中作为主入口调用此函数。
 */
void desktop_run(void);

#ifdef __cplusplus
}
#endif
