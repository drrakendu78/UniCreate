const repo = "drrakendu78/UniCreate";
const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

const id = (value) => document.getElementById(value);

const formatDate = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
};

const pickAsset = (assets, matcher) => assets.find((asset) => matcher.test(asset.name));

const setReleaseUi = (release) => {
  const version = release.tag_name || "latest";
  const notes = (release.body || "No release notes available.").trim();
  const assets = release.assets || [];

  const setup = pickAsset(assets, /setup\.exe$/i);
  const portable = pickAsset(assets, /portable\.exe$/i);
  const msi = pickAsset(assets, /\.msi$/i);

  const setupUrl = setup?.browser_download_url || release.html_url;
  const portableUrl = portable?.browser_download_url || release.html_url;

  id("release-version").textContent = version;
  id("release-version-chip").textContent = version;
  id("release-tag").textContent = version;
  id("release-date").textContent = formatDate(release.published_at);

  const downloadCount = assets.reduce((acc, current) => acc + (current.download_count || 0), 0);
  id("release-downloads").textContent = String(downloadCount);

  id("btn-setup").href = setupUrl;
  id("btn-portable").href = portableUrl;
  id("btn-release").href = release.html_url;

  const notesHeader = [
    `Release: ${version}`,
    setup ? `Setup: ${setup.name}` : "Setup: not found",
    msi ? `MSI: ${msi.name}` : "MSI: not found",
    portable ? `Portable: ${portable.name}` : "Portable: not found",
    "",
  ].join("\n");

  id("release-notes").textContent = `${notesHeader}${notes}`;
};

const setFallbackUi = () => {
  id("release-version").textContent = "Unavailable";
  id("release-version-chip").textContent = "offline";
  id("release-tag").textContent = "offline";
  id("release-date").textContent = "-";
  id("release-downloads").textContent = "-";
  id("release-notes").textContent =
    "Could not load release metadata from GitHub API. Open GitHub manually to view the latest release.";
};

const loadRelease = async () => {
  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}`);
    }

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
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.16 }
  );

  nodes.forEach((node, index) => {
    node.style.transitionDelay = `${Math.min(index * 35, 260)}ms`;
    observer.observe(node);
  });
};

setupReveal();
loadRelease();
