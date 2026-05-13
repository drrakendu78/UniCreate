use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

use crate::yaml_generator::{InstallerDefaults, InstallerSwitches, LocaleData, YamlFile};

static PROXY_URL: Mutex<Option<String>> = Mutex::new(None);

pub fn set_proxy_url(url: &str) {
    let trimmed = url.trim().to_string();
    let mut lock = PROXY_URL.lock().unwrap_or_else(|e| e.into_inner());
    if trimmed.is_empty() {
        *lock = None;
    } else {
        *lock = Some(trimmed);
    }
}

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
    pub release_date: Option<String>,
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

    // Validate preferred_name: no arg injection, no null bytes, reasonable length
    if preferred_name.is_empty() || preferred_name.len() > 255
        || preferred_name.starts_with('-') || preferred_name.contains('\0')
    {
        return Err("Invalid update file name".to_string());
    }

    let current_exe = std::env::current_exe()
        .map_err(|e| format!("Cannot locate app executable: {}", e))?;
    let current_pid = std::process::id();

    // Look for UniCreate-Updater.exe next to the main executable
    let exe_dir = current_exe.parent().ok_or("Cannot determine app directory")?;
    let updater_exe = exe_dir.join("UniCreate-Updater.exe");

    if !updater_exe.exists() {
        return Err("Updater not found. Please reinstall the application.".to_string());
    }

    std::process::Command::new(&updater_exe)
        .args([
            "--url", url,
            "--name", &preferred_name,
            "--app", &current_exe.to_string_lossy(),
            "--pid", &current_pid.to_string(),
        ])
        .spawn()
        .map_err(|e| {
            // ERROR_ELEVATION_REQUIRED (740): Windows installer-detection heuristic
            // auto-elevates any .exe whose name contains "updater" / "setup" / "install".
            // Running the updater from a non-admin process fails with this code.
            if e.raw_os_error() == Some(740) {
                "Update requires administrator privileges. Please restart UniCreate as administrator and try again.".to_string()
            } else {
                format!("Cannot start updater: {}", e)
            }
        })?;

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
    let gh_idx = parts.iter().position(|p| *p == "github.com")?;
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
    let client = http_client();
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
        Some(asset) => {
            // Only trust download URLs from GitHub domains
            let url_valid = reqwest::Url::parse(&asset.browser_download_url)
                .map(|u| {
                    u.scheme() == "https" && {
                        let h = u.host_str().unwrap_or("");
                        h == "github.com" || h.ends_with(".github.com")
                            || h == "objects.githubusercontent.com"
                            || h.ends_with(".githubusercontent.com")
                    }
                })
                .unwrap_or(false);
            if url_valid {
                (Some(asset.browser_download_url.clone()), Some(asset.name.clone()))
            } else {
                (None, None)
            }
        }
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

pub async fn fetch_repo_metadata(url: &str, token: Option<&str>) -> Result<RepoMetadata, String> {
    let (owner, repo, tag) = parse_github_url(url)
        .ok_or_else(|| "Not a GitHub URL".to_string())?;
    validate_github_name(&owner, "owner")?;
    validate_github_name(&repo, "repo")?;

    let client = http_client();
    let mut headers = build_headers_optional(token);
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

    // Validate tag if present: no path traversal or query injection
    if let Some(ref t) = tag {
        if t.is_empty() || t.len() > 128
            || t.contains('/') || t.contains('\\') || t.contains("..")
            || t.contains('?') || t.contains('#') || t.contains('%')
        {
            return Err("Invalid release tag".to_string());
        }
    }

    // Fetch release info if we have a tag
    let (version, release_notes, release_url, release_date) = if let Some(ref tag_name) = tag {
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
                release.published_at.and_then(extract_iso_date),
            ),
            Err(_) => (Some(clean_version(tag_name)), None, None, None),
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
                release.published_at.and_then(extract_iso_date),
            ),
            Err(_) => (None, None, None, None),
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
        release_date,
    })
}

