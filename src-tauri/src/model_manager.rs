use std::fs;
use std::path::PathBuf;
use std::process::{Child, Command};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;
use reqwest::Client;
use futures_util::StreamExt;

use std::collections::HashMap;

// Global state to store multiple llama-server child processes
pub struct LlamaServerState {
    pub processes: Mutex<HashMap<String, Child>>,
}

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    filename: String,
    downloaded: u64,
    total: Option<u64>,
}

pub fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app_data_dir: {}", e))
}

#[tauri::command]
pub async fn download_local_model(
    app: AppHandle,
    url: String,
    filename: String,
) -> Result<String, String> {
    println!("=== [DEBUG] Start downloading local model ===");
    println!("URL: {}", url);
    println!("Filename: {}", filename);

    let app_dir = get_app_data_dir(&app)?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    let file_path = app_dir.join(&filename);
    let temp_path = app_dir.join(format!("{}.downloading", filename));
    println!("Target path: {:?}", file_path);

    if file_path.exists() && is_valid_gguf(&file_path) {
        println!("File already exists and is valid: {:?}", file_path);
        return Ok(file_path.to_string_lossy().to_string());
    }

    // Clean up any stale temp file
    if temp_path.exists() {
        let _ = tokio::fs::remove_file(&temp_path).await;
    }

    let client = Client::new();
    let res = client.get(&url).send().await.map_err(|e| format!("Request failed: {}", e))?;
    
    if !res.status().is_success() {
        return Err(format!("Download failed with HTTP status: {}", res.status()));
    }
    
    let total_size = res.content_length();

    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    let mut last_emit = std::time::Instant::now();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Error downloading chunk: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error writing chunk: {}", e))?;
        downloaded += chunk.len() as u64;

        // Throttle events to avoid overloading the frontend, e.g. every 100ms
        if last_emit.elapsed().as_millis() > 200 || downloaded == total_size.unwrap_or(0) {
            let _ = app.emit(
                "model-download-progress",
                DownloadProgress {
                    filename: filename.clone(),
                    downloaded,
                    total: total_size,
                },
            );
            last_emit = std::time::Instant::now();
        }
    }

    file.sync_all().await.map_err(|e| format!("Failed to sync file: {}", e))?;
    drop(file);

    // Rename temp to target
    tokio::fs::rename(&temp_path, &file_path)
        .await
        .map_err(|e| format!("Failed to rename model file: {}", e))?;

    println!("=== [DEBUG] Download local model finished and renamed! ===");
    Ok(file_path.to_string_lossy().to_string())
}

fn is_valid_gguf(path: &std::path::Path) -> bool {
    use std::io::Read;
    if !path.exists() {
        return false;
    }
    // Only check .gguf extension files
    if let Some(ext) = path.extension() {
        if ext.to_string_lossy().to_lowercase() != "gguf" {
            return true; // Assume other files are OK if they exist for now
        }
    } else {
        return true;
    }

    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut header = [0u8; 4];
    if file.read_exact(&mut header).is_err() {
        return false;
    }
    &header == b"GGUF"
}

#[tauri::command]
pub async fn check_model_exists(app: AppHandle, filename: String) -> Result<bool, String> {
    let app_dir = get_app_data_dir(&app)?;
    let file_path = app_dir.join(&filename);
    
    if !file_path.exists() {
        return Ok(false);
    }

    Ok(is_valid_gguf(&file_path))
}

#[tauri::command]
pub async fn check_llama_engine_exists(app: AppHandle) -> Result<bool, String> {
    let app_dir = get_app_data_dir(&app)?;
    let engine_exe = app_dir.join("llama-cpp-engine").join("llama-server.exe");
    if engine_exe.exists() {
        return Ok(true);
    }
    // Fallback check old path
    let old_exe = app_dir.join("llama-server.exe");
    Ok(old_exe.exists())
}

