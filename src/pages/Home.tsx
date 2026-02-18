import { useState } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useHistoryStore } from "@/stores/history-store";
import { useToastStore } from "@/stores/toast-store";
import type { ExistingManifest } from "@/lib/types";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  Plus, RefreshCw, Loader2, Search, CheckCircle2, Package,
  AlertCircle, ExternalLink, Clock, Trash2,
} from "lucide-react";

function parseWingetPkgsUrl(url: string): string | null {
  const match = url.match(/winget-pkgs\/(?:tree|blob)\/\w+\/manifests\/\w\/([^/]+)\/([^/]+)/);
  if (match) return `${match[1]}.${match[2]}`;
  return null;
}

export function Home() {
  const { setStep, setIsUpdate, applyExistingManifest, reset } = useManifestStore();
  const { submissions, clearHistory } = useHistoryStore();
  const addToast = useToastStore((s) => s.addToast);
  const [mode, setMode] = useState<"choice" | "update">("choice");
  const [packageId, setPackageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<ExistingManifest | null>(null);

  const handleNew = () => {
    reset();
    setIsUpdate(false);
    setStep("installer");
  };

  const handleInputChange = (value: string) => {
    setPackageId(value);
    setFound(null);
    setError(null);
    if (value.includes("winget-pkgs")) {
      const parsed = parseWingetPkgsUrl(value);
      if (parsed) {
        setPackageId(parsed);
        addToast(`Detected: ${parsed}`, "info");
      }
    }
  };

  const handleSearch = async () => {
    if (!packageId.trim()) return;
    setLoading(true);
    setError(null);
    setFound(null);
    try {
      const existing = await invoke<ExistingManifest>("fetch_existing_manifest", { packageId: packageId.trim() });
      setFound(existing);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = () => {
    if (!found) return;
    reset();
    setIsUpdate(true);
    applyExistingManifest(found);
    setStep("installer");
  };

  if (mode === "update") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Update Existing Package</h2>
          <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
            Enter the Package Identifier or paste a winget-pkgs URL to load existing metadata.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">Package Identifier or URL</label>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary/60 transition-colors" />
              <input type="text" value={packageId}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Publisher.PackageName or winget-pkgs URL"
                className="h-10 w-full rounded-lg border border-border bg-background/50 pl-10 pr-4 text-[13px] placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
            </div>
          </div>

          <button onClick={handleSearch} disabled={!packageId.trim() || loading}
            className={cn("flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all duration-200",
              "bg-primary text-white hover:brightness-110 active:scale-[0.99]", "disabled:cursor-not-allowed disabled:opacity-40")}>
            {loading ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching winget-pkgs...</>) : (<><Search className="h-3.5 w-3.5" />Search</>)}
          </button>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 animate-fade-in">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-destructive shrink-0" />
              <p className="text-[12px] text-destructive/80">{error}</p>
            </div>
          )}

          {found && (
            <div className="space-y-3 rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-4 animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-[13px] font-semibold text-emerald-400">Package found</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Package", value: found.packageIdentifier },
                  { label: "Latest Version", value: found.latestVersion },
                  { label: "Publisher", value: found.publisher },
                  { label: "Name", value: found.packageName },
                  { label: "License", value: found.license },
                  { label: "Locale", value: found.packageLocale },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2 rounded-md bg-background/30 px-3 py-1.5">
                    <span className="text-[11px] text-muted-foreground">{item.label}</span>
                    <span className="ml-auto text-[12px] font-medium text-foreground truncate">{item.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">All metadata will be loaded. You just need to add the new installer URL.</p>
              <button onClick={handleUpdate}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[13px] font-medium text-white transition-all hover:bg-emerald-500 active:scale-[0.99]">
                <RefreshCw className="h-3.5 w-3.5" />Update this package
              </button>
            </div>
          )}
        </div>

        <button onClick={() => setMode("choice")} className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">
          &larr; Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-scale-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-6">
        <Package className="h-7 w-7 text-white" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">UniCreate</h1>
      <p className="mt-2 text-[13px] text-muted-foreground/70 text-center max-w-sm">
        Create and submit WinGet package manifests with ease.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-4 w-full max-w-md">
        <button onClick={handleNew}
          className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 p-6 transition-all hover:border-primary/30 hover:bg-card/80">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold">New Package</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Create from scratch</p>
          </div>
        </button>

        <button onClick={() => setMode("update")}
          className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 p-6 transition-all hover:border-emerald-500/30 hover:bg-card/80">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 transition-colors group-hover:bg-emerald-500/15">
            <RefreshCw className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold">Update Package</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">New version of existing</p>
          </div>
        </button>
      </div>

      {submissions.length > 0 && (
        <div className="mt-10 w-full max-w-md">
          <div className="flex items-center justify-between mb-3">
            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Clock className="h-3 w-3" />Recent Submissions
            </h3>
            <button onClick={clearHistory} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-1.5">
            {submissions.slice(0, 5).map((sub, idx) => (
              <a key={idx} href={sub.prUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 px-3.5 py-2.5 transition-colors hover:bg-card/60 group">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground truncate">{sub.packageId} <span className="text-muted-foreground">v{sub.version}</span></p>
                  <p className="text-[10px] text-muted-foreground">{new Date(sub.date).toLocaleDateString()}</p>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
