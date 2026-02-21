const repo = "drrakendu78/UniCreate";
const releaseApi = `https://api.github.com/repos/${repo}/releases/latest`;
const releasePage = `https://github.com/${repo}/releases`;
const wingetPackageId = "Drrakendu78.UniCreate";
const wingetOwner = "microsoft";
const wingetRepo = "winget-pkgs";
const wingetFallbackPrNumber = 340948;
const wingetSearchQuery = `repo:${wingetOwner}/${wingetRepo} is:pr "${wingetPackageId}"`;
const wingetSearchApi = `https://api.github.com/search/issues?q=${encodeURIComponent(
  wingetSearchQuery
)}&sort=created&order=desc&per_page=20`;
const wingetMergedSearchQuery = `repo:${wingetOwner}/${wingetRepo} is:pr is:merged "${wingetPackageId}"`;
const wingetMergedSearchApi = `https://api.github.com/search/issues?q=${encodeURIComponent(
  wingetMergedSearchQuery
)}&sort=created&order=desc&per_page=10`;
const wingetRepoPrsPage = `https://github.com/${wingetOwner}/${wingetRepo}/pulls?q=is%3Apr+${encodeURIComponent(
  wingetPackageId
)}`;

const byId = (id) => document.getElementById(id);
const githubHeaders = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};
const cachePrefix = "unicreate-site-cache:v1:";
const apiCooldownKey = `${cachePrefix}api-cooldown-until`;
const defaultApiCooldownMs = 10 * 60 * 1000;
const cacheTtl = {
  release: 20 * 60 * 1000,
  wingetSearch: 2 * 60 * 1000,
  wingetPr: 2 * 60 * 1000,
  wingetLabels: 2 * 60 * 1000,
};
const fetchInflight = new Map();
let latestReleaseVersion = null;

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

const cleanVersion = (value) => String(value || "").trim().replace(/^v/i, "");

const parseVersionParts = (value) => {
  const matches = cleanVersion(value).match(/\d+/g);
  if (!matches) return [];
  return matches.map((part) => Number.parseInt(part, 10)).filter((part) => Number.isFinite(part));
};

const compareVersions = (lhs, rhs) => {
  const lhsParts = parseVersionParts(lhs);
  const rhsParts = parseVersionParts(rhs);
  const maxLen = Math.max(lhsParts.length, rhsParts.length);

  for (let index = 0; index < maxLen; index += 1) {
    const l = lhsParts[index] ?? 0;
    const r = rhsParts[index] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }

  return 0;
};

const extractVersionFromPrTitle = (title) => {
  const value = String(title || "");
  const versionMatch = value.match(/\bversion\s+([vV]?\d+(?:\.\d+){1,3})\b/i);
  if (versionMatch?.[1]) return cleanVersion(versionMatch[1]);

  const genericMatch = value.match(/\b([vV]?\d+(?:\.\d+){1,3})\b/);
  if (genericMatch?.[1]) return cleanVersion(genericMatch[1]);
  return null;
};

const readStorageJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStorageJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota/availability errors
  }
};

const cacheKeyFor = (key) => `${cachePrefix}${key}`;

const getCached = (key, ttlMs = Number.POSITIVE_INFINITY) => {
  if (!key) return null;
  const payload = readStorageJson(cacheKeyFor(key));
  if (!payload || typeof payload.ts !== "number") return null;
  if (Date.now() - payload.ts > ttlMs) return null;
  return payload.data ?? null;
};

const setCached = (key, data) => {
  if (!key || data == null) return;
  writeStorageJson(cacheKeyFor(key), {
    ts: Date.now(),
    data,
  });
};

const getApiCooldownUntil = () => {
  const value = Number(localStorage.getItem(apiCooldownKey) || 0);
  if (!Number.isFinite(value)) return 0;
  return value;
};

const setApiCooldown = (untilMs) => {
  try {
    localStorage.setItem(apiCooldownKey, String(untilMs));
  } catch {
    // ignore storage errors
  }
};

const getRateLimitResetMs = (response) => {
  const resetHeader = Number(response.headers.get("x-ratelimit-reset") || 0);
  if (!Number.isFinite(resetHeader) || resetHeader <= 0) return 0;
  return resetHeader * 1000;
};

