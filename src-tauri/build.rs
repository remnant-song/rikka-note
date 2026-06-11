use std::path::{Path, PathBuf};
use std::fs;

fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();

    // 1. Windows 平台特有的 DLL 自动补全逻辑
    // 必须在 tauri_build::build() 之前运行，否则 Tauri 会因为找不到资源文件而报错
    #[cfg(target_os = "windows")]
    {
        copy_sherpa_dlls();
        // 复制核心 DLL 到 bin/win64/ 确保运行时能找到
        let prebuilt_dll = Path::new(&manifest_dir).join("prebuilt").join("rikka_note_lib.dll");
        let dest_dll = Path::new(&manifest_dir).join("bin").join("win64").join("rikka_note_lib.dll");
        if prebuilt_dll.exists() && !dest_dll.exists() {
            fs::copy(&prebuilt_dll, &dest_dll).ok();
        }
    }
    // 链接预编译的核心 DLL（rikka_note_lib.dll）
    // 显式传递导入库绝对路径给链接器（只有 desktop_run 一个符号需要解析，
    // 其他 sherpa-onnx/webview2 等依赖已在 DLL 内部解析完毕）
    let import_lib = Path::new(&manifest_dir).join("prebuilt").join("rikka_note_lib.dll.lib");
    println!("cargo:rustc-link-arg={}", import_lib.display());
    // 2. 执行 Tauri 默认构建流程
    tauri_build::build();
}

#[cfg(target_os = "windows")]
fn copy_sherpa_dlls() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let src_tauri = Path::new(&manifest_dir);
    let dest_dir = src_tauri.join("bin").join("win64");

    // 关键修复：告诉编译器去 bin/win64 寻找 .lib 文件以进行链接
    println!("cargo:rustc-link-search=native={}", dest_dir.display());

    // 确保目标目录存在
    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir).expect("无法创建 bin/win64 目录");
    }

    let libs = [
        "sherpa-onnx-c-api.dll",
        "onnxruntime.dll",
        "onnxruntime_providers_shared.dll",
        "sherpa-onnx-cxx-api.dll"
    ];
    
    for dll_name in libs {
        let dest_path = dest_dir.join(dll_name);

        // 如果 DLL 已经存在，可以跳过（或者强制更新）
        if let Some(src_path) = find_dll(dll_name) {
            println!("cargo:warning=Found {} at {:?}", dll_name, src_path);
            if src_path != dest_path {
                match fs::copy(&src_path, &dest_path) {
                    Ok(_) => println!("cargo:warning=Successfully copied {} to {:?}", dll_name, dest_path),
                    Err(e) => {
                        // 如果文件被占用（Os Error 32），在 CI 环境下通常不影响打包，因为资源已经存在于 bin/win64
                        println!("cargo:warning=Notice: Could not copy {} to target directory: {}", dll_name, e);
                    }
                }
            }
        } else {
            println!("cargo:warning=Warning: Could not find {}. This might cause runtime errors.", dll_name);
        }
    }
}

#[cfg(target_os = "windows")]
fn find_dll(name: &str) -> Option<PathBuf> {
    println!("cargo:warning=Searching for DLL: {}", name);
    
    // 1. 优先检查项目中的 bin/win64 目录 (CI 下载的 DLL 会在这里)
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let bin_dir = Path::new(&manifest_dir).join("bin").join("win64");
    let local_path = bin_dir.join(name);
    if local_path.exists() {
        println!("cargo:warning=Found DLL in local bin directory: {:?}", local_path);
        return Some(local_path);
    }

    // 2. 检查输出目录 (OUT_DIR) 的同级 release 目录 (本地编译产物)
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let out_path = Path::new(&out_dir);
        let mut current = out_path;
        while let Some(parent) = current.parent() {
            if parent.ends_with("release") || parent.ends_with("debug") {
                let path = parent.join(name);
                if path.exists() {
                    return Some(path);
                }
                break;
            }
            current = parent;
        }
    }

    println!("cargo:warning=DLL {} not found in common locations.", name);
    None
}

