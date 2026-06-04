// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod screenshot;
mod fuzzy_search;
mod keywords;
mod tray;
mod window;
mod app_setup;
mod backup;
mod model_manager;
mod ocr;
mod encryption;
mod speech;
mod git;
use tauri::Manager;
use screenshot::{screenshot};
use fuzzy_search::{fuzzy_search, fuzzy_search_parallel};
use keywords::{rank_keywords};
use backup::{export_app_data, import_app_data};
//unused import
//use tauri::RunEvent;

fn main() {
    tauri::Builder::default()
        .manage(model_manager::LlamaServerState {
            processes: std::sync::Mutex::new(std::collections::HashMap::new()),
        })
        .manage(speech::SpeechState {
            is_recording: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            audio_buffer: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
            audio_stream: std::sync::Mutex::new(None),
            device_sample_rate: std::sync::Mutex::new(None),
        })
        // 核心插件 - 最先加载
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(window::handle_single_instance))

        // 系统级插件
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())

        // UI 相关插件
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())

        // 注册命令处理器
        .invoke_handler(tauri::generate_handler![
            screenshot,
            fuzzy_search,
            fuzzy_search_parallel,
            rank_keywords,
            export_app_data,
            import_app_data,
            model_manager::download_local_model,
            model_manager::check_model_exists,
            model_manager::check_llama_engine_exists,
            model_manager::download_and_extract_llama_cpp,
            model_manager::start_llama_server,
            model_manager::stop_llama_server,
            model_manager::check_llama_server_status,
            model_manager::get_system_gpu_info,
            ocr::ocr_from_bytes,
            ocr::ocr_from_screen,
            ocr::capture_main_screen,
            encryption::setup_encryption,
            encryption::unlock_encryption,
            encryption::lock_encryption,
            encryption::is_encryption_unlocked,
            encryption::change_encryption_password,
            encryption::encrypt_file,
            encryption::decrypt_file,
            encryption::check_file_encrypted,
            speech::check_speech_model_exists,
            speech::start_recording,
            speech::stop_recording_and_recognize,
            speech::download_speech_model,
            git::git_commit_and_push,
            git::git_commit,
            git::git_pull,
            git::git_status,
            git::git_init_repo,
        ])

        // 应用设置 - 在所有插件和命令注册后
        .setup(app_setup::setup_app)

        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { has_visible_windows, .. } => {
                window::handle_macos_reopen(&app_handle, has_visible_windows);
            }
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                let state: tauri::State<model_manager::LlamaServerState> = app_handle.state();
                let mut processes = state.processes.lock().unwrap();
                for (purpose, mut child) in processes.drain() {
                    println!("=== [DEBUG] App Exiting: Killing llama-server process ({}) (PID: {})", purpose, child.id());
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
            _ => {}
        });
}