#[tauri::command]
pub async fn download_and_extract_llama_cpp(
    app: AppHandle,
    urls: Vec<String>,
) -> Result<String, String> {
    let app_dir = get_app_data_dir(&app)?;
    let engine_dir = app_dir.join("llama-cpp-engine");

    if !engine_dir.exists() {
        fs::create_dir_all(&engine_dir).map_err(|e| format!("Failed to create engine directory: {}", e))?;
    }

    let client = Client::new();

    for url in urls {
        let filename = url.split('/').last().unwrap_or("unknown.zip").to_string();
        let file_path = engine_dir.join(&filename);
        let temp_path = engine_dir.join(format!("{}.downloading", filename));

        println!("=== [DEBUG] Start downloading engine file: {} ===", filename);

        let res = client.get(&url).send().await.map_err(|e| format!("Request failed: {}", e))?;
        if !res.status().is_success() {
            return Err(format!("Download failed with HTTP status: {}", res.status()));
        }

        let total_size = res.content_length();
        let mut file = tokio::fs::File::create(&temp_path)
            .await
            .map_err(|e| format!("Failed to create temp file: {}", e))?;

        let mut downloaded: u64 = 0;
        let mut stream = res.bytes_stream();
        let mut last_emit = std::time::Instant::now();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Error downloading chunk: {}", e))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("Error writing chunk: {}", e))?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed().as_millis() > 200 || downloaded == total_size.unwrap_or(0) {
                let _ = app.emit(
                    "engine-download-progress",
                    DownloadProgress {
                        filename: filename.clone(),
                        downloaded,
                        total: total_size,
                    },
                );
                last_emit = std::time::Instant::now();
            }
        }

        file.sync_all().await.map_err(|e| e.to_string())?;
        drop(file); // explicit drop to release lock

        // Rename temp to target zip
        tokio::fs::rename(&temp_path, &file_path).await.map_err(|e| e.to_string())?;

        println!("=== [DEBUG] Extracting {} ===", filename);
        let file_path_clone = file_path.clone();
        let engine_dir_clone = engine_dir.clone();
        
        let _extracted = tokio::task::spawn_blocking(move || -> Result<(), String> {
            let sync_file = std::fs::File::open(&file_path_clone).map_err(|e| e.to_string())?;
            let mut archive = zip::ZipArchive::new(sync_file).map_err(|e| e.to_string())?;
            
            for i in 0..archive.len() {
                let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
                let outpath = match file.enclosed_name() {
                    Some(path) => path.to_owned(),
                    None => continue,
                };
                
                let outpath = engine_dir_clone.join(outpath);
                
                if (*file.name()).ends_with('/') {
                    std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
                } else {
                    if let Some(p) = outpath.parent() {
                        if !p.exists() {
                            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                        }
                    }
                    let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
                    std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
                }
            }
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;

        // Clean up zip
        let _ = tokio::fs::remove_file(&file_path).await;
    }

    Ok(engine_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn start_llama_server(
    app: AppHandle,
    state: tauri::State<'_, LlamaServerState>,
    model_filename: String,
    port: u16,
    purpose: String, // "embedding" or "chat"
    context_size: Option<u32>,
    gpu_layers: Option<i32>,
    threads: Option<u32>,
    batch_size: Option<u32>,
    flash_attn: Option<bool>,
    ubatch_size: Option<u32>,
) -> Result<String, String> {
    println!("=== [DEBUG] Starting llama-server for {} ===", purpose);
    
    // Ensure we stop if THIS purpose was already running
    let _ = stop_llama_server(state.clone(), purpose.clone()).await;

    let app_dir = get_app_data_dir(&app)?;
    
    // Check new specific dir first, fallback to old path
    let mut server_exe = app_dir.join("llama-cpp-engine").join("llama-server.exe");
    if !server_exe.exists() {
        server_exe = app_dir.join("llama-server.exe");
    }
    
    // Handle absolute path
    let model_path = if std::path::Path::new(&model_filename).is_absolute() {
        PathBuf::from(&model_filename)
    } else {
        app_dir.join(&model_filename)
    };

    if !server_exe.exists() {
        return Err(format!("llama-server.exe not found. Engine might not be downloaded."));
    }
    if !model_path.exists() {
        return Err(format!("Model file not found at {:?}", model_path));
    }

    println!("Executing: {:?} -m {:?} --port {}", server_exe, model_path, port);

    let mut cmd = Command::new(&server_exe);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.arg("-m").arg(&model_path)
       .arg("--host").arg("127.0.0.1")
       .arg("--port").arg(port.to_string());

    // Common performance parameters
    if let Some(ngl) = gpu_layers {
        cmd.arg("-ngl").arg(ngl.to_string());
    }
    if let Some(t) = threads {
        cmd.arg("-t").arg(t.to_string());
    }
    if let Some(b) = batch_size {
        cmd.arg("-b").arg(b.to_string());
    }
    if let Some(ub) = ubatch_size {
        cmd.arg("--ubatch-size").arg(ub.to_string());
    }

    if purpose == "embedding" {
        cmd.arg("--embedding").arg("--pooling").arg("last");
        // Embedding models don't need huge context, defaults to 2048 if not provided
        let ctx = context_size.unwrap_or(2048);
        cmd.arg("-c").arg(ctx.to_string());
    } else {
        // Chat mode defaults
        let ctx = context_size.unwrap_or(4096);
        cmd.arg("-c").arg(ctx.to_string());
        
        if flash_attn.unwrap_or(true) {
            cmd.arg("--flash-attn").arg("on"); 
        } else {
            cmd.arg("--flash-attn").arg("off");
        }
    }

    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start llama-server.exe ({}): {}", purpose, e))?;

    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    println!("[llama-server stdout] {}", l);
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        let purpose_clone = purpose.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let mut is_ready = false;
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    println!("[llama-server stderr] {}", l);
                    // Hook into the logs to detect when it's fully started
                    if l.contains("server is listening on http") {
                        is_ready = true;
                        let _ = app_clone.emit(&format!("llama-server-ready-{}", purpose_clone), ());
                    }
                    if l.contains("out of memory") || l.contains("cannot allocate") {
                        let _ = app_clone.emit(&format!("llama-server-error-{}", purpose_clone), l);
                        return; // Exit thread on critical error
                    }
                }
            }
            // If the loop ends (stderr closed) and we weren't ready, the process likely crashed
            if !is_ready {
                let _ = app_clone.emit(&format!("llama-server-error-{}", purpose_clone), "Engine process exited unexpectedly during startup.");
            }
        });
    }

    let mut processes = state.processes.lock().unwrap();
    processes.insert(purpose.clone(), child);

    println!("=== [DEBUG] llama-server ({}) started on port {} ===", purpose, port);
    Ok(format!("Server started on port {}", port))
}

