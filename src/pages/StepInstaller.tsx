import { useState, useEffect, useRef, useCallback } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useAuthSessionStore } from "@/stores/auth-session-store";
import { useToastStore } from "@/stores/toast-store";
import { useUserRepos } from "@/hooks/use-user-repos";
import type {
  Architecture, InstallerType, InstallerEntry,
  InstallerTemplateEntry, RepoMetadata, HashResult, RepoReleaseInfo,
} from "@/lib/types";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Plus, Trash2, Loader2, Link2, ArrowLeft, ArrowRight,
  Shield, Cpu, Box, Sparkles, RefreshCw, FolderOpen, Upload,
  Github, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const architectures: Architecture[] = ["x64", "x86", "arm64", "arm", "neutral"];
const installerTypes: InstallerType[] = [
  "exe", "msi", "msix", "inno", "nullsoft", "wix", "burn", "zip", "portable",
];

function detectTypeFromName(name: string): InstallerType | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".msi")) return "msi";
  if (lower.endsWith(".msix") || lower.endsWith(".msixbundle") || lower.endsWith(".appx")) return "msix";
  if (lower.endsWith(".zip")) return "zip";
  if (lower.includes("portable") && lower.endsWith(".exe")) return "portable";
  if (lower.endsWith(".exe")) return "exe";
  return null;
}

function detectArchFromName(name: string): Architecture | null {
  const lower = name.toLowerCase();
  if (lower.includes("arm64") || lower.includes("aarch64")) return "arm64";
  if (lower.includes("x64") || lower.includes("amd64") || lower.includes("win64") || lower.includes("x86_64")) return "x64";
  if (lower.includes("x86") || lower.includes("win32") || lower.includes("ia32") || lower.includes("i686")) return "x86";
  if (lower.includes("arm")) return "arm";
  return null;
}

function pickInstallerTemplate(
  templates: InstallerTemplateEntry[],
  architecture: Architecture,
  installerType: InstallerType
): InstallerTemplateEntry | null {
  if (!templates.length) return null;
  return (
    templates.find((t) => t.architecture === architecture && (!t.installerType || t.installerType === installerType)) ||
    templates.find((t) => t.architecture === architecture) ||
    templates.find((t) => t.installerType === installerType) ||
    templates[0] || null
  );
}

function mergeTemplateFields(base: InstallerEntry, template: InstallerTemplateEntry | null): InstallerEntry {
  if (!template) return base;
  return {
    ...base,
    installerLocale: template.installerLocale || base.installerLocale,
    scope: template.scope || base.scope,
    installerSwitches: template.installerSwitches ? { ...template.installerSwitches } : base.installerSwitches,
    installModes: template.installModes?.length ? [...template.installModes] : base.installModes,
    upgradeBehavior: template.upgradeBehavior || base.upgradeBehavior,
    elevationRequirement: template.elevationRequirement || base.elevationRequirement,
  };
}

