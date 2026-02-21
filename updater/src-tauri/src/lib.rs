use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static UPDATE_ARGS: OnceLock<UpdateArgs> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
struct UpdateArgs {
    url: String,
    name: String,
    app: String,
    pid: u32,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    phase: String,
    percent: u32,
    detail: String,
}

fn parse_args() -> Option<UpdateArgs> {
    let args: Vec<String> = std::env::args().collect();
    let mut url = None;
    let mut name = None;
    let mut app = None;
    let mut pid = None;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--url" if i + 1 < args.len() => {
                url = Some(args[i + 1].clone());
                i += 2;
            }
            "--name" if i + 1 < args.len() => {
                name = Some(args[i + 1].clone());
                i += 2;
            }
            "--app" if i + 1 < args.len() => {
                app = Some(args[i + 1].clone());
                i += 2;
            }
            "--pid" if i + 1 < args.len() => {
                pid = args[i + 1].parse().ok();
                i += 2;
            }
            _ => i += 1,
        }
    }

    Some(UpdateArgs {
        url: url?,
        name: name.unwrap_or_default(),
        app: app?,
        pid: pid?,
    })
}

#[tauri::command]
fn get_update_args() -> Result<UpdateArgs, String> {
    UPDATE_ARGS
        .get()
        .cloned()
        .ok_or_else(|| "No update arguments provided".to_string())
}

#[tauri::command]
async fn start_update(app: AppHandle) -> Result<(), String> {
    let args = UPDATE_ARGS
        .get()
        .cloned()
        .ok_or("No update arguments")?;

    // Phase 1: Wait for main app to exit
    emit_progress(&app, "waiting", 0, "Waiting for UniCreate to close...");
    wait_for_pid(args.pid).await;
    emit_progress(&app, "waiting", 100, "UniCreate closed.");

    // Phase 2: Download
    emit_progress(&app, "downloading", 0, "Starting download...");
    let installer_path = download_installer(&app, &args.url, &args.name).await?;

    // Phase 3: Install
    emit_progress(&app, "installing", 0, "Installing update...");
    run_installer(&installer_path).await?;
    emit_progress(&app, "installing", 100, "Installation complete.");

    // Phase 4: Relaunch
    emit_progress(&app, "relaunching", 100, "Launching UniCreate...");
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    std::process::Command::new(&args.app)
        .spawn()
        .map_err(|e| format!("Failed to relaunch: {}", e))?;

    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    app.exit(0);

    Ok(())
}

fn emit_progress(app: &AppHandle, phase: &str, percent: u32, detail: &str) {
    let _ = app.emit(
        "update-progress",
        ProgressPayload {
            phase: phase.to_string(),
            percent,
            detail: detail.to_string(),
        },
    );
}

async fn wait_for_pid(pid: u32) {
    loop {
        let exists = is_process_running(pid);
        if !exists {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
}

#[cfg(target_os = "windows")]
fn is_process_running(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{OpenProcess, GetExitCodeProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let mut exit_code: u32 = 0;
        let ok = GetExitCodeProcess(handle, &mut exit_code);
        CloseHandle(handle);
        ok != 0 && exit_code == STILL_ACTIVE as u32
    }
}

#[cfg(not(target_os = "windows"))]
fn is_process_running(pid: u32) -> bool {
    Path::new(&format!("/proc/{}", pid)).exists()
}

async fn download_installer(
    app: &AppHandle,
    url: &str,
    name: &str,
) -> Result<PathBuf, String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::builder()
        .user_agent("UniCreate-Updater/1.0")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download returned status {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);

    let file_name = if name.is_empty() {
        url.split('/').last().unwrap_or("update.exe").to_string()
    } else {
        name.to_string()
    };

    let temp_dir = std::env::temp_dir().join("unicreate-updater");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Cannot create temp dir: {}", e))?;
    let dest = temp_dir.join(&file_name);

    let mut file = tokio::fs::File::create(&dest)
        .await
        .map_err(|e| format!("Cannot create file: {}", e))?;

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_percent: u32 = 0;

    use tokio::io::AsyncWriteExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Write error: {}", e))?;

        downloaded += chunk.len() as u64;
        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0) as u32
        } else {
            0
        };

        if percent != last_percent {
            last_percent = percent;
            emit_progress(
                app,
                "downloading",
                percent,
                &format!("Downloading... {}%", percent),
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Flush error: {}", e))?;

    emit_progress(app, "downloading", 100, "Download complete.");
    Ok(dest)
}

async fn run_installer(path: &Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let child = if ext == "msi" {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            std::process::Command::new("msiexec.exe")
                .args([
                    "/i",
                    &path.to_string_lossy(),
                    "/qn",
                    "/norestart",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
        }
        #[cfg(not(target_os = "windows"))]
        {
            return Err("MSI install only supported on Windows".to_string());
        }
    } else {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            std::process::Command::new(path)
                .args(["/S"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
        }
        #[cfg(not(target_os = "windows"))]
        {
            return Err("EXE install only supported on Windows".to_string());
        }
    };

    let mut process = child.map_err(|e| format!("Failed to run installer: {}", e))?;
    let status = tokio::task::spawn_blocking(move || process.wait())
        .await
        .map_err(|e| format!("Wait error: {}", e))?
        .map_err(|e| format!("Installer error: {}", e))?;

    if !status.success() {
        return Err(format!("Installer exited with code {:?}", status.code()));
    }

    Ok(())
}

pub fn run() {
    if let Some(args) = parse_args() {
        let _ = UPDATE_ARGS.set(args);
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_update_args, start_update])
        .run(tauri::generate_context!())
        .expect("error while running updater");
}