/// Extrait la partie date (YYYY-MM-DD) d'un timestamp ISO 8601 retourné par
/// l'API GitHub (ex: "2026-05-13T19:08:05Z" → "2026-05-13").
fn extract_iso_date(iso: String) -> Option<String> {
    let head = iso.split('T').next()?;
    if head.len() == 10 && head.chars().filter(|c| c.is_ascii_digit()).count() == 8 {
        Some(head.to_string())
    } else {
        None
    }
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
    pub publisher_support_url: Option<String>,
    pub package_url: Option<String>,
    pub license_url: Option<String>,
    pub privacy_url: Option<String>,
    pub copyright: Option<String>,
    pub copyright_url: Option<String>,
    pub author: Option<String>,
    pub moniker: Option<String>,
    pub tags: Vec<String>,
    pub release_notes: Option<String>,
    pub release_notes_url: Option<String>,
    pub package_locale: String,
    pub minimum_os_version: Option<String>,
    pub installer_defaults: Option<InstallerDefaults>,
    pub installer_templates: Vec<ExistingInstallerTemplate>,
    pub additional_locales: Vec<LocaleData>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExistingInstallerTemplate {
    pub architecture: String,
    pub installer_type: Option<String>,
    pub installer_locale: Option<String>,
    pub scope: Option<String>,
    pub installer_switches: Option<InstallerSwitches>,
    pub install_modes: Option<Vec<String>>,
    pub product_code: Option<String>,
    pub upgrade_behavior: Option<String>,
    pub elevation_requirement: Option<String>,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct YamlVersionManifest {
    default_locale: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct YamlInstallerManifest {
    minimum_os_version: Option<String>,
    installer_locale: Option<String>,
    installer_type: Option<String>,
    scope: Option<String>,
    installer_switches: Option<YamlInstallerSwitches>,
    install_modes: Option<Vec<String>>,
    upgrade_behavior: Option<String>,
    elevation_requirement: Option<String>,
    #[serde(default)]
    installers: Vec<YamlInstallerEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct YamlInstallerEntry {
    architecture: String,
    installer_type: Option<String>,
    installer_locale: Option<String>,
    scope: Option<String>,
    installer_switches: Option<YamlInstallerSwitches>,
    install_modes: Option<Vec<String>>,
    product_code: Option<String>,
    upgrade_behavior: Option<String>,
    elevation_requirement: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "PascalCase")]
struct YamlInstallerSwitches {
    silent: Option<String>,
    silent_with_progress: Option<String>,
    interactive: Option<String>,
    install_location: Option<String>,
    log: Option<String>,
    upgrade: Option<String>,
    custom: Option<String>,
    repair: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct YamlLocaleManifest {
    package_locale: Option<String>,
    publisher: Option<String>,
    publisher_url: Option<String>,
    publisher_support_url: Option<String>,
    privacy_url: Option<String>,
    author: Option<String>,
    package_name: Option<String>,
    package_url: Option<String>,
    license: Option<String>,
    license_url: Option<String>,
    copyright: Option<String>,
    copyright_url: Option<String>,
    short_description: Option<String>,
    description: Option<String>,
    moniker: Option<String>,
    tags: Option<Vec<String>>,
    release_notes: Option<String>,
    release_notes_url: Option<String>,
    release_date: Option<String>,
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn normalize_vec(value: Option<Vec<String>>) -> Option<Vec<String>> {
    let values: Vec<String> = value
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

fn map_switches(value: Option<YamlInstallerSwitches>) -> Option<InstallerSwitches> {
    let switches = value?;
    let mapped = InstallerSwitches {
        silent: normalize_optional(switches.silent),
        silent_with_progress: normalize_optional(switches.silent_with_progress),
        interactive: normalize_optional(switches.interactive),
        install_location: normalize_optional(switches.install_location),
        log: normalize_optional(switches.log),
        upgrade: normalize_optional(switches.upgrade),
        custom: normalize_optional(switches.custom),
        repair: normalize_optional(switches.repair),
    };

    if mapped.silent.is_none()
        && mapped.silent_with_progress.is_none()
        && mapped.interactive.is_none()
        && mapped.install_location.is_none()
        && mapped.log.is_none()
        && mapped.upgrade.is_none()
        && mapped.custom.is_none()
        && mapped.repair.is_none()
    {
        None
    } else {
        Some(mapped)
    }
}

fn has_installer_defaults(defaults: &InstallerDefaults) -> bool {
    defaults.installer_locale.is_some()
        || defaults.installer_type.is_some()
        || defaults.scope.is_some()
        || defaults.installer_switches.is_some()
        || defaults.install_modes.is_some()
        || defaults.upgrade_behavior.is_some()
        || defaults.elevation_requirement.is_some()
}

fn parse_locale_manifest(yaml: &str) -> Result<LocaleData, String> {
    let parsed: YamlLocaleManifest = serde_yaml::from_str(yaml)
        .map_err(|e| format!("Locale YAML parse error: {}", e))?;

    Ok(LocaleData {
        package_locale: normalize_optional(parsed.package_locale)
            .unwrap_or_else(|| "en-US".to_string()),
        publisher: normalize_optional(parsed.publisher).unwrap_or_default(),
        publisher_url: normalize_optional(parsed.publisher_url),
        publisher_support_url: normalize_optional(parsed.publisher_support_url),
        privacy_url: normalize_optional(parsed.privacy_url),
        author: normalize_optional(parsed.author),
        package_name: normalize_optional(parsed.package_name).unwrap_or_default(),
        package_url: normalize_optional(parsed.package_url),
        license: normalize_optional(parsed.license).unwrap_or_default(),
        license_url: normalize_optional(parsed.license_url),
        copyright: normalize_optional(parsed.copyright),
        copyright_url: normalize_optional(parsed.copyright_url),
        short_description: normalize_optional(parsed.short_description).unwrap_or_default(),
        description: normalize_optional(parsed.description),
        moniker: normalize_optional(parsed.moniker),
        tags: normalize_vec(parsed.tags),
        release_notes: normalize_optional(parsed.release_notes),
        release_notes_url: normalize_optional(parsed.release_notes_url),
        release_date: normalize_optional(parsed.release_date),
    })
}

async fn fetch_github_yaml_file(
    client: &reqwest::Client,
    headers: &HeaderMap,
    file_url: &str,
) -> Result<String, String> {
    let file_content: GitHubFileContent = client
        .get(file_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let content_b64 = file_content.content.ok_or("Empty file")?;
    let clean_b64: String = content_b64.chars().filter(|c| !c.is_whitespace()).collect();
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&clean_b64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;
    if decoded.len() > 512 * 1024 {
        return Err("YAML file too large (max 512 KB)".to_string());
    }
    String::from_utf8(decoded).map_err(|e| format!("UTF-8 error: {}", e))
}

pub async fn fetch_existing_manifest(package_id: &str, token: Option<&str>) -> Result<ExistingManifest, String> {
    validate_package_id(package_id)?;
    let client = http_client();
    let mut headers = build_headers_optional(token);
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));

    // Build path: manifests/m/Microsoft/VisualStudio/2022/Community/
    let segments: Vec<&str> = package_id.split('.').collect();
    if segments.len() < 2 {
        return Err("Invalid package identifier format (expected Publisher.Package)".to_string());
    }
    let first_letter = segments[0].chars().next().unwrap_or('_').to_lowercase().to_string();
    let package_path = segments.join("/");

    let initial_dir_url = format!(
        "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/{}/{}",
        first_letter, package_path
    );

    // List versions — with case-insensitive fallback on 404
    let resp = client
        .get(&initial_dir_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    let (resp, dir_url) = if status == reqwest::StatusCode::NOT_FOUND {
        // Try to resolve with correct casing
        let resolved_path = resolve_path_case_insensitive(&client, &headers, &first_letter, &segments)
            .await
            .ok_or_else(|| format!("Package '{}' not found in winget-pkgs", package_id))?;
        let resolved_url = format!(
            "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/{}/{}",
            first_letter, resolved_path
        );
        let resolved_resp = client
            .get(&resolved_url)
            .headers(headers.clone())
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        (resolved_resp, resolved_url)
    } else {
        (resp, initial_dir_url)
    };

    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("Package '{}' not found in winget-pkgs", package_id));
    }
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("GitHub API rate limit exceeded. Please sign in with GitHub to increase the limit.".to_string());
    }
    if !status.is_success() {
        return Err(format!("GitHub API error (HTTP {})", status.as_u16()));
    }

    let versions: Vec<GitHubContentItem> = resp
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

    // Validate version from API response before using in URL
    validate_version(&latest_version)?;

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

    // Filter out file names with path traversal or unsafe characters
    let safe_name = |n: &str| -> bool {
        !n.contains('/') && !n.contains('\\') && !n.contains("..") && !n.contains('?') && !n.contains('#') && !n.contains('%')
    };

    let locale_files: Vec<&GitHubContentItem> = files
        .iter()
        .filter(|f| safe_name(&f.name) && f.name.contains(".locale.") && f.name.ends_with(".yaml"))
        .collect();
    if locale_files.is_empty() {
        return Err("No locale file found".to_string());
    }
    // Cap locale files to prevent unbounded API calls
    let locale_files: Vec<_> = locale_files.into_iter().take(20).collect();

    let version_file = files.iter().find(|f| {
        safe_name(&f.name) && f.name.ends_with(".yaml")
            && !f.name.contains(".installer.")
            && !f.name.contains(".locale.")
    });

    let installer_file = files
        .iter()
        .find(|f| safe_name(&f.name) && f.name.ends_with(".installer.yaml"));

    let default_locale_from_version = if let Some(file) = version_file {
        let version_file_url = format!("{}/{}", version_dir_url, file.name);
        let version_yaml = fetch_github_yaml_file(&client, &headers, &version_file_url).await?;
        let parsed_version: YamlVersionManifest = serde_yaml::from_str(&version_yaml)
            .map_err(|e| format!("Version YAML parse error: {}", e))?;
        normalize_optional(parsed_version.default_locale)
    } else {
        None
    };

    let mut minimum_os_version = None;
    let mut installer_defaults = None;
    let mut installer_templates = Vec::new();

    if let Some(file) = installer_file {
        let installer_file_url = format!("{}/{}", version_dir_url, file.name);
        let installer_yaml = fetch_github_yaml_file(&client, &headers, &installer_file_url).await?;
        let parsed_installer: YamlInstallerManifest = serde_yaml::from_str(&installer_yaml)
            .map_err(|e| format!("Installer YAML parse error: {}", e))?;

        minimum_os_version = normalize_optional(parsed_installer.minimum_os_version);

        let defaults = InstallerDefaults {
            installer_locale: normalize_optional(parsed_installer.installer_locale),
            installer_type: normalize_optional(parsed_installer.installer_type),
            scope: normalize_optional(parsed_installer.scope),
            installer_switches: map_switches(parsed_installer.installer_switches),
            install_modes: normalize_vec(parsed_installer.install_modes),
            upgrade_behavior: normalize_optional(parsed_installer.upgrade_behavior),
            elevation_requirement: normalize_optional(parsed_installer.elevation_requirement),
        };

        if has_installer_defaults(&defaults) {
            installer_defaults = Some(defaults.clone());
        }

        for entry in parsed_installer.installers {
            let architecture = entry.architecture.trim().to_string();
            if architecture.is_empty() {
                continue;
            }

            installer_templates.push(ExistingInstallerTemplate {
                architecture,
                installer_type: normalize_optional(entry.installer_type)
                    .or_else(|| installer_defaults.as_ref().and_then(|d| d.installer_type.clone())),
                installer_locale: normalize_optional(entry.installer_locale)
                    .or_else(|| installer_defaults.as_ref().and_then(|d| d.installer_locale.clone())),
                scope: normalize_optional(entry.scope)
                    .or_else(|| installer_defaults.as_ref().and_then(|d| d.scope.clone())),
                installer_switches: map_switches(entry.installer_switches)
                    .or_else(|| installer_defaults.as_ref().and_then(|d| d.installer_switches.clone())),
                install_modes: normalize_vec(entry.install_modes)
                    .or_else(|| installer_defaults.as_ref().and_then(|d| d.install_modes.clone())),
                product_code: normalize_optional(entry.product_code),
                upgrade_behavior: normalize_optional(entry.upgrade_behavior)
                    .or_else(|| installer_defaults.as_ref().and_then(|d| d.upgrade_behavior.clone())),
                elevation_requirement: normalize_optional(entry.elevation_requirement)
                    .or_else(|| installer_defaults.as_ref().and_then(|d| d.elevation_requirement.clone())),
            });
        }
    }

    let mut locale_items = Vec::new();
    for locale_file in locale_files {
        let locale_file_url = format!("{}/{}", version_dir_url, locale_file.name);
        let locale_yaml = fetch_github_yaml_file(&client, &headers, &locale_file_url).await?;
        let locale = parse_locale_manifest(&locale_yaml)?;
        locale_items.push(locale);
    }

    let default_locale_hint = default_locale_from_version
        .or_else(|| locale_items.first().map(|l| l.package_locale.clone()))
        .unwrap_or_else(|| "en-US".to_string());

    let default_locale = locale_items
        .iter()
        .find(|l| l.package_locale.eq_ignore_ascii_case(&default_locale_hint))
        .cloned()
        .or_else(|| locale_items.first().cloned())
        .ok_or_else(|| "No locale file found".to_string())?;

    let additional_locales: Vec<LocaleData> = locale_items
        .into_iter()
        .filter(|locale| !locale.package_locale.eq_ignore_ascii_case(&default_locale.package_locale))
        .collect();

    Ok(ExistingManifest {
        package_identifier: package_id.to_string(),
        latest_version,
        publisher: default_locale.publisher.clone(),
        package_name: default_locale.package_name.clone(),
        license: default_locale.license.clone(),
        short_description: default_locale.short_description.clone(),
        description: default_locale.description.clone(),
        publisher_url: default_locale.publisher_url.clone(),
        publisher_support_url: default_locale.publisher_support_url.clone(),
        package_url: default_locale.package_url.clone(),
        license_url: default_locale.license_url.clone(),
        privacy_url: default_locale.privacy_url.clone(),
        copyright: default_locale.copyright.clone(),
        copyright_url: default_locale.copyright_url.clone(),
        author: default_locale.author.clone(),
        moniker: default_locale.moniker.clone(),
        tags: default_locale.tags.clone().unwrap_or_default(),
        release_notes: default_locale.release_notes.clone(),
        release_notes_url: default_locale.release_notes_url.clone(),
        package_locale: default_locale.package_locale.clone(),
        minimum_os_version,
        installer_defaults,
        installer_templates,
        additional_locales,
    })
}

/// Fetch the raw YAML file contents for a given package ID + version from winget-pkgs.
/// Returns a list of { fileName, content } pairs for diffing against newly generated YAML.
pub async fn fetch_existing_yaml_files(
    package_id: &str,
    version: &str,
    token: Option<&str>,
) -> Result<Vec<YamlFile>, String> {
    validate_package_id(package_id)?;
    validate_version(version)?;
    let client = http_client();
    let mut headers = build_headers_optional(token);
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));

    let segments: Vec<&str> = package_id.split('.').collect();
    if segments.len() < 2 {
        return Err("Invalid package identifier format".to_string());
    }
    let first_letter = segments[0].chars().next().unwrap_or('_').to_lowercase().to_string();
    let package_path = segments.join("/");

    let version_dir_url = format!(
        "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/{}/{}/{}",
        first_letter, package_path, version
    );

    let resp = client
        .get(&version_dir_url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(format!("Version '{}' not found for '{}'", version, package_id));
    }
    if !status.is_success() {
        return Err(format!("GitHub API error (HTTP {})", status.as_u16()));
    }

    let files: Vec<GitHubContentItem> = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let safe_name = |n: &str| -> bool {
        !n.contains('/') && !n.contains('\\') && !n.contains("..") && n.ends_with(".yaml")
    };

    let yaml_files: Vec<&GitHubContentItem> = files
        .iter()
        .filter(|f| safe_name(&f.name) && f.item_type == "file")
        .take(10)
        .collect();

    let mut result = Vec::new();
    for file in yaml_files {
        let file_url = format!("{}/{}", version_dir_url, file.name);
        match fetch_github_yaml_file(&client, &headers, &file_url).await {
            Ok(content) => result.push(YamlFile {
                file_name: file.name.clone(),
                content,
            }),
            Err(_) => continue,
        }
    }

    Ok(result)
}

/// Resolve a package path case-insensitively by listing directories level by level.
/// Returns the correctly-cased path (e.g. "Mihomo-Party/Mihomo-Party") or None if not found.
async fn resolve_path_case_insensitive(
    client: &reqwest::Client,
    headers: &reqwest::header::HeaderMap,
    first_letter: &str,
    segments: &[&str],
) -> Option<String> {
    let base = "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests";
    let mut current_url = format!("{}/{}", base, first_letter);
    let mut resolved: Vec<String> = Vec::new();

    for segment in segments {
        let resp = client
            .get(&current_url)
            .headers(headers.clone())
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let items: Vec<GitHubContentItem> = resp.json().await.ok()?;
        let matched = items.iter().find(|item| {
            item.item_type == "dir" && item.name.eq_ignore_ascii_case(segment)
        })?;
        resolved.push(matched.name.clone());
        current_url = format!("{}/{}", current_url, matched.name);
    }

    Some(resolved.join("/"))
}

pub async fn check_package_exists(package_id: &str, token: Option<&str>) -> Result<bool, String> {
    validate_package_id(package_id)?;
    let client = http_client();
    let mut headers = build_headers_optional(token);
    headers.insert(ACCEPT, HeaderValue::from_static("application/vnd.github.v3+json"));
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));

    let segments: Vec<&str> = package_id.split('.').collect();
    if segments.len() < 2 {
        return Ok(false);
    }
    let first_letter = segments[0].chars().next().unwrap_or('_').to_lowercase().to_string();
    let package_path = segments.join("/");

    let url = format!(
        "https://api.github.com/repos/microsoft/winget-pkgs/contents/manifests/{}/{}",
        first_letter, package_path
    );

    let resp = client
        .get(&url)
        .headers(headers.clone())
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let status = resp.status();
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("GitHub API rate limit exceeded. Please sign in with GitHub to increase the limit.".to_string());
    }
    if status.is_success() {
        return Ok(true);
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        // Retry with case-insensitive path resolution
        let resolved = resolve_path_case_insensitive(&client, &headers, &first_letter, &segments).await;
        return Ok(resolved.is_some());
    }

    Ok(false)
}

