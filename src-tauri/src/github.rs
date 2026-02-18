use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

use crate::yaml_generator::YamlFile;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    #[serde(alias = "avatar_url")]
    #[serde(rename(serialize = "avatarUrl", deserialize = "avatar_url"))]
    pub avatar_url: String,
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
struct GitHubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
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

fn build_headers(token: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
    );
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github.v3+json"),
    );
    headers.insert(USER_AGENT, HeaderValue::from_static("UniCreate/1.0"));
    headers
}

pub async fn authenticate_github(token: &str) -> Result<GitHubUser, String> {
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
