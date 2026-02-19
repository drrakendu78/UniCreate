use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::yaml_generator::YamlFile;

// GitHub OAuth App Client ID — public, safe to hardcode
const GITHUB_CLIENT_ID: &str = "Ov23liEtB73yhdcAHuOR";

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    #[serde(alias = "avatar_url")]
    #[serde(rename(serialize = "avatarUrl", deserialize = "avatar_url"))]
    pub avatar_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecoveredPr {
    pub pr_url: String,
    pub title: String,
    pub created_at: String,
    pub user_login: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PrLiveStatus {
    pub pr_url: String,
    pub status: String,
    pub has_issues: bool,
    pub mergeable_state: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SearchIssuesResponse {
    items: Vec<SearchIssueItem>,
}

#[derive(Debug, Deserialize)]
struct SearchIssueItem {
    html_url: String,
    title: String,
    created_at: String,
    user: SearchIssueUser,
    pull_request: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct SearchIssueUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct PullStatusResponse {
    state: String,
    merged_at: Option<String>,
    draft: Option<bool>,
    mergeable_state: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct ForkResult {
    full_name: String,
}

#[derive(Debug, Serialize)]
struct CreateBlobRequest {
    content: String,
    encoding: String,
}

#[derive(Debug, Deserialize)]
struct CreateBlobResponse {
    sha: String,
}

#[derive(Debug, Serialize)]
struct TreeEntry {
    path: String,
    mode: String,
    #[serde(rename = "type")]
    entry_type: String,
    sha: String,
}

#[derive(Debug, Serialize)]
struct CreateTreeRequest {
    base_tree: String,
    tree: Vec<TreeEntry>,
}

#[derive(Debug, Deserialize)]
struct CreateTreeResponse {
    sha: String,
}

#[derive(Debug, Serialize)]
struct CreateCommitRequest {
    message: String,
    tree: String,
    parents: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CreateCommitResponse {
    sha: String,
}

#[derive(Debug, Serialize)]
struct CreateRefRequest {
    #[serde(rename = "ref")]
    ref_name: String,
    sha: String,
}

#[derive(Debug, Serialize)]
struct CreatePrRequest {
    title: String,
    head: String,
    base: String,
    body: String,
}

#[derive(Debug, Deserialize)]
struct PrResponse {
    html_url: String,
}

#[derive(Debug, Deserialize)]
struct RefResponse {
    object: RefObject,
}

#[derive(Debug, Deserialize)]
struct RefObject {
    sha: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoMetadata {
    pub owner: String,
    pub repo_name: String,
    pub description: Option<String>,
    pub license: Option<String>,
    pub homepage: Option<String>,
    pub html_url: String,
    pub topics: Vec<String>,
    pub version: Option<String>,
    pub release_notes: Option<String>,
    pub release_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubRepo {
    name: String,
    description: Option<String>,
    html_url: String,
    homepage: Option<String>,
    topics: Option<Vec<String>>,
    owner: GitHubOwner,
    license: Option<GitHubLicense>,
}

#[derive(Debug, Deserialize)]
struct GitHubOwner {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GitHubLicense {
    spdx_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    #[serde(default)]
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_notes: Option<String>,
    pub release_url: String,
    pub published_at: Option<String>,
    pub download_url: Option<String>,
    pub download_name: Option<String>,
}

fn ps_quote(value: &str) -> String {
    value.replace('\'', "''")
}

fn safe_file_name(value: &str) -> String {
    value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => ch,
        })
        .collect()
}

fn file_name_from_download_url(url: &str) -> String {
    let from_url = url
        .split('?')
        .next()
        .and_then(|no_query| no_query.rsplit('/').next())
        .unwrap_or("UniCreate-update.exe");
    let trimmed = from_url.trim();
    if trimmed.is_empty() {
        "UniCreate-update.exe".to_string()
    } else {
        safe_file_name(trimmed)
    }
}

#[cfg(target_os = "windows")]
pub fn start_silent_update(download_url: &str, file_name: Option<&str>) -> Result<(), String> {
    let url = download_url.trim();
    if url.is_empty() {
        return Err("Missing update download URL".to_string());
    }
    if !url.starts_with("https://") {
        return Err("Update URL must use https://".to_string());
    }

    let preferred_name = file_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(safe_file_name)
        .unwrap_or_else(|| file_name_from_download_url(url));

    let ext = Path::new(&preferred_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "exe" && ext != "msi" {
        return Err("Unsupported installer format. Expected .exe or .msi".to_string());
    }

    let temp_dir = std::env::temp_dir().join("unicreate-updater");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Cannot prepare temp dir: {}", e))?;
    let installer_path = temp_dir.join(preferred_name);

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let script_path = temp_dir.join(format!("run-update-{}.ps1", stamp));
    let current_exe = std::env::current_exe().map_err(|e| format!("Cannot locate app executable: {}", e))?;
    let current_pid = std::process::id();

    let installer_path_ps = ps_quote(&installer_path.to_string_lossy());
    let download_url_ps = ps_quote(url);
    let current_exe_ps = ps_quote(&current_exe.to_string_lossy());

    let install_block = if ext == "msi" {
        format!(
            "$p = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', '{installer}', '/qn', '/norestart') -PassThru -WindowStyle Hidden\n$p.WaitForExit()\nif ($p.ExitCode -ne 0) {{ exit $p.ExitCode }}",
            installer = installer_path_ps
        )
    } else {
        format!(
            "$p = Start-Process -FilePath '{installer}' -ArgumentList @('/S') -PassThru -WindowStyle Hidden\n$p.WaitForExit()\nif ($p.ExitCode -ne 0) {{ exit $p.ExitCode }}",
            installer = installer_path_ps
        )
    };

    let script = format!(
        "$ErrorActionPreference = 'Stop'\n\
$ProgressPreference = 'SilentlyContinue'\n\
$downloadUrl = '{download_url}'\n\
$installerPath = '{installer_path}'\n\
$appPath = '{app_path}'\n\
Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath\n\
for ($i = 0; $i -lt 600; $i++) {{\n\
  $proc = Get-Process -Id {current_pid} -ErrorAction SilentlyContinue\n\
  if (-not $proc) {{ break }}\n\
  Start-Sleep -Milliseconds 250\n\
}}\n\
{install_block}\n\
Start-Sleep -Seconds 1\n\
Start-Process -FilePath $appPath\n",
        download_url = download_url_ps,
        installer_path = installer_path_ps,
        app_path = current_exe_ps,
        current_pid = current_pid,
        install_block = install_block
    );

    std::fs::write(&script_path, script).map_err(|e| format!("Cannot write updater script: {}", e))?;

    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            &script_path.to_string_lossy(),
        ])
        .spawn()
        .map_err(|e| format!("Cannot start updater: {}", e))?;

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn start_silent_update(_download_url: &str, _file_name: Option<&str>) -> Result<(), String> {
    Err("Silent update is currently supported on Windows only".to_string())
}

/// Extract owner/repo from a GitHub URL (releases, raw, etc.)
fn parse_github_url(url: &str) -> Option<(String, String, Option<String>)> {
    // Patterns:
    //   github.com/owner/repo/releases/download/v1.0/file.exe
    //   github.com/owner/repo/releases/tag/v1.0
    //   github.com/owner/repo
    let url = url.trim_end_matches('/');
    let parts: Vec<&str> = url.split('/').collect();

    // Find "github.com" in parts
    let gh_idx = parts.iter().position(|p| p.contains("github.com"))?;
    if parts.len() < gh_idx + 3 {
        return None;
    }

    let owner = parts[gh_idx + 1].to_string();
    let repo = parts[gh_idx + 2].to_string();

    // Try to extract tag from releases URL
    let tag = if parts.len() > gh_idx + 5 && parts[gh_idx + 3] == "releases" && parts[gh_idx + 4] == "download" {
        Some(parts[gh_idx + 5].to_string())
    } else if parts.len() > gh_idx + 5 && parts[gh_idx + 3] == "releases" && parts[gh_idx + 4] == "tag" {
        Some(parts[gh_idx + 5].to_string())
    } else {
        None
    };

    Some((owner, repo, tag))
}

/// Clean version string: remove 'v' prefix, etc.
fn clean_version(tag: &str) -> String {
    let v = tag.strip_prefix('v').unwrap_or(tag);
    v.strip_prefix('V').unwrap_or(v).to_string()
}

fn parse_version_parts(version: &str) -> Vec<u32> {
    let normalized = clean_version(version);
    let clean = normalized
        .split('-')
        .next()
        .unwrap_or("")
        .split('+')
        .next()
        .unwrap_or("");

    clean
        .split('.')
        .map(|part| {
            let digits: String = part.chars().take_while(|c| c.is_ascii_digit()).collect();
            digits.parse::<u32>().unwrap_or(0)
        })
        .collect()
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let latest_parts = parse_version_parts(latest);
    let current_parts = parse_version_parts(current);
    let max_len = latest_parts.len().max(current_parts.len());

    for idx in 0..max_len {
        let l = *latest_parts.get(idx).unwrap_or(&0);
        let c = *current_parts.get(idx).unwrap_or(&0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }

    false
}

fn pick_preferred_exe_asset(release: &GitHubRelease) -> Option<&GitHubReleaseAsset> {
    fn score(asset_name: &str) -> i32 {
        let lower = asset_name.to_ascii_lowercase();
        if !lower.ends_with(".exe") {
            return i32::MIN / 2;
        }

        let mut points = 0;

        if lower.contains("setup") || lower.contains("installer") {
            points += 40;
        }
        if lower.contains("x64") || lower.contains("amd64") || lower.contains("win64") {
            points += 10;
        }
        if lower.contains("portable") {
            points -= 12;
        }
        if lower.contains("arm64") || lower.contains("arm") {
            points -= 4;
        }
        if lower.contains("debug") || lower.contains("symbols") || lower.contains("pdb") {
            points -= 50;
        }

        points
    }

    release.assets.iter().max_by_key(|asset| score(&asset.name))
}

pub async fn check_app_update() -> Result<AppUpdateInfo, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));

    let release: GitHubRelease = client
        .get("https://api.github.com/repos/drrakendu78/UniCreate/releases/latest")
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let current = env!("CARGO_PKG_VERSION").to_string();
    let latest = clean_version(&release.tag_name);
    let has_update = is_newer_version(&latest, &current);
    let (download_url, download_name) = match pick_preferred_exe_asset(&release) {
        Some(asset) => (
            Some(asset.browser_download_url.clone()),
            Some(asset.name.clone()),
        ),
        None => (None, None),
    };

    Ok(AppUpdateInfo {
        current_version: current,
        latest_version: latest,
        has_update,
        release_notes: release.body,
        release_url: release.html_url,
        published_at: release.published_at,
        download_url,
        download_name,
    })
}

pub async fn fetch_repo_metadata(url: &str) -> Result<RepoMetadata, String> {
    let (owner, repo, tag) = parse_github_url(url)
        .ok_or_else(|| "Not a GitHub URL".to_string())?;

    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));

    // Fetch repo info
    let repo_info: GitHubRepo = client
        .get(&format!("https://api.github.com/repos/{}/{}", owner, repo))
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    // Fetch release info if we have a tag
    let (version, release_notes, release_url) = if let Some(ref tag_name) = tag {
        let release_result: Result<GitHubRelease, _> = client
            .get(&format!(
                "https://api.github.com/repos/{}/{}/releases/tags/{}",
                owner, repo, tag_name
            ))
            .headers(headers.clone())
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?
            .json()
            .await;

        match release_result {
            Ok(release) => (
                Some(clean_version(&release.tag_name)),
                release.body,
                Some(release.html_url),
            ),
            Err(_) => (Some(clean_version(tag_name)), None, None),
        }
    } else {
        // No tag, try latest release
        let latest_result: Result<GitHubRelease, _> = client
            .get(&format!(
                "https://api.github.com/repos/{}/{}/releases/latest",
                owner, repo
            ))
            .headers(headers.clone())
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?
            .json()
            .await;

        match latest_result {
            Ok(release) => (
                Some(clean_version(&release.tag_name)),
                release.body,
                Some(release.html_url),
            ),
            Err(_) => (None, None, None),
        }
    };

    Ok(RepoMetadata {
        owner: repo_info.owner.login,
        repo_name: repo_info.name,
        description: repo_info.description,
        license: repo_info.license.and_then(|l| l.spdx_id).filter(|s| s != "NOASSERTION"),
        homepage: repo_info.homepage.filter(|s| !s.is_empty()),
        html_url: repo_info.html_url,
        topics: repo_info.topics.unwrap_or_default(),
        version,
        release_notes,
        release_url,
    })
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExistingManifest {
    pub package_identifier: String,
    pub latest_version: String,
    pub publisher: String,
    pub package_name: String,
    pub license: String,
    pub short_description: String,
    pub description: Option<String>,
    pub publisher_url: Option<String>,
    pub package_url: Option<String>,
    pub license_url: Option<String>,
    pub privacy_url: Option<String>,
    pub author: Option<String>,
    pub moniker: Option<String>,
    pub tags: Vec<String>,
    pub release_notes_url: Option<String>,
    pub package_locale: String,
}

#[derive(Debug, Deserialize)]
struct GitHubContentItem {
    name: String,
    #[serde(rename = "type")]
    item_type: String,
}

#[derive(Debug, Deserialize)]
struct GitHubFileContent {
    content: Option<String>,
}

fn parse_yaml_field(content: &str, field: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(&format!("{}:", field)) {
            let value = trimmed[field.len() + 1..].trim();
            // Remove surrounding quotes
            let value = value.trim_matches('"').trim_matches('\'');
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn parse_yaml_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut in_tags = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "Tags:" {
            in_tags = true;
            continue;
        }
        if in_tags {
            if trimmed.starts_with("- ") {
                let tag = trimmed[2..].trim().trim_matches('"').trim_matches('\'');
                if !tag.is_empty() {
                    tags.push(tag.to_string());
                }
            } else {
                in_tags = false;
            }
        }
    }
    tags
}

pub async fn fetch_existing_manifest(package_id: &str) -> Result<ExistingManifest, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));

    // Build path: manifests/d/Drrakendu78/StarTradFR/
    let parts: Vec<&str> = package_id.splitn(2, '.').collect();
    if parts.len() != 2 {
        return Err("Invalid package identifier format (expected Publisher.Package)".to_string());
    }
    let (publisher, package) = (parts[0], parts[1]);
    let first_letter = publisher.chars().next().unwrap_or('_').to_lowercase().to_string();

    let dir_url = format!(
        "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/{}/{}/{}",
        first_letter, publisher, package
    );

    // List versions
    let versions: Vec<GitHubContentItem> = client
        .get(&dir_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?
        .json()
        .await
        .map_err(|_| format!("Package '{}' not found in winget-pkgs", package_id))?;

    // Find latest version (last directory alphabetically)
    let mut version_dirs: Vec<String> = versions
        .iter()
        .filter(|v| v.item_type == "dir")
        .map(|v| v.name.clone())
        .collect();
    version_dirs.sort();

    let latest_version = version_dirs
        .last()
        .ok_or_else(|| "No versions found".to_string())?
        .clone();

    // Fetch the default locale file
    // Try common patterns: .locale.en-US.yaml, .locale.fr-FR.yaml
    let version_dir_url = format!("{}/{}", dir_url, latest_version);
    let files: Vec<GitHubContentItem> = client
        .get(&version_dir_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    // Find locale file (defaultLocale)
    let locale_file = files
        .iter()
        .find(|f| f.name.contains(".locale."))
        .ok_or_else(|| "No locale file found".to_string())?;

    let file_url = format!("{}/{}", version_dir_url, locale_file.name);
    let file_content: GitHubFileContent = client
        .get(&file_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let content_b64 = file_content.content.ok_or("Empty file")?;
    // GitHub returns base64 with newlines
    let clean_b64: String = content_b64.chars().filter(|c| !c.is_whitespace()).collect();
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&clean_b64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    let yaml_content = String::from_utf8(decoded).map_err(|e| format!("UTF-8 error: {}", e))?;

    let package_locale = parse_yaml_field(&yaml_content, "PackageLocale").unwrap_or_else(|| "en-US".to_string());

    Ok(ExistingManifest {
        package_identifier: package_id.to_string(),
        latest_version,
        publisher: parse_yaml_field(&yaml_content, "Publisher").unwrap_or_default(),
        package_name: parse_yaml_field(&yaml_content, "PackageName").unwrap_or_default(),
        license: parse_yaml_field(&yaml_content, "License").unwrap_or_default(),
        short_description: parse_yaml_field(&yaml_content, "ShortDescription").unwrap_or_default(),
        description: parse_yaml_field(&yaml_content, "Description"),
        publisher_url: parse_yaml_field(&yaml_content, "PublisherUrl"),
        package_url: parse_yaml_field(&yaml_content, "PackageUrl"),
        license_url: parse_yaml_field(&yaml_content, "LicenseUrl"),
        privacy_url: parse_yaml_field(&yaml_content, "PrivacyUrl"),
        author: parse_yaml_field(&yaml_content, "Author"),
        moniker: parse_yaml_field(&yaml_content, "Moniker"),
        tags: parse_yaml_tags(&yaml_content),
        release_notes_url: parse_yaml_field(&yaml_content, "ReleaseNotesUrl"),
        package_locale,
    })
}

pub async fn check_package_exists(package_id: &str) -> Result<bool, String> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));

    let parts: Vec<&str> = package_id.splitn(2, '.').collect();
    if parts.len() != 2 {
        return Ok(false);
    }
    let (publisher, package) = (parts[0], parts[1]);
    let first_letter = publisher.chars().next().unwrap_or('_').to_lowercase().to_string();

    let url = format!(
        "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/{}/{}/{}",
        first_letter, publisher, package
    );

    let resp = client
        .get(&url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    Ok(resp.status().is_success())
}

fn parse_github_pr_url(pr_url: &str) -> Option<(String, String, u64)> {
    let clean = pr_url.trim().trim_end_matches('/');
    let parts: Vec<&str> = clean.split('/').collect();
    if parts.len() < 7 {
        return None;
    }
    if !parts[2].contains("github.com") || parts[5] != "pull" {
        return None;
    }
    let owner = parts[3].to_string();
    let repo = parts[4].to_string();
    let number = parts[6].split('?').next()?.parse::<u64>().ok()?;
    Some((owner, repo, number))
}

fn has_pr_issues(status: &str, draft: bool, mergeable_state: Option<&str>) -> bool {
    if status == "merged" {
        return false;
    }
    if status == "closed" {
        return true;
    }
    if draft {
        return true;
    }
    matches!(
        mergeable_state,
        Some("dirty" | "blocked" | "behind" | "unstable" | "draft")
    )
}

pub async fn fetch_pr_statuses(
    pr_urls: &[String],
    token: Option<&str>,
) -> Result<Vec<PrLiveStatus>, String> {
    let client = reqwest::Client::new();
    let token_owned = token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());

    let mut result = Vec::with_capacity(pr_urls.len());

    for pr_url in pr_urls {
        let mut item = PrLiveStatus {
            pr_url: pr_url.clone(),
            status: "unknown".to_string(),
            has_issues: true,
            mergeable_state: None,
        };

        let Some((owner, repo, number)) = parse_github_pr_url(pr_url) else {
            item.mergeable_state = Some("invalid-url".to_string());
            result.push(item);
            continue;
        };

        let endpoint = format!(
            "https://api.github.com/repos/{}/{}/pulls/{}",
            owner, repo, number
        );

        let mut pull_data: Option<PullStatusResponse> = None;
        let attempts: Vec<Option<&str>> = if let Some(token_value) = token_owned.as_deref() {
            vec![Some(token_value), None]
        } else {
            vec![None]
        };

        for auth in attempts {
            let response = client
                .get(&endpoint)
                .headers(build_headers_optional(auth))
                .send()
                .await;

            let Ok(resp) = response else {
                continue;
            };

            if resp.status().is_success() {
                if let Ok(parsed) = resp.json::<PullStatusResponse>().await {
                    pull_data = Some(parsed);
                }
                break;
            }

            if auth.is_some()
                && (resp.status() == reqwest::StatusCode::UNAUTHORIZED
                    || resp.status() == reqwest::StatusCode::FORBIDDEN)
            {
                continue;
            }

            break;
        }

        if let Some(pr) = pull_data {
            let status = if pr.merged_at.is_some() {
                "merged"
            } else if pr.state == "open" {
                "open"
            } else if pr.state == "closed" {
                "closed"
            } else {
                "unknown"
            };

            let draft = pr.draft.unwrap_or(false);
            let mergeable_state = pr.mergeable_state.clone();

            item.status = status.to_string();
            item.has_issues = has_pr_issues(status, draft, mergeable_state.as_deref());
            item.mergeable_state = mergeable_state;
        }

        result.push(item);
    }

    Ok(result)
}