const fetchGitHubJson = async (url, options = {}) => {
  const { cacheKey, ttlMs } = options;
  const cachedFresh = getCached(cacheKey, ttlMs);
  const cachedStale = getCached(cacheKey);

  const cooldownUntil = getApiCooldownUntil();
  if (cooldownUntil > Date.now()) {
    if (cachedStale) return cachedStale;
    throw new Error(`GitHub API cooldown active until ${new Date(cooldownUntil).toISOString()}`);
  }

  if (fetchInflight.has(url)) {
    return fetchInflight.get(url);
  }

  const request = (async () => {
    try {
      const response = await fetch(url, { headers: githubHeaders });

      if (response.status === 403) {
        const resetMs = getRateLimitResetMs(response);
        const cooldownMs = resetMs > Date.now() ? resetMs : Date.now() + defaultApiCooldownMs;
        setApiCooldown(cooldownMs);
        if (cachedStale) return cachedStale;
        throw new Error(`GitHub API error 403 on ${url}`);
      }

      if (!response.ok) {
        if (cachedStale) return cachedStale;
        throw new Error(`GitHub API error ${response.status} on ${url}`);
      }

      const payload = await response.json();
      setCached(cacheKey, payload);
      return payload;
    } catch (error) {
      if (cachedFresh) return cachedFresh;
      if (cachedStale) return cachedStale;
      throw error;
    } finally {
      fetchInflight.delete(url);
    }
  })();

  fetchInflight.set(url, request);
  return request;
};

const normalizeHexColor = (value) => {
  const raw = String(value || "")
    .trim()
    .replace(/^#/, "");
  if (/^[a-f0-9]{3}$/i.test(raw)) return raw.split("").map((char) => `${char}${char}`).join("").toLowerCase();
  if (/^[a-f0-9]{6}$/i.test(raw)) return raw.toLowerCase();
  return null;
};

const hexToRgb = (hex) => ({
  r: Number.parseInt(hex.slice(0, 2), 16),
  g: Number.parseInt(hex.slice(2, 4), 16),
  b: Number.parseInt(hex.slice(4, 6), 16),
});

const prLabelVisuals = (rawColor) => {
  const hex = normalizeHexColor(rawColor);
  if (!hex) return null;
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return {
    borderColor: `rgba(${r}, ${g}, ${b}, 0.68)`,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.24)`,
    textColor: luminance > 0.62 ? "#0a1118" : "#f7fbff",
  };
};

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
  latestReleaseVersion = cleanVersion(version);
  const assets = Array.isArray(release.assets) ? release.assets : [];

  const setup = pickAsset(assets, [/setup\.exe$/i, /-setup\.exe$/i]);
  const msi = pickAsset(assets, [/\.msi$/i]);
  const portable = pickAsset(assets, [/portable.*\.exe$/i, /_portable\.exe$/i]);

  const downloadCount = assets.reduce((total, asset) => total + (asset.download_count || 0), 0);

  setText("release-version", version);
  setText("release-version-chip", version);
  setText("release-tag", version);
  setText("release-tag-2", version);
  setText("widget-release-tag", version);
  setText("release-date", formatDate(release.published_at));
  setText("release-downloads", String(downloadCount));

  setHref("btn-setup", setup?.browser_download_url || release.html_url || releasePage);
  setHref("btn-portable", portable?.browser_download_url || release.html_url || releasePage);
  setHref("btn-release", release.html_url || releasePage);
  setHref("widget-release-link", release.html_url || releasePage);

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
  latestReleaseVersion = null;
  setText("release-version", "Unavailable");
  setText("release-version-chip", "offline");
  setText("release-tag", "offline");
  setText("release-tag-2", "offline");
  setText("widget-release-tag", "offline");
  setText("release-date", "-");
  setText("release-downloads", "-");

  setHref("btn-setup", releasePage);
  setHref("btn-portable", releasePage);
  setHref("btn-release", releasePage);
  setHref("widget-release-link", releasePage, "Open");
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
    const release = await fetchGitHubJson(releaseApi, {
      cacheKey: "release-latest",
      ttlMs: cacheTtl.release,
    });
    setReleaseUi(release);
    return release;
  } catch (error) {
    console.error(error);
    setFallbackUi();
    return null;
  }
};

const applyWingetBadgeClass = (stateClass) => {
  const node = byId("winget-state-badge");
  if (!node) return;
  node.className = `winget-state mono ${stateClass}`;
};

const setWingetUi = ({ badge, stateClass, label, command, text, link, linkLabel }) => {
  setText("winget-state-badge", badge);
  applyWingetBadgeClass(stateClass);
  setText("winget-state-label", label);
  setText("winget-command", command);
  setText("winget-status-text", text);
  setHref("winget-pr-link", link, linkLabel);
  setHref("widget-pr-link", link, "Open");

  const commandNode = byId("winget-command");
  if (!commandNode) return;
  commandNode.classList.toggle("winget-command-ready", stateClass === "winget-state-ready");

  const copyButton = byId("winget-copy-btn");
  if (!copyButton) return;
  const copyable = /^winget install\s+/i.test(String(command || "").trim());
  copyButton.disabled = !copyable;
  copyButton.dataset.command = copyable ? String(command).trim() : "";
  copyButton.textContent = copyable ? "Copy" : "Copy";
};

const renderWingetPrBadges = (labels) => {
  const node = byId("winget-pr-badges");
  if (!node) return;
  node.replaceChildren();

  const list = Array.isArray(labels) ? labels.slice(0, 8) : [];
  if (!list.length) {
    const empty = document.createElement("span");
    empty.className = "winget-pr-badge winget-pr-badge-muted";
    empty.textContent = "No PR labels yet";
    node.append(empty);
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "winget-pr-badge-tooltip-wrap";

  const chip = document.createElement("span");
  chip.className = "winget-pr-badge winget-pr-badge-summary";
  chip.textContent = `${list.length} label${list.length > 1 ? "s" : ""}`;
  wrapper.append(chip);

  const dropdown = document.createElement("span");
  dropdown.className = "winget-pr-badge-dropdown";

  for (const label of list) {
    const badge = document.createElement("span");
    badge.className = "winget-pr-badge";
    badge.textContent = label?.name || "label";

    const visuals = prLabelVisuals(label?.color);
    if (visuals) {
      badge.style.borderColor = visuals.borderColor;
      badge.style.backgroundColor = visuals.backgroundColor;
      badge.style.color = visuals.textColor;
    }

    dropdown.append(badge);
  }

  wrapper.append(dropdown);
  node.append(wrapper);
};

const loadWingetPrLabels = async (prNumber) => {
  const issueApi = `https://api.github.com/repos/${wingetOwner}/${wingetRepo}/issues/${prNumber}`;
  try {
    const issue = await fetchGitHubJson(issueApi, {
      cacheKey: `winget-issue-${prNumber}`,
      ttlMs: cacheTtl.wingetLabels,
    });
    return Array.isArray(issue.labels) ? issue.labels : [];
  } catch (error) {
    console.error(error);
    return [];
  }
};

const pickWingetPrFromSearch = (items) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  const packageNeedle = wingetPackageId.toLowerCase();
  const matching = list.filter((item) => String(item?.title || "").toLowerCase().includes(packageNeedle));
  const source = matching.length ? matching : list;

  const open = source.find((item) => String(item?.state || "").toLowerCase() === "open");
  return open || source[0] || null;
};