fn parse_github_pr_url(pr_url: &str) -> Option<(String, String, u64)> {
    let clean = pr_url.trim().trim_end_matches('/');
    let parts: Vec<&str> = clean.split('/').collect();
    if parts.len() < 7 {
        return None;
    }
    if parts[2] != "github.com" || parts[5] != "pull" {
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
        return false;
    }

    // Only flag explicit problematic states.
    // "blocked" (often waiting review/checks) and "behind" are not treated as errors.
    matches!(
        mergeable_state,
        Some("dirty" | "unstable")
    )
}

pub async fn fetch_pr_statuses(
    pr_urls: &[String],
    token: Option<&str>,
) -> Result<Vec<PrLiveStatus>, String> {
    if pr_urls.len() > 20 {
        return Err("Too many PR URLs (max 20)".to_string());
    }

    let client = http_client();
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

        // Validate owner/repo to prevent URL manipulation
        if validate_github_name(&owner, "owner").is_err() || validate_github_name(&repo, "repo").is_err() {
            item.mergeable_state = Some("invalid-url".to_string());
            result.push(item);
            continue;
        }

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
    let client = http_client();
    let headers = build_headers(token);
    let user = authenticate_github(token).await?;
    validate_github_name(&user.login, "username")?;
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
        return Err(format!("GitHub search failed (HTTP {})", status));
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

fn http_client() -> reqwest::Client {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .connect_timeout(std::time::Duration::from_secs(10));

    if let Some(proxy_url) = PROXY_URL.lock().unwrap_or_else(|e| e.into_inner()).as_deref() {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_url) {
            builder = builder.proxy(proxy);
        }
    }

    builder.build().unwrap_or_else(|_| reqwest::Client::new())
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
    let client = http_client();
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
        return Err(format!("GitHub device flow returned HTTP {}", status));
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
    let client = http_client();
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
        Some(_) => Err("Erreur d'authentification inattendue. Veuillez réessayer.".to_string()),
        None => Err("Réponse inattendue de GitHub".to_string()),
    }
}

