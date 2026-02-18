import { useState, useEffect } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useToastStore } from "@/stores/toast-store";
import type { Architecture, InstallerType, InstallerEntry, RepoMetadata, HashResult } from "@/lib/types";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Plus,
  Trash2,
  Loader2,
  Link2,
  ArrowLeft,
  ArrowRight,
  Shield,
  Cpu,
  Box,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

const architectures: Architecture[] = ["x64", "x86", "arm64", "arm", "neutral"];
const installerTypes: InstallerType[] = [
  "exe", "msi", "msix", "inno", "nullsoft", "wix", "burn", "zip", "portable",
];

export function StepInstaller() {
  const { manifest, addInstaller, removeInstaller, setStep, isAnalyzing, setIsAnalyzing, applyRepoMetadata, isUpdate } = useManifestStore();
  const addToast = useToastStore((s) => s.addToast);

  const [url, setUrl] = useState("");
  const [arch, setArch] = useState<Architecture>("x64");
  const [installerType, setInstallerType] = useState<InstallerType>("exe");
  const [error, setError] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [localHash, setLocalHash] = useState<HashResult | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        unlisten = await appWindow.onDragDropEvent((event) => {
          if (event.payload.type === "hover") {
            setIsDragging(true);
          } else if (event.payload.type === "cancel") {
            setIsDragging(false);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            const paths = event.payload.paths;
            if (paths.length > 0) {
              handleLocalFile(paths[0]);
            }
          }
        });
      } catch {
        // Drag-drop not available
      }
    };
    setup();
    return () => { unlisten?.(); };
  }, []);

  const isGitHubUrl = (u: string) => u.includes("github.com/");

  const handleLocalFile = async (filePath: string) => {
    setIsAnalyzing(true);
    setError(null);
    setLocalHash(null);
    try {
      const result = await invoke<HashResult>("hash_local_file", { path: filePath });
      setLocalHash(result);
      if (result.detectedType) setInstallerType(result.detectedType);
      if (result.detectedArch) setArch(result.detectedArch);
      addToast(`Hash computed: ${result.fileName}`, "success");
    } catch (e) {
      setError(String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setIsAnalyzing(true);
    setError(null);
    setAutoFilled(false);
    setLocalHash(null);
    try {
      const hashPromise = invoke<HashResult>("download_and_hash", { url: url.trim() });

      const metaPromise = isGitHubUrl(url.trim())
        ? invoke<RepoMetadata>("fetch_repo_metadata", { url: url.trim() }).catch(() => null)
        : Promise.resolve(null);

      const [result, meta] = await Promise.all([hashPromise, metaPromise]);

      const detectedType = result.detectedType as InstallerType | null;
      const detectedArch = result.detectedArch as Architecture | null;
      const entry: InstallerEntry = {
        architecture: detectedArch || arch,
        installerType: detectedType || installerType,
        installerUrl: url.trim(),
        installerSha256: result.sha256,
        signatureSha256: result.signatureSha256 || undefined,
      };
      addInstaller(entry);
      if (detectedType) setInstallerType(detectedType);
      if (detectedArch) setArch(detectedArch);

      if (meta && !isUpdate) {
        applyRepoMetadata(meta);
        setAutoFilled(true);
      }

      addToast("Installer added successfully", "success");
      setUrl("");
    } catch (e) {
      setError(String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddFromLocal = () => {
    if (!localHash || !url.trim()) return;
    const entry: InstallerEntry = {
      architecture: arch,
      installerType: localHash.detectedType || installerType,
      installerUrl: url.trim(),
      installerSha256: localHash.sha256,
      signatureSha256: localHash.signatureSha256 || undefined,
    };
    addInstaller(entry);
    setLocalHash(null);
    setUrl("");
    addToast("Installer added from local file", "success");
  };

  const canProceed = manifest.installers.length > 0;

  return (
    <div className="space-y-7">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <span>Step 1 of 4</span>
          {isUpdate && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <RefreshCw className="h-2.5 w-2.5" />
              UPDATE
            </span>
          )}
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          {isUpdate ? "Update Installer" : "Add Installers"}
        </h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
          {isUpdate
            ? `Add the new installer URL for ${manifest.packageIdentifier}. SHA256 will be computed automatically.`
            : "Provide the download URL or drag & drop a local file. We'll compute the SHA256 hash and detect the installer type automatically."}
        </p>
      </div>

      <div className={cn(
        "space-y-4 rounded-xl border bg-card/50 p-5 transition-colors",
        isDragging ? "border-primary border-dashed bg-primary/5" : "border-border"
      )}>
        {isDragging ? (
          <div className="flex flex-col items-center gap-2 py-6 animate-fade-in">
            <Upload className="h-8 w-8 text-primary/60" />
            <span className="text-[13px] font-medium text-primary/80">Drop file to compute hash</span>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Download URL</label>
              <div className="relative group">
                <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary/60 transition-colors" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !localHash && handleAnalyze()}
                  placeholder="https://github.com/user/repo/releases/download/v1.0/setup.exe"
                  className="h-10 w-full rounded-lg border border-border bg-background/50 pl-10 pr-4 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <Cpu className="h-3 w-3" />
                  Architecture
                </label>
                <select
                  value={arch}
                  onChange={(e) => setArch(e.target.value as Architecture)}
                  className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-[13px] focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                >
                  {architectures.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                  <Box className="h-3 w-3" />
                  Installer Type
                </label>
                <select
                  value={installerType}
                  onChange={(e) => setInstallerType(e.target.value as InstallerType)}
                  className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-[13px] focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                >
                  {installerTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {localHash && (
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3 space-y-2 animate-fade-in">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[12px] font-medium text-emerald-400">
                    Local file: {localHash.fileName}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground select-all">{localHash.sha256}</p>
                {localHash.signatureSha256 && (
                  <p className="text-[11px] text-muted-foreground">
                    SignatureSha256: <span className="font-mono select-all">{localHash.signatureSha256}</span>
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">Enter the download URL above, then click "Add"</p>
                <button
                  onClick={handleAddFromLocal}
                  disabled={!url.trim()}
                  className={cn(
                    "flex h-8 w-full items-center justify-center gap-2 rounded-lg text-[12px] font-medium transition-all",
                    "bg-emerald-600 text-white hover:bg-emerald-500",
                    "disabled:cursor-not-allowed disabled:opacity-40"
                  )}
                >
                  <Plus className="h-3 w-3" />
                  Add with local hash
                </button>
              </div>
            )}

            {!localHash && (
              <button
                onClick={handleAnalyze}
                disabled={!url.trim() || isAnalyzing}
                data-action="primary"
                className={cn(
                  "flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                  "bg-primary text-white hover:brightness-110 active:scale-[0.99]",
                  "disabled:cursor-not-allowed disabled:opacity-40"
                )}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Downloading & computing hash...
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    Analyze & Add
                  </>
                )}
              </button>
            )}

            <p className="text-center text-[11px] text-muted-foreground">
              or drag & drop a local file to compute hash
            </p>

            {error && (
              <p className="text-[12px] text-destructive animate-fade-in">{error}</p>
            )}
          </>
        )}
      </div>

      {manifest.installers.length > 0 && (
        <div className="space-y-2.5 animate-fade-in">
          <span className="text-[12px] font-medium text-muted-foreground">
            {manifest.installers.length} installer{manifest.installers.length > 1 ? "s" : ""} added
          </span>
          {manifest.installers.map((installer, index) => (
            <div
              key={index}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card/30 p-3.5 transition-colors hover:bg-card/60"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/8">
                <Shield className="h-3.5 w-3.5 text-primary/70" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-secondary/80 px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground/70">{installer.architecture}</span>
                  <span className="rounded bg-secondary/80 px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground/70">{installer.installerType}</span>
                  {installer.signatureSha256 && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">SIGNED</span>
                  )}
                </div>
                <p className="truncate text-[12px] text-muted-foreground/70">{installer.installerUrl}</p>
                <p className="font-mono text-[11px] text-muted-foreground select-all">{installer.installerSha256}</p>
              </div>
              <button
                onClick={() => removeInstaller(index)}
                className="mt-1 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {autoFilled && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-4 py-2.5 animate-fade-in">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[12px] font-medium text-primary/80">
            Metadata auto-filled from GitHub repository. You can review and edit in the next step.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => setStep("home")}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          onClick={() => setStep("metadata")}
          disabled={!canProceed}
          className={cn(
            "flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-medium transition-all duration-200",
            "bg-primary text-white hover:brightness-110 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:opacity-40"
          )}
        >
          Continue
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