const fetchLatestWingetPr = async () => {
  const searchResult = await fetchGitHubJson(wingetSearchApi, {
    cacheKey: `winget-search-${wingetPackageId.toLowerCase()}`,
    ttlMs: cacheTtl.wingetSearch,
  });

  const selected = pickWingetPrFromSearch(searchResult?.items);
  if (!selected?.number) return null;

  const number = selected.number;
  const pullApi = `https://api.github.com/repos/${wingetOwner}/${wingetRepo}/pulls/${number}`;
  const [pullRequest, labels] = await Promise.all([
    fetchGitHubJson(pullApi, {
      cacheKey: `winget-pr-${number}`,
      ttlMs: cacheTtl.wingetPr,
    }),
    loadWingetPrLabels(number),
  ]);

  return { pullRequest, labels };
};

const fetchLatestMergedWingetInfo = async () => {
  const searchResult = await fetchGitHubJson(wingetMergedSearchApi, {
    cacheKey: `winget-merged-search-${wingetPackageId.toLowerCase()}`,
    ttlMs: cacheTtl.wingetSearch,
  });

  const selected = pickWingetPrFromSearch(searchResult?.items);
  if (!selected) return null;

  return {
    number: selected.number,
    title: selected.title || "",
    url: selected.html_url || wingetRepoPrsPage,
    mergedAt: selected.closed_at || null,
    version: extractVersionFromPrTitle(selected.title || ""),
  };
};

const pickPrimaryPrLabel = (labels) => {
  const list = Array.isArray(labels) ? labels : [];
  if (!list.length) return null;

  const priorities = [
    /validation-completed/i,
    /azure-pipeline-passed/i,
    /publish-pipeline-passed/i,
    /new-package/i,
  ];

  for (const pattern of priorities) {
    const found = list.find((label) => pattern.test(label?.name || ""));
    if (found) return found;
  }

  return list[0];
};

const stateClassFromLabel = (labelName) => {
  const name = String(labelName || "").toLowerCase();
  if (!name) return "winget-state-review";
  if (/(failed|error|blocked|rejected|needs|conflict|invalid)/.test(name)) return "winget-state-blocked";
  if (/(passed|completed|healthy|approved|merged)/.test(name)) return "winget-state-ready";
  if (/(closed|abandoned)/.test(name)) return "winget-state-closed";
  return "winget-state-review";
};

