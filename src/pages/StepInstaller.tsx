import { useState } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import type { Architecture, InstallerType, InstallerEntry } from "@/lib/types";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Trash2,
  Loader2,
  Link,
  ChevronRight,
  Hash,
  Cpu,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";

const architectures: Architecture[] = ["x64", "x86", "arm64", "arm", "neutral"];
const installerTypes: InstallerType[] = [
  "exe", "msi", "msix", "inno", "nullsoft", "wix", "burn", "zip", "portable",
];

export function StepInstaller() {
  const { manifest, addInstaller, removeInstaller, updateInstaller, setStep, isAnalyzing, setIsAnalyzing } =
    useManifestStore();

  const [url, setUrl] = useState("");
  const [arch, setArch] = useState<Architecture>("x64");
  const [type, setType] = useState<InstallerType>("exe");

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setIsAnalyzing(true);
    try {
      const result = await invoke<{
        sha256: string;
        file_size: number;
        file_name: string;
        detected_type: string | null;
      }>("download_and_hash", { url: url.trim() });

      const detectedType = result.detected_type as InstallerType | null;
      const entry: InstallerEntry = {
        architecture: arch,
        installerType: detectedType || type,
        installerUrl: url.trim(),
        installerSha256: result.sha256,
      };
      addInstaller(entry);
      if (detectedType) setType(detectedType);
      setUrl("");
    } catch (e) {
      console.error("Hash failed:", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const canProceed = manifest.installers.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Installer</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add one or more installer URLs. The SHA256 hash will be calculated automatically.
        </p>
      </div>

      {/* Add installer form */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Installer URL</label>
          <div className="relative">
            <Link className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/repo/releases/download/v1.0/setup.exe"
              className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              Architecture
            </label>
            <select
              value={arch}
              onChange={(e) => setArch(e.target.value as Architecture)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {architectures.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-medium">
              <Box className="h-3.5 w-3.5 text-muted-foreground" />
              Installer Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as InstallerType)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {installerTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={!url.trim() || isAnalyzing}
          className={cn(
            "flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Downloading & hashing...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Analyze & Add Installer
            </>
          )}
        </button>
      </div>

      {/* Installer list */}
      {manifest.installers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Installers ({manifest.installers.length})
          </h3>
          {manifest.installers.map((installer, index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Hash className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                    {installer.architecture}
                  </span>
                  <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                    {installer.installerType}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {installer.installerUrl}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground/70">
                  SHA256: {installer.installerSha256.substring(0, 16)}...
                </p>
              </div>
              <button
                onClick={() => removeInstaller(index)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Next button */}
      <div className="flex justify-end">
        <button
          onClick={() => setStep("metadata")}
          disabled={!canProceed}
          className={cn(
            "flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