// ── User repos + releases (for quick-select in New Package) ──────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRepoInfo {
    pub owner: String,
    pub name: String,
    pub full_name: String,
}

#[derive(Debug, Deserialize)]
struct UserRepoApiItem {
    name: String,
    full_name: String,
    owner: UserRepoOwner,
    fork: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UserRepoOwner {
    login: String,
}

/// Fetch repos owned by the authenticated user, sorted by most recently pushed.
/// Only returns non-fork repos.
pub async fn fetch_user_repos(token: &str, limit: u32) -> Result<Vec<UserRepoInfo>, String> {
    let client = http_client();
    let headers = build_headers(token);
    let per_page = limit.clamp(1, 30);

    let resp = client
        .get(&format!(
            "https://api.github.com/user/repos?sort=pushed&per_page={}&affiliation=owner",
            per_page
        ))
        .headers(headers)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error (HTTP {})", resp.status()));
    }

    let repos: Vec<UserRepoApiItem> = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(repos
        .into_iter()
        .filter(|r| {
            // Exclude forks
            if r.fork.unwrap_or(false) { return false; }
            // Exclude profile repos (username/username) — they never have releases
            if r.name.eq_ignore_ascii_case(&r.owner.login) { return false; }
            true
        })
        .map(|r| UserRepoInfo {
            owner: r.owner.login,
            name: r.name,
            full_name: r.full_name,
        })
        .collect())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAssetInfo {
    pub name: String,
    pub download_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoReleaseInfo {
    pub tag: String,
    pub assets: Vec<ReleaseAssetInfo>,
}

fn validate_github_name(name: &str, label: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 100 {
        return Err(format!("Invalid {}", label));
    }
    if !name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return Err(format!("{} contains invalid characters", label));
    }
    Ok(())
}

pub async fn fetch_repo_releases(owner: &str, repo: &str, count: u32) -> Result<Vec<RepoReleaseInfo>, String> {
    validate_github_name(owner, "owner")?;
    validate_github_name(repo, "repo")?;
    let client = http_client();
    let per_page = count.clamp(1, 5);
    let url = format!(
        "https://api.github.com/repos/{}/{}/releases?per_page={}",
        owner, repo, per_page
    );

    let resp = client
        .get(&url)
        .header(USER_AGENT, "UniCreate")
        .header(ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("GitHub API error (HTTP {})", resp.status()));
    }