const resolveReviewSignal = (mergeableState, draft) => {
  if (draft) return { badge: "Draft", className: "winget-state-blocked", summary: "draft pull request" };

  switch ((mergeableState || "").toLowerCase()) {
    case "clean":
      return { badge: "In review", className: "winget-state-review", summary: "checks passing" };
    case "behind":
      return { badge: "Needs update", className: "winget-state-blocked", summary: "branch behind base" };
    case "blocked":
    case "dirty":
      return { badge: "Needs action", className: "winget-state-blocked", summary: "changes requested or conflicts" };
    case "unstable":
      return { badge: "In review", className: "winget-state-review", summary: "checks running" };
    default:
      return { badge: "In review", className: "winget-state-review", summary: "review in progress" };
  }
};

const loadWingetStatus = async () => {
  try {
    const [wingetData, mergedWingetInfo] = await Promise.all([fetchLatestWingetPr(), fetchLatestMergedWingetInfo()]);
    const mergedVersion = mergedWingetInfo?.version || null;
    const hasWingetVersion = Boolean(mergedVersion);
    const installCommand = `winget install ${wingetPackageId}`;
    const wingetVersionNote = hasWingetVersion ? ` WinGet available version: v${mergedVersion}.` : "";

    if (!wingetData?.pullRequest) {
      renderWingetPrBadges([]);
      setText("widget-pr-ref", "None");
      setWingetUi({
        badge: "No PR found",
        stateClass: "winget-state-offline",
        label: "WinGet package status",
        command: hasWingetVersion ? installCommand : "Status unavailable",
        text: hasWingetVersion
          ? `No active UniCreate PR found in winget-pkgs.${wingetVersionNote}`
          : "No UniCreate PR found in winget-pkgs yet.",
        link: wingetRepoPrsPage,
        linkLabel: "Open winget PRs",
      });
      return;
    }

    const pullRequest = wingetData.pullRequest;
    const prLabels = wingetData.labels || [];
    renderWingetPrBadges(prLabels);

    const prTitle = pullRequest.title || `${wingetPackageId} package`;
    const prNumber = pullRequest.number || wingetFallbackPrNumber;
    const prVersion = extractVersionFromPrTitle(prTitle);
    const releaseAhead =
      latestReleaseVersion && prVersion ? compareVersions(latestReleaseVersion, prVersion) === 1 : false;
    const behindNote = releaseAhead
      ? ` Latest GitHub release is v${latestReleaseVersion}, but this PR targets v${prVersion}.`
      : "";

    setText("widget-pr-ref", `#${prNumber}`);
    const prLinkLabel = `Open PR #${prNumber}`;
    const prLink = pullRequest.html_url || `https://github.com/${wingetOwner}/${wingetRepo}/pull/${prNumber}`;

    if (pullRequest.merged_at) {
      setWingetUi({
        badge: "Available",
        stateClass: "winget-state-ready",
        label: "WinGet package status",
        command: installCommand,
        text: `Merged into winget-pkgs on ${formatDate(pullRequest.merged_at)}. Install directly from terminal.${wingetVersionNote}`,
        link: prLink,
        linkLabel: prLinkLabel,
      });
      return;
    }

    if ((pullRequest.state || "").toLowerCase() === "open") {
      const signal = resolveReviewSignal(pullRequest.mergeable_state, pullRequest.draft);
      const primaryLabel = pickPrimaryPrLabel(prLabels);
      const badgeLabel = primaryLabel?.name || signal.badge;
      const badgeClass = primaryLabel ? stateClassFromLabel(primaryLabel.name) : signal.className;
      setWingetUi({
        badge: badgeLabel,
        stateClass: badgeClass,
        label: "WinGet package status",
        command: hasWingetVersion ? installCommand : "Not available yet",
        text: hasWingetVersion
          ? `PR #${prNumber} (${prTitle}) is ${signal.summary}. New version will be available after merge.${wingetVersionNote}${behindNote}`
          : `PR #${prNumber} (${prTitle}) is ${signal.summary}. Command will be winget install ${wingetPackageId} once merged into winget-pkgs.${behindNote}`,
        link: prLink,
        linkLabel: prLinkLabel,
      });
      return;
    }

    setWingetUi({
      badge: "Closed",
      stateClass: "winget-state-closed",
      label: "WinGet package status",
      command: hasWingetVersion ? installCommand : "Not available",
      text: hasWingetVersion
        ? `PR #${prNumber} is closed.${wingetVersionNote}${behindNote}`
        : `PR #${prNumber} is closed. A merged PR is required before winget install is available.${behindNote}`,
      link: prLink,
      linkLabel: prLinkLabel,
    });
  } catch (error) {
    console.error(error);
    renderWingetPrBadges([]);
    setText("widget-pr-ref", `#${wingetFallbackPrNumber}`);
    setWingetUi({
      badge: "Status unavailable",
      stateClass: "winget-state-offline",
      label: "WinGet package status",
      command: "Status unavailable",
      text: `Could not query winget-pkgs right now. Check PR status directly on GitHub.`,
      link: wingetRepoPrsPage,
      linkLabel: "Open current PR",
    });
  }
};