#[tauri::command]
pub async fn stop_llama_server(
    state: tauri::State<'_, LlamaServerState>,
    purpose: String,
) -> Result<String, String> {
    println!("=== [DEBUG] Stopping llama-server for {} ===", purpose);
    let mut processes = state.processes.lock().unwrap();
    if let Some(mut child) = processes.remove(&purpose) {
        println!("Killing llama-server {} process (PID: {})", purpose, child.id());
        let _ = child.kill();
        let _ = child.wait();
        println!("=== [DEBUG] llama-server {} stopped ===", purpose);
        Ok("Stopped".to_string())
    } else {
        println!("No llama-server {} process running.", purpose);
        Ok("Not running".to_string())
    }
}

#[tauri::command]
pub async fn check_llama_server_status(
    state: tauri::State<'_, LlamaServerState>,
    purpose: String,
) -> Result<bool, String> {
    let mut processes = state.processes.lock().unwrap();
    if let Some(child) = processes.get_mut(&purpose) {
        match child.try_wait() {
            Ok(Some(_status)) => {
                processes.remove(&purpose); // clear the dead process
                return Ok(false);
            }
            Ok(None) => {
                return Ok(true);
            }
            Err(_) => {
                processes.remove(&purpose);
                return Ok(false);
            }
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn get_system_gpu_info() -> Result<Vec<String>, String> {
    // Only support Windows wmic for now
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("wmic")
            .args(["path", "win32_VideoController", "get", "name"])
            .output()
            .map_err(|e| format!("wmic 执行失败: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let gpus: Vec<String> = stdout
                .lines()
                .skip(1) // Skip the "Name" header
                .filter_map(|line| {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                })
                .collect();
            return Ok(gpus);
        }
    }
    
    // Fallback or non-Windows
    Ok(vec![])
}