    let releases: Vec<GitHubRelease> = resp
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let installer_exts = [".exe", ".msi", ".msix", ".msixbundle", ".appx", ".zip"];
    let allowed_hosts = ["github.com", "objects.githubusercontent.com"];

    Ok(releases
        .into_iter()
        .map(|r| RepoReleaseInfo {
            tag: r.tag_name,
            assets: r
                .assets
                .into_iter()
                .filter(|a| {
                    let lower = a.name.to_lowercase();
                    if !installer_exts.iter().any(|ext| lower.ends_with(ext)) {
                        return false;
                    }
                    // Validate download URL points to a trusted GitHub domain
                    if let Ok(parsed) = reqwest::Url::parse(&a.browser_download_url) {
                        if parsed.scheme() != "https" { return false; }
                        let host = parsed.host_str().unwrap_or("");
                        allowed_hosts.iter().any(|h| host == *h || host.ends_with(&format!(".{}", h)))
                    } else {
                        false
                    }
                })
                .map(|a| ReleaseAssetInfo {
                    name: a.name,
                    download_url: a.browser_download_url,
                })
                .collect(),
        })
        .filter(|r| !r.assets.is_empty())
        .collect())
}

// ── PAT Auth (kept for backward compat) ──────────────────

pub async fn authenticate_github(token: &str) -> Result<GitHubUser, String> {
    if token.trim().is_empty() {
        return Err("Missing token".to_string());
    }
    let client = http_client();
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

fn validate_package_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 128 {
        return Err("Package identifier must be between 1 and 128 characters".to_string());
    }
    if !id.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err("Package identifier contains invalid characters".to_string());
    }
    if id.contains("..") || id.starts_with('.') || id.ends_with('.') {
        return Err("Invalid package identifier format".to_string());
    }
    if id.split('.').count() < 2 {
        return Err("Package identifier must have at least Publisher.Package format".to_string());
    }
    Ok(())
}

