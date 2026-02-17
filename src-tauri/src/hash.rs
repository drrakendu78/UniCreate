use reqwest;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;
use futures_util::StreamExt;

#[derive(Debug, Serialize)]
pub struct HashResult {
    pub sha256: String,
    pub file_size: u64,
    pub file_name: String,
    pub detected_type: Option<String>,
}

fn detect_installer_type(filename: &str) -> Option<String> {
    let lower = filename.to_lowercase();
    if lower.ends_with(".msi") {
        Some("msi".to_string())
    } else if lower.ends_with(".msix") || lower.ends_with(".msixbundle") || lower.ends_with(".appx") {
        Some("msix".to_string())
    } else if lower.ends_with(".exe") {
        Some("exe".to_string())
    } else if lower.ends_with(".zip") {
        Some("zip".to_string())
    } else {
        None
    }
}

pub async fn download_and_hash(url: String) -> Result<HashResult, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "UniCreate/1.0")
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    // Extract filename from URL or Content-Disposition
    let file_name = response
        .headers()
        .get("content-disposition")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| {
            s.split("filename=")
                .nth(1)
                .map(|f| f.trim_matches('"').to_string())
        })
        .unwrap_or_else(|| {
            Path::new(url.split('?').next().unwrap_or(&url))
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "unknown".to_string())
        });

    let detected_type = detect_installer_type(&file_name);

    let mut hasher = Sha256::new();
    let mut file_size: u64 = 0;

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        file_size += chunk.len() as u64;
        hasher.update(&chunk);
    }

    let hash = format!("{:X}", hasher.finalize());

    Ok(HashResult {
        sha256: hash,
        file_size,
        file_name,
        detected_type,
    })
}