pub async fn fetch_unicreate_recent_prs(token: &str, limit: Option<u32>) -> Result<Vec<RecoveredPr>, String> {
    let client = reqwest::Client::new();
    let headers = build_headers(token);
    let user = authenticate_github(token).await?;
    let per_page = limit.unwrap_or(10).clamp(1, 30);
    let query = format!(
        "repo:microsoft/winget-pkgs is:pr author:{} \"Created with [UniCreate]\"",
        user.login
    );
    let mut url = reqwest::Url::parse("https://api.github.com/search/issues")
        .map_err(|e| format!("URL parse failed: {}", e))?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("q", &query);
        pairs.append_pair("sort", "created");
        pairs.append_pair("order", "desc");
        pairs.append_pair("per_page", &per_page.to_string());
    }

    let resp = client
        .get(url)
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub search failed (HTTP {}): {}", status, body));
    }

    let search: SearchIssuesResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(search
        .items
        .into_iter()
        .filter(|item| item.pull_request.is_some())
        .map(|item| RecoveredPr {
            pr_url: item.html_url,
            title: item.title,
            created_at: item.created_at,
            user_login: item.user.login,
        })
        .collect())
}

fn build_headers_optional(token: Option<&str>) -> HeaderMap {
    let mut headers = HeaderMap::new();
    if let Some(token) = token {
        if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", token.trim())) {
            headers.insert(AUTHORIZATION, value);
        }
    }
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github.v3+json"),
    );
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));
    headers
}