fn validate_version(v: &str) -> Result<(), String> {
    if v.is_empty() || v.len() > 64 {
        return Err("Version must be between 1 and 64 characters".to_string());
    }
    if v.contains('/') || v.contains('\\') || v.contains("..") {
        return Err("Version contains invalid characters".to_string());
    }
    if !v.chars().all(|c| c.is_alphanumeric() || c == '.' || c == '-' || c == '_' || c == '+') {
        return Err("Version contains invalid characters".to_string());
    }
    Ok(())
}

pub async fn submit_manifest(
    token: &str,
    yaml_files: &[YamlFile],
    package_id: &str,
    version: &str,
    is_update: bool,
) -> Result<String, String> {
    validate_package_id(package_id)?;
    validate_version(version)?;

    // Limit number of files and content size
    if yaml_files.len() > 10 {
        return Err("Too many YAML files (max 10)".to_string());
    }
    for file in yaml_files {
        if file.content.len() > 512 * 1024 {
            return Err("YAML file content too large (max 512 KB)".to_string());
        }
    }

    let client = http_client();
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
    let segments: Vec<&str> = package_id.split('.').collect();
    let first_letter = segments[0].chars().next().unwrap_or('_').to_lowercase().to_string();
    let package_path = segments.join("/");

    let base_path = format!("manifests/{}/{}/{}", first_letter, package_path, version);

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
            message: format!("{}: {} version {}", if is_update { "New version" } else { "New package" }, package_id, version),
            tree: tree.sha,
            parents: vec![base_sha.clone()],
        })
        .send()
        .await
        .map_err(|e| format!("Commit create failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Commit parse: {}", e))?;

    // 7. Create branch (add timestamp to avoid collisions on resubmit)
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let branch_name = format!("{}-{}-{}", package_id, version, timestamp).replace('.', "-");
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
            title: format!("{}: {} version {}", if is_update { "New version" } else { "New package" }, package_id, version),
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