export function StepInstaller() {
  const {
    manifest, updateInstallerTemplates, addInstaller, removeInstaller,
    setStep, isAnalyzing, setIsAnalyzing, applyRepoMetadata,
    setPackageVersion, setLocale, isUpdate,
  } = useManifestStore();
  const activeSessionToken = useAuthSessionStore((s) => s.activeSessionToken);
  const addToast = useToastStore((s) => s.addToast);

  const [url, setUrl] = useState("");
  const [arch, setArch] = useState<Architecture>("x64");
  const [installerType, setInstallerType] = useState<InstallerType>("exe");
  const [nestedInstallerType, setNestedInstallerType] = useState<InstallerType>("exe");
  const [nestedRelativeFilePath, setNestedRelativeFilePath] = useState("");
  const [nestedPortableAlias, setNestedPortableAlias] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [localHash, setLocalHash] = useState<HashResult | null>(null);

  const userRepos = useUserRepos(activeSessionToken, !isUpdate);
  const hashingRef = useRef(false);

  // En mode update : suggérer les 3 dernières releases GitHub du package en cours.
  // On extrait owner/repo depuis les URLs présentes dans le manifest existant.
  const [updateReleases, setUpdateReleases] = useState<RepoReleaseInfo[]>([]);
  const [loadingUpdateReleases, setLoadingUpdateReleases] = useState(false);

  useEffect(() => {
    if (!isUpdate) {
      setUpdateReleases([]);
      return;
    }
    // On scanne tous les champs URL du locale pour trouver un repo github.com/owner/repo.
    // licenseUrl + releaseNotesUrl sont les plus fiables (pointent typiquement vers le repo).
    const candidates = [
      manifest.locale?.licenseUrl,
      manifest.locale?.releaseNotesUrl,
      manifest.locale?.packageUrl,
      manifest.locale?.publisherUrl,
      manifest.locale?.publisherSupportUrl,
      manifest.locale?.privacyUrl,
      manifest.locale?.copyrightUrl,
    ].filter((u): u is string => Boolean(u));
    let owner: string | null = null;
    let repo: string | null = null;
    for (const u of candidates) {
      const m = u.match(/github\.com\/([^\/\s?#]+)\/([^\/\s?#]+)/i);
      if (m && m[2] && !m[2].toLowerCase().startsWith("releases") && !m[2].toLowerCase().startsWith("blob")) {
        owner = m[1];
        repo = m[2].replace(/\.git$/i, "");
        break;
      }
    }
    if (!owner || !repo) {
      setUpdateReleases([]);
      return;
    }

    let cancelled = false;
    setLoadingUpdateReleases(true);
    invoke<RepoReleaseInfo[]>("fetch_repo_releases", { owner, repo, count: 3 })
      .then((r) => { if (!cancelled) setUpdateReleases(r); })
      .catch(() => { if (!cancelled) setUpdateReleases([]); })
      .finally(() => { if (!cancelled) setLoadingUpdateReleases(false); });
    return () => { cancelled = true; };
  }, [isUpdate, manifest.locale?.packageUrl, manifest.locale?.releaseNotesUrl, manifest.locale?.publisherUrl]);
  const t = useT();

  const handleLocalFile = useCallback(async (filePath: string) => {
    if (hashingRef.current) return;
    hashingRef.current = true;
    setIsAnalyzing(true); setError(null); setLocalHash(null);
    try {
      const result = await invoke<HashResult>("hash_local_file", { path: filePath });
      setLocalHash(result);
      if (result.detectedType) setInstallerType(result.detectedType);
      if (result.detectedArch) setArch(result.detectedArch);
      addToast(`Hash computed: ${result.fileName}`, "success");
    } catch (e) { setError(String(e)); }
    finally { hashingRef.current = false; setIsAnalyzing(false); }
  }, [setIsAnalyzing, addToast]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        unlisten = await appWindow.onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") setIsDragging(true);
          else if (event.payload.type === "leave") setIsDragging(false);
          else if (event.payload.type === "drop") {
            setIsDragging(false);
            if (event.payload.paths.length > 0) handleLocalFile(event.payload.paths[0]);
          }
        });
      } catch { /* Drag-drop not available */ }
    };
    setup();
    return () => { unlisten?.(); };
  }, [handleLocalFile]);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setIsAnalyzing(true); setError(null); setAutoFilled(false); setLocalHash(null);
    try {
      const trimmed = url.trim();
      const hashPromise = invoke<HashResult>("download_and_hash", { url: trimmed });
      const metaPromise = trimmed.includes("github.com/")
        ? invoke<RepoMetadata>("fetch_repo_metadata", { url: trimmed, token: activeSessionToken ?? null }).catch(() => null)
        : Promise.resolve(null);
      const [result, meta] = await Promise.all([hashPromise, metaPromise]);

      const detectedType = result.detectedType as InstallerType | null;
      const detectedArch = result.detectedArch as Architecture | null;
      const finalArch = detectedArch || arch;
      const finalType = detectedType || installerType;
      const baseEntry: InstallerEntry = {
        architecture: finalArch, installerType: finalType,
        installerUrl: trimmed, installerSha256: result.sha256,
        signatureSha256: result.signatureSha256 || undefined,
        nestedInstallerType: finalType === "zip" && nestedRelativeFilePath ? nestedInstallerType : undefined,
        nestedInstallerFiles: finalType === "zip" && nestedRelativeFilePath ? [{
          relativeFilePath: nestedRelativeFilePath,
          portableCommandAlias: nestedInstallerType === "portable" && nestedPortableAlias ? nestedPortableAlias : undefined,
        }] : undefined,
      };
      const template = isUpdate ? pickInstallerTemplate(updateInstallerTemplates, finalArch, finalType) : null;
      addInstaller(mergeTemplateFields(baseEntry, template));
      if (detectedType) setInstallerType(detectedType);
      if (detectedArch) setArch(detectedArch);

      if (meta) {
        if (isUpdate) {
          if (meta.version) setPackageVersion(meta.version);
          if (meta.releaseNotes) setLocale({ releaseNotes: meta.releaseNotes });
          if (meta.releaseUrl) setLocale({ releaseNotesUrl: meta.releaseUrl });
          if (meta.releaseDate) setLocale({ releaseDate: meta.releaseDate });
        } else {
          applyRepoMetadata(meta);
          setAutoFilled(true);
        }
      }
      addToast("Installer added successfully", "success");
      setUrl("");
      setNestedRelativeFilePath("");
      setNestedPortableAlias("");
    } catch (e) { setError(String(e)); }
    finally { setIsAnalyzing(false); }
  };

  const handleAddFromLocal = async () => {
    if (!localHash || !url.trim()) return;
    const trimmed = url.trim();
    const finalType = localHash.detectedType || installerType;
    const baseEntry: InstallerEntry = {
      architecture: arch, installerType: finalType,
      installerUrl: trimmed, installerSha256: localHash.sha256,
      signatureSha256: localHash.signatureSha256 || undefined,
      nestedInstallerType: finalType === "zip" && nestedRelativeFilePath ? nestedInstallerType : undefined,
      nestedInstallerFiles: finalType === "zip" && nestedRelativeFilePath ? [{
        relativeFilePath: nestedRelativeFilePath,
        portableCommandAlias: nestedInstallerType === "portable" && nestedPortableAlias ? nestedPortableAlias : undefined,
      }] : undefined,
    };
    const template = isUpdate ? pickInstallerTemplate(updateInstallerTemplates, arch, finalType) : null;
    addInstaller(mergeTemplateFields(baseEntry, template));

    // Fetch repo metadata from the URL if it's a GitHub link
    if (trimmed.includes("github.com/")) {
      try {
        const meta = await invoke<RepoMetadata>("fetch_repo_metadata", { url: trimmed, token: activeSessionToken ?? null });
        if (meta) {
          if (isUpdate) {
            if (meta.version) setPackageVersion(meta.version);
            if (meta.releaseNotes) setLocale({ releaseNotes: meta.releaseNotes });
            if (meta.releaseUrl) setLocale({ releaseNotesUrl: meta.releaseUrl });
          } else {
            applyRepoMetadata(meta);
            setAutoFilled(true);
          }
        }
      } catch { /* metadata fetch failed — non-blocking */ }
    }

    setLocalHash(null); setUrl("");
    setNestedRelativeFilePath("");
    setNestedPortableAlias("");
    addToast("Installer added from local file", "success");
  };

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <span>{t("installer.step")}</span>
          {isUpdate && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <RefreshCw className="h-2.5 w-2.5" />{t("common.update")}
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold tracking-tight">{isUpdate ? t("installer.titleUpdate") : t("installer.title")}</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
          {isUpdate
            ? t("installer.descUpdate", { id: manifest.packageIdentifier })
            : t("installer.desc")}
        </p>
      </div>

      {/* Update mode : suggérer les 3 dernières releases GitHub du package */}
      {isUpdate && (loadingUpdateReleases || updateReleases.length > 0) && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Github className="h-3 w-3" />Releases récentes
          </span>
          {loadingUpdateReleases ? (
            <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Chargement des releases...
            </div>
          ) : (
            <div className="space-y-1.5 rounded-lg border border-border/50 bg-card/30 p-2.5">
              {updateReleases.map((release) => (
                <div key={release.tag} className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">{release.tag}</span>
                  <div className="flex flex-wrap gap-1">
                    {release.assets.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground/60">Aucun asset</span>
                    ) : release.assets.map((asset) => (
                      <button
                        key={asset.downloadUrl}
                        onClick={() => {
                          setUrl(asset.downloadUrl);
                          const detType = detectTypeFromName(asset.name);
                          const detArch = detectArchFromName(asset.name);
                          if (detType) setInstallerType(detType);
                          if (detArch) setArch(detArch);
                        }}
                        disabled={isAnalyzing}
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-[10px] font-medium transition-all",
                          url === asset.downloadUrl ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                          "disabled:opacity-40 disabled:cursor-not-allowed"
                        )}
                        title={asset.downloadUrl}
                      >{asset.name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* User repos quick-select */}
      {!isUpdate && (userRepos.loading || userRepos.repos.length > 0) && (
        <div className="space-y-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Github className="h-3 w-3" />{t("installer.yourRepos")}
          </span>
          {userRepos.loading ? (
            <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />{t("installer.loadingRepos")}
            </div>
          ) : (
            <div className="space-y-1.5">
              {userRepos.repos.map((repo) => {
                const key = repo.fullName;
                return (
                  <div key={key} className="rounded-lg border border-border/50 bg-card/30 overflow-hidden">
                    <button
                      onClick={() => userRepos.toggleRepo(repo)}
                      className={cn("flex w-full items-center justify-between px-3 py-2 text-[12px] font-medium transition-colors hover:bg-card/60", userRepos.expandedRepo === key ? "text-primary" : "text-foreground")}
                    >
                      <span>{key}</span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {userRepos.loadingReleases.has(key) ? <Loader2 className="h-3 w-3 animate-spin" /> : userRepos.expandedRepo === key ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </span>
                    </button>
                    {userRepos.expandedRepo === key && userRepos.releases[key] && (
                      <div className="border-t border-border/30 px-3 py-2 space-y-2 animate-fade-in">
                        {userRepos.releases[key].length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">{t("installer.noReleases")}</p>
                        ) : (
                          userRepos.releases[key].map((release) => (
                            <div key={release.tag} className="space-y-1">
                              <span className="text-[10px] font-semibold text-muted-foreground">{release.tag}</span>
                              <div className="flex flex-wrap gap-1">
                                {release.assets.map((asset) => (
                                  <button
                                    key={asset.downloadUrl}
                                    onClick={() => {
                                      setUrl(asset.downloadUrl);
                                      const detType = detectTypeFromName(asset.name);
                                      const detArch = detectArchFromName(asset.name);
                                      if (detType) setInstallerType(detType);
                                      if (detArch) setArch(detArch);
                                    }}
                                    disabled={isAnalyzing}
                                    className={cn(
                                      "rounded-md border px-2 py-0.5 text-[10px] font-medium transition-all",
                                      url === asset.downloadUrl ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background/50 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                                      "disabled:opacity-40 disabled:cursor-not-allowed"
                                    )}
                                    title={asset.downloadUrl}
                                  >{asset.name}</button>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className={cn("space-y-4 rounded-xl border bg-card/50 p-5 transition-colors", isDragging ? "border-primary border-dashed bg-primary/5" : "border-border")}>
        {isDragging ? (
          <div className="flex flex-col items-center gap-2 py-6 animate-fade-in">
            <Upload className="h-8 w-8 text-primary/60" />
            <span className="text-[13px] font-medium text-primary/80">{t("installer.dropHere")}</span>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">{t("installer.downloadUrl")}</label>
              <div className="relative group">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary/60 transition-colors" />
                <input
                  type="url" value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !localHash && handleAnalyze()}
                  placeholder="https://github.com/user/repo/releases/download/v1.0/setup.exe"
                  className="h-10 w-full rounded-lg border border-border bg-background/50 pl-10 pr-4 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-foreground"><Cpu className="h-3 w-3" />{t("installer.architecture")}</label>
                <select value={arch} onChange={(e) => setArch(e.target.value as Architecture)} className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-[13px] focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all">
                  {architectures.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-foreground"><Box className="h-3 w-3" />{t("installer.installerType")}</label>
                <select value={installerType} onChange={(e) => setInstallerType(e.target.value as InstallerType)} className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-[13px] focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all">
                  {installerTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {installerType === "zip" && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3 animate-fade-in">
                <span className="text-[12px] font-semibold text-muted-foreground">{t("installer.nestedInstaller")}</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-foreground">{t("installer.nestedType")}</label>
                    <select value={nestedInstallerType} onChange={(e) => setNestedInstallerType(e.target.value as InstallerType)} className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-[13px] focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all">
                      {installerTypes.filter((it) => it !== "zip").map((it) => <option key={it} value={it}>{it}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-foreground">{t("installer.relativeFilePath")}</label>
                    <input type="text" value={nestedRelativeFilePath} onChange={(e) => setNestedRelativeFilePath(e.target.value)}
                      placeholder={t("installer.relativeFilePathPlaceholder")}
                      className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
                  </div>
                </div>
                {nestedInstallerType === "portable" && (
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-foreground">{t("installer.portableCommandAlias")}</label>
                    <input type="text" value={nestedPortableAlias} onChange={(e) => setNestedPortableAlias(e.target.value)}
                      placeholder="e.g. myapp"
                      className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
                  </div>
                )}
              </div>
            )}

            {localHash && (
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[12px] font-medium text-emerald-400">{t("installer.localFile")}: {localHash.fileName}</span>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground select-all">{localHash.sha256}</p>
                {localHash.signatureSha256 && (
                  <p className="text-[11px] text-muted-foreground">SignatureSha256: <span className="font-mono select-all">{localHash.signatureSha256}</span></p>
                )}
                <p className="text-[11px] text-muted-foreground">{t("installer.enterUrlThenAdd")}</p>
                <button onClick={handleAddFromLocal} disabled={!url.trim()}
                  className={cn("flex h-8 w-full items-center justify-center gap-2 rounded-lg text-[12px] font-medium transition-all", "bg-emerald-600 text-white hover:bg-emerald-500", "disabled:cursor-not-allowed disabled:opacity-40")}>
                  <Plus className="h-3 w-3" />{t("installer.addWithLocalHash")}
                </button>
              </div>
            )}

            {!localHash && (
              <button onClick={handleAnalyze} disabled={!url.trim() || isAnalyzing} data-action="primary"
                className={cn("flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all duration-200", "bg-primary text-white hover:brightness-110 active:scale-[0.99]", "disabled:cursor-not-allowed disabled:opacity-40")}>
                {isAnalyzing
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("installer.downloading")}</>
                  : <><Plus className="h-3.5 w-3.5" />{t("installer.analyzeAdd")}</>}
              </button>
            )}

            <p className="text-center text-[11px] text-muted-foreground">{t("installer.dragDrop")}</p>
            {error && <p className="text-[12px] text-destructive animate-fade-in">{error}</p>}
          </>
        )}
      </div>

      {manifest.installers.length > 0 && (() => {
        const duplicateKeys = new Set<string>();
        const seen = new Map<string, number>();
        manifest.installers.forEach((inst, i) => {
          const key = `${inst.architecture}|${inst.installerType}|${inst.scope || ""}`;
          if (seen.has(key)) {
            duplicateKeys.add(key);
            seen.set(key, seen.get(key)!);
          } else {
            seen.set(key, i);
          }
        });
        const hasDuplicates = duplicateKeys.size > 0;

        return (
          <div className="space-y-2.5 animate-fade-in">
            <span className="text-[12px] font-medium text-muted-foreground">
              {t("installer.added", { n: manifest.installers.length, s: manifest.installers.length > 1 ? "s" : "" })}
            </span>
            {hasDuplicates && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 animate-fade-in">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="text-[11px] font-medium text-amber-400">{t("installer.duplicate")}</span>
              </div>
            )}
            {manifest.installers.map((installer, index) => {
              const isDuplicate = duplicateKeys.has(`${installer.architecture}|${installer.installerType}|${installer.scope || ""}`);
              return (
                <div key={index} className={cn("group flex items-start gap-3 rounded-lg border p-3.5 transition-colors", isDuplicate ? "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10" : "border-border bg-card/30 hover:bg-card/60")}>
                  <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", isDuplicate ? "bg-amber-500/15" : "bg-primary/8")}>
                    {isDuplicate ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : <Shield className="h-3.5 w-3.5 text-primary/70" />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", isDuplicate ? "bg-amber-500/15 text-amber-400" : "bg-secondary/80 text-secondary-foreground/70")}>{installer.architecture}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", isDuplicate ? "bg-amber-500/15 text-amber-400" : "bg-secondary/80 text-secondary-foreground/70")}>{installer.installerType}</span>
                      {installer.scope && <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", isDuplicate ? "bg-amber-500/15 text-amber-400" : "bg-secondary/80 text-secondary-foreground/70")}>{installer.scope}</span>}
                      {installer.signatureSha256 && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">SIGNED</span>}
                      {isDuplicate && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500">DUPLICATE</span>}
                    </div>
                    <p className="truncate text-[12px] text-muted-foreground/70">{installer.installerUrl}</p>
                    <p className="font-mono text-[11px] text-muted-foreground select-all">{installer.installerSha256}</p>
                  </div>
                  <button onClick={() => removeInstaller(index)} className="mt-1 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {autoFilled && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-4 py-2.5 animate-fade-in">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[12px] font-medium text-primary/80">{t("installer.autoFilled")}</span>
        </div>
      )}

      <div className="sticky bottom-0 flex items-center justify-between bg-background/95 backdrop-blur-sm pt-4 pb-2 -mx-6 px-6">
        <button onClick={() => setStep("home")} className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />{t("installer.back")}
        </button>
        <button onClick={() => setStep("metadata")} disabled={!manifest.installers.length}
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-medium transition-all duration-200", "bg-primary text-white hover:brightness-110 active:scale-[0.98]", "disabled:cursor-not-allowed disabled:opacity-40")}>
          {t("installer.continue")}<ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