fn build_headers(token: &str) -> HeaderMap {
    build_headers_optional(Some(token))
}

// ── Device Flow ───────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFlowStart {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    interval: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct DeviceTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
}

/// Step 1: Start device flow — returns a user code to show + a device code to poll with
pub async fn start_device_flow() -> Result<DeviceFlowStart, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/device/code")
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "UniCreate/1.0")
        .form(&[
            ("client_id", GITHUB_CLIENT_ID),
            ("scope", "public_repo"),
        ])
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub returned {} : {}", status, body));
    }

    let data: DeviceCodeResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(DeviceFlowStart {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        interval: data.interval.unwrap_or(5),
    })
}

/// Step 2: Poll for access token — returns the token once user has authorized, or an error string
pub async fn poll_device_flow(device_code: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://github.com/login/oauth/access_token")
        .header(ACCEPT, "application/json")
        .header(USER_AGENT, "UniCreate/1.0")
        .form(&[
            ("client_id", GITHUB_CLIENT_ID),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let data: DeviceTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    if let Some(token) = data.access_token {
        return Ok(token);
    }

    match data.error.as_deref() {
        Some("authorization_pending") => Err("pending".to_string()),
        Some("slow_down") => Err("slow_down".to_string()),
        Some("expired_token") => Err("Le code a expiré, veuillez réessayer.".to_string()),
        Some("access_denied") => Err("Accès refusé par l'utilisateur.".to_string()),
        Some(other) => Err(format!("Erreur: {}", other)),
        None => Err("Réponse inattendue de GitHub".to_string()),
    }
}

// ── PAT Auth (kept for backward compat) ──────────────────

pub async fn authenticate_github(token: &str) -> Result<GitHubUser, String> {
    if token.trim().is_empty() {
        return Err("Missing token".to_string());
    }
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/user")
        .headers(build_headers(token))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Invalid token (HTTP {})", resp.status()));
    }

    resp.json::<GitHubUser>()
        .await
        .map_err(|e| format!("Parse error: {}", e))
}

pub async fn submit_manifest(
    token: &str,
    yaml_files: &[YamlFile],
    package_id: &str,
    version: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let headers = build_headers(token);

    // 1. Get authenticated user
    let user = authenticate_github(token).await?;
    let username = &user.login;

    // 2. Fork winget-pkgs (idempotent)
    let _fork: serde_json::Value = client
        .post("https://api.github.com/repos/microsoft/winget-pkgs/forks")
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Fork failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Fork parse: {}", e))?;

    // Wait for fork to be ready
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    // 3. Get the latest commit SHA from master
    let master_ref: RefResponse = client
        .get(&format!(
            "https://api.github.com/repos/{}/winget-pkgs/git/ref/heads/master",
            username
        ))
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Get ref failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Ref parse: {}", e))?;

    let base_sha = &master_ref.object.sha;

    // 4. Create blobs for each YAML file
    let first_letter = package_id.chars().next().unwrap_or('_').to_lowercase().to_string();
    let parts: Vec<&str> = package_id.splitn(2, '.').collect();
    let (publisher, package) = if parts.len() == 2 {
        (parts[0], parts[1])
    } else {
        (package_id, package_id)
    };

    let base_path = format!("manifests/{}/{}/{}/{}", first_letter, publisher, package, version);

    let mut tree_entries = Vec::new();
    for file in yaml_files {
        let blob: CreateBlobResponse = client
            .post(&format!(
                "https://api.github.com/repos/{}/winget-pkgs/git/blobs",
                username
            ))
            .headers(headers.clone())
            .json(&CreateBlobRequest {
                content: file.content.clone(),
                encoding: "utf-8".to_string(),
            })
            .send()
            .await
            .map_err(|e| format!("Blob create failed: {}", e))?
            .json()
            .await
            .map_err(|e| format!("Blob parse: {}", e))?;

        tree_entries.push(TreeEntry {
            path: format!("{}/{}", base_path, file.file_name),
            mode: "100644".to_string(),
            entry_type: "blob".to_string(),
            sha: blob.sha,
        });
    }

    // 5. Create tree
    let tree: CreateTreeResponse = client
        .post(&format!(
            "https://api.github.com/repos/{}/winget-pkgs/git/trees",
            username
        ))
        .headers(headers.clone())
        .json(&CreateTreeRequest {
            base_tree: base_sha.clone(),
            tree: tree_entries,
        })
        .send()
        .await
        .map_err(|e| format!("Tree create failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Tree parse: {}", e))?;

    // 6. Create commit
    let commit: CreateCommitResponse = client
        .post(&format!(
            "https://api.github.com/repos/{}/winget-pkgs/git/commits",
            username
        ))
        .headers(headers.clone())
        .json(&CreateCommitRequest {
            message: format!("New version: {} version {}", package_id, version),
            tree: tree.sha,
            parents: vec![base_sha.clone()],
        })
        .send()
        .await
        .map_err(|e| format!("Commit create failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Commit parse: {}", e))?;

    // 7. Create branch
    let branch_name = format!("{}-{}", package_id, version).replace('.', "-");
    let _ref = client
        .post(&format!(
            "https://api.github.com/repos/{}/winget-pkgs/git/refs",
            username
        ))
        .headers(headers.clone())
        .json(&CreateRefRequest {
            ref_name: format!("refs/heads/{}", branch_name),
            sha: commit.sha,
        })
        .send()
        .await
        .map_err(|e| format!("Branch create failed: {}", e))?;

    // 8. Create PR
    let pr: PrResponse = client
        .post("https://api.github.com/repos/microsoft/winget-pkgs/pulls")
        .headers(headers.clone())
        .json(&CreatePrRequest {
            title: format!("New version: {} version {}", package_id, version),
            head: format!("{}:{}", username, branch_name),
            base: "master".to_string(),
            body: format!(
                "## Package: {}\n## Version: {}\n\nCreated with [UniCreate](https://github.com/drrakendu78/UniCreate)",
                package_id, version
            ),
        })
        .send()
        .await
        .map_err(|e| format!("PR create failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("PR parse: {}", e))?;

    Ok(pr.html_url)
}
