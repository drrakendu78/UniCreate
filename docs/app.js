const repo = "drrakendu78/UniCreate";
const releaseApi = `https://api.github.com/repos/${repo}/releases/latest`;
const releasePage = `https://github.com/${repo}/releases`;

const byId = (id) => document.getElementById(id);

const setText = (id, value) => {
  const node = byId(id);
  if (node) node.textContent = value;
};

const setHref = (id, href, label) => {
  const node = byId(id);
  if (!node) return;
  node.href = href;
  if (typeof label === "string") node.textContent = label;
};

const formatDate = (iso) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const formatDateTime = (date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

const pickAsset = (assets, matchers) => {
  const patterns = Array.isArray(matchers) ? matchers : [matchers];
  return assets
    .filter((asset) => patterns.some((pattern) => pattern.test(asset.name)))
    .sort((a, b) => (b.download_count || 0) - (a.download_count || 0))[0];
};

const buildNotes = ({ version, publishedAt, setup, msi, portable, rawNotes }) => {
  const summary = [
    `Release: ${version}`,
    `Published: ${formatDate(publishedAt)}`,
    `Repository: ${repo}`,
    "",
    "Assets:",
    `- Setup: ${setup ? setup.name : "not found"}`,
    `- MSI: ${msi ? msi.name : "not found"}`,
    `- Portable: ${portable ? portable.name : "not found"}`,
    "",
  ].join("\n");

  const notes = (rawNotes || "No release notes provided.").trim();
  return `${summary}${notes}`;
};

const setReleaseUi = (release) => {
  const version = release.tag_name || "latest";
  const assets = Array.isArray(release.assets) ? release.assets : [];

  const setup = pickAsset(assets, [/setup\.exe$/i, /-setup\.exe$/i]);
  const msi = pickAsset(assets, [/\.msi$/i]);
  const portable = pickAsset(assets, [/portable.*\.exe$/i, /_portable\.exe$/i]);

  const downloadCount = assets.reduce((total, asset) => total + (asset.download_count || 0), 0);

  setText("release-version", version);
  setText("release-version-chip", version);
  setText("release-tag", version);
  setText("release-tag-2", version);
  setText("release-date", formatDate(release.published_at));
  setText("release-downloads", String(downloadCount));

  setHref("btn-setup", setup?.browser_download_url || release.html_url || releasePage);
  setHref("btn-portable", portable?.browser_download_url || release.html_url || releasePage);
  setHref("btn-release", release.html_url || releasePage);

  setHref("asset-setup", setup?.browser_download_url || release.html_url || releasePage, setup?.name || "Open release");
  setHref("asset-msi", msi?.browser_download_url || release.html_url || releasePage, msi?.name || "Open release");
  setHref(
    "asset-portable",
    portable?.browser_download_url || release.html_url || releasePage,
    portable?.name || "Open release"
  );

  setText(
    "release-notes",
    buildNotes({
      version,
      publishedAt: release.published_at,
      setup,
      msi,
      portable,
      rawNotes: release.body,
    })
  );

  setText("page-generated", `Last sync: ${formatDateTime(new Date())}`);
  document.title = `UniCreate ${version} | WinGet manifest creator`;
};

const setFallbackUi = () => {
  setText("release-version", "Unavailable");
  setText("release-version-chip", "offline");
  setText("release-tag", "offline");
  setText("release-tag-2", "offline");
  setText("release-date", "-");
  setText("release-downloads", "-");

  setHref("btn-setup", releasePage);
  setHref("btn-portable", releasePage);
  setHref("btn-release", releasePage);
  setHref("asset-setup", releasePage, "Open releases");
  setHref("asset-msi", releasePage, "Open releases");
  setHref("asset-portable", releasePage, "Open releases");

  setText(
    "release-notes",
    "Could not load release metadata from GitHub API.\nOpen the releases page to view the latest package."
  );
  setText("page-generated", `Last sync: ${formatDateTime(new Date())} (API unavailable)`);
};

const loadRelease = async () => {
  try {
    const response = await fetch(releaseApi, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) throw new Error(`GitHub API error ${response.status}`);

    const release = await response.json();
    setReleaseUi(release);
  } catch (error) {
    console.error(error);
    setFallbackUi();
  }
};

const setupReveal = () => {
  const nodes = [...document.querySelectorAll("[data-reveal]")];
  if (!nodes.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.14 }
  );

  nodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 35, 250)}ms`;
    observer.observe(node);
  });
};

window.addEventListener("DOMContentLoaded", () => {
  setupReveal();
  loadRelease();
});
