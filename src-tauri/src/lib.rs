mod hash;
mod yaml_generator;
mod github;

use yaml_generator::YamlFile;

#[tauri::command]
async fn download_and_hash(url: String) -> Result<hash::HashResult, String> {
    hash::download_and_hash(url).await
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

    // Save to Desktop
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

    // Open folder
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(output_dir.to_string_lossy().to_string())
            .spawn();
    }

    Ok(())
}

#[tauri::command]
async fn authenticate_github(token: String) -> Result<github::GitHubUser, String> {
    github::authenticate_github(&token).await
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            download_and_hash,
            generate_yaml,
            save_yaml_files,
            authenticate_github,
            submit_manifest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
