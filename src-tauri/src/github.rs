use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::{Deserialize, Serialize};

use crate::yaml_generator::YamlFile;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub avatar_url: String,
}

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