const ensureManifestForHttp = () => {
  if (!/^https?:$/.test(window.location.protocol)) return;
  if (document.querySelector("link[rel='manifest']")) return;
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = "./site.webmanifest";
  document.head.append(manifest);
};

const setupBackToTop = () => {
  const button = byId("to-top-btn");
  if (!button) return;

  const sync = () => {
    button.classList.toggle("is-visible", window.scrollY > 420);
  };

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  sync();
  window.addEventListener("scroll", sync, { passive: true });
};

const setupWingetCopy = () => {
  const button = byId("winget-copy-btn");
  if (!button) return;

  const fallbackCopy = (value) => {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  };

  button.addEventListener("click", async () => {
    const value = String(button.dataset.command || "").trim();
    if (!value) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopy(value);
      }

      const previous = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = previous || "Copy";
      }, 1200);
    } catch (error) {
      console.error(error);
      button.textContent = "Error";
      window.setTimeout(() => {
        button.textContent = "Copy";
      }, 1200);
    }
  });
};

const setupMobileNavigation = () => {
  const topbar = document.querySelector(".app-topbar");
  const toggle = byId("nav-toggle");
  const nav = byId("primary-nav");
  if (!topbar || !toggle || !nav) return;

  const navLinks = [...nav.querySelectorAll("a[href^='#']")];
  const isMobile = () => window.matchMedia("(max-width: 760px)").matches;

  const setOpen = (open) => {
    topbar.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  };

  setOpen(false);

  toggle.addEventListener("click", () => {
    if (!isMobile()) return;
    setOpen(!topbar.classList.contains("nav-open"));
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (isMobile()) setOpen(false);
    });
  });

  document.addEventListener("click", (event) => {
    if (!isMobile()) return;
    const target = event.target;
    if (target instanceof Node && !topbar.contains(target)) {
      setOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) setOpen(false);
  });
};

const setupStepNavigation = () => {
  const links = [...document.querySelectorAll(".app-steps a[href^='#']")];
  if (!links.length) return;

  const items = links
    .map((link) => {
      const targetSelector = link.getAttribute("href");
      if (!targetSelector) return null;
      const target = document.querySelector(targetSelector);
      if (!target) return null;
      return { link, target };
    })
    .filter(Boolean);

  if (!items.length) return;

  const setCurrent = (activeLink) => {
    for (const { link } of items) {
      link.classList.toggle("is-current", link === activeLink);
    }
  };

  const getTargetTop = (target) => window.scrollY + target.getBoundingClientRect().top;
  const minActiveSpan = 180;

  const syncCurrentFromScroll = () => {
    if (window.scrollY <= 24) {
      setCurrent(items[0].link);
      return;
    }

    const scrollBottom = window.scrollY + window.innerHeight;
    const docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    if (scrollBottom >= docHeight - 4) {
      setCurrent(items[items.length - 1].link);
      return;
    }

    const markerOffset = Math.min(Math.max(window.innerHeight * 0.34, 180), 360);
    const marker = window.scrollY + markerOffset;
    let current = items[0];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const start = getTargetTop(item.target);
      const nextStart = index < items.length - 1 ? getTargetTop(items[index + 1].target) : Number.POSITIVE_INFINITY;
      const end = Math.max(start + minActiveSpan, nextStart - 48);

      if (marker >= start && marker < end) {
        current = item;
        break;
      }

      if (marker >= start) current = item;
    }

    setCurrent(current.link);
  };

  for (const { link, target } of items) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrent(link);
    });
  }

  syncCurrentFromScroll();
  window.addEventListener("scroll", syncCurrentFromScroll, { passive: true });
  window.addEventListener("resize", syncCurrentFromScroll);
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
  ensureManifestForHttp();
  setupReveal();
  setupWingetCopy();
  setupMobileNavigation();
  setupStepNavigation();
  setupBackToTop();
  loadRelease().finally(() => {
    loadWingetStatus();
  });
});
