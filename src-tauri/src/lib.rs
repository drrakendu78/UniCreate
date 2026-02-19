mod hash;
mod yaml_generator;
mod github;

use yaml_generator::YamlFile;

#[tauri::command]
async fn download_and_hash(url: String) -> Result<hash::HashResult, String> {
    hash::download_and_hash(url).await
}

#[tauri::command]
fn hash_local_file(path: String) -> Result<hash::HashResult, String> {
    hash::hash_local_file(&path)
}

#[tauri::command]
fn generate_yaml(manifest: yaml_generator::ManifestData) -> Result<Vec<YamlFile>, String> {
    Ok(yaml_generator::generate_yaml(&manifest))
}

#[tauri::command]
async fn save_yaml_files(
    files: Vec<YamlFile>,
    package_id: String,
    version: String,
) -> Result<(), String> {
    let first_letter = package_id.chars().next().unwrap_or('_').to_lowercase().to_string();
    let parts: Vec<&str> = package_id.splitn(2, '.').collect();
    let (publisher, package) = if parts.len() == 2 {
        (parts[0], parts[1])
    } else {
        (&*package_id, &*package_id)
    };

    let desktop = dirs::desktop_dir().ok_or("Cannot find desktop directory")?;
    let output_dir = desktop
        .join("winget-manifests")
        .join(&first_letter)
        .join(publisher)
        .join(package)
        .join(&version);

    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Cannot create directory: {}", e))?;

    for file in &files {
        let path = output_dir.join(&file.file_name);
        std::fs::write(&path, &file.content)
            .map_err(|e| format!("Cannot write file: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(output_dir.to_string_lossy().to_string())
            .spawn();
    }

    Ok(())
}

#[tauri::command]
async fn fetch_existing_manifest(package_id: String) -> Result<github::ExistingManifest, String> {
    github::fetch_existing_manifest(&package_id).await
}

#[tauri::command]
async fn fetch_repo_metadata(url: String) -> Result<github::RepoMetadata, String> {
    github::fetch_repo_metadata(&url).await
}

#[tauri::command]
async fn check_package_exists(package_id: String) -> Result<bool, String> {
    github::check_package_exists(&package_id).await
}

#[tauri::command]
async fn check_app_update() -> Result<github::AppUpdateInfo, String> {
    github::check_app_update().await
}

#[tauri::command]
async fn start_device_flow() -> Result<github::DeviceFlowStart, String> {
    github::start_device_flow().await
}

#[tauri::command]
async fn poll_device_flow(device_code: String) -> Result<String, String> {
    github::poll_device_flow(&device_code).await
}

#[tauri::command]
async fn authenticate_github(token: String) -> Result<github::GitHubUser, String> {
    github::authenticate_github(&token).await
}

#[tauri::command]
async fn fetch_unicreate_recent_prs(
    token: String,
    limit: Option<u32>,
) -> Result<Vec<github::RecoveredPr>, String> {
    github::fetch_unicreate_recent_prs(&token, limit).await
}

#[tauri::command]
async fn fetch_pr_statuses(
    pr_urls: Vec<String>,
    token: Option<String>,
) -> Result<Vec<github::PrLiveStatus>, String> {
    github::fetch_pr_statuses(&pr_urls, token.as_deref()).await
}

#[tauri::command]
async fn submit_manifest(
    token: String,
    yaml_files: Vec<YamlFile>,
    package_id: String,
    version: String,
) -> Result<String, String> {
    github::submit_manifest(&token, &yaml_files, &package_id, &version).await
}

#[tauri::command]
fn store_github_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new("unicreate", "github-token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    entry.set_password(&token)
        .map_err(|e| format!("Cannot store token: {}", e))
}

#[tauri::command]
fn get_github_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("unicreate", "github-token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Cannot get token: {}", e)),
    }
}

#[tauri::command]
fn clear_github_token() -> Result<(), String> {
    let entry = keyring::Entry::new("unicreate", "github-token")
        .map_err(|e| format!("Keyring error: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Cannot clear token: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            download_and_hash,
            hash_local_file,
            generate_yaml,
            save_yaml_files,
            fetch_existing_manifest,
            fetch_repo_metadata,
            check_package_exists,
            check_app_update,
            start_device_flow,
            poll_device_flow,
            authenticate_github,
            fetch_unicreate_recent_prs,
            fetch_pr_statuses,
            submit_manifest,
            store_github_token,
            get_github_token,
            clear_github_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
