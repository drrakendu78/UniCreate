import { useState, useEffect } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useHistoryStore } from "@/stores/history-store";
import { useToastStore } from "@/stores/toast-store";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Key, Send, Loader2, ExternalLink, CheckCircle2,
  AlertCircle, Github, Shield, Package, FileCode, RotateCcw, Lock, Unlock,
} from "lucide-react";

export function StepSubmit() {
  const { manifest, generatedYaml, setStep, isSubmitting, setIsSubmitting, reset } = useManifestStore();
  const addSubmission = useHistoryStore((s) => s.addSubmission);
  const addToast = useToastStore((s) => s.addToast);
  const [token, setToken] = useState("");
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [rememberToken, setRememberToken] = useState(false);
  const [hasStoredToken, setHasStoredToken] = useState(false);

  // Load stored token on mount
  useEffect(() => {
    const loadToken = async () => {
      try {
        const stored = await invoke<string | null>("get_github_token");
        if (stored) {
          setToken(stored);
          setHasStoredToken(true);
          setRememberToken(true);
        }
      } catch {
        // Keyring not available
      }
    };
    loadToken();
  }, []);

  const handleVerifyToken = async () => {
    if (!token.trim()) return;
    setVerifying(true);
    setError(null);
    try {
      const user = await invoke<{ login: string; avatarUrl: string }>("authenticate_github", { token: token.trim() });
      setGithubUser(user.login);

      // Store or clear token based on checkbox
      if (rememberToken) {
        await invoke("store_github_token", { token: token.trim() }).catch(() => {});
      } else {
        await invoke("clear_github_token").catch(() => {});
      }

      addToast(`Authenticated as ${user.login}`, "success");
    } catch (e) {
      setError(String(e));
      setGithubUser(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const url = await invoke<string>("submit_manifest", {
        token: token.trim(),
        yamlFiles: generatedYaml,
        packageId: manifest.packageIdentifier,
        version: manifest.packageVersion,
      });
      setPrUrl(url);
      addSubmission({
        packageId: manifest.packageIdentifier,
        version: manifest.packageVersion,
        prUrl: url,
        date: new Date().toISOString(),
        user: githubUser || "",
      });
      addToast("Pull request created successfully!", "success");
    } catch (e) {
      setError(String(e));
      addToast("Failed to create pull request", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (prUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-scale-in">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 mb-5">
          <CheckCircle2 className="h-7 w-7 text-emerald-500" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Pull Request Created</h2>
        <p className="mt-2 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{manifest.packageIdentifier}</span> v{manifest.packageVersion} has been submitted.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <a href={prUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-medium text-white transition-all hover:brightness-110">
            <ExternalLink className="h-3.5 w-3.5" />View on GitHub
          </a>
          <button onClick={() => { reset(); setPrUrl(null); setToken(""); setGithubUser(null); }}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <RotateCcw className="h-3.5 w-3.5" />New Manifest
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground/60 mb-2"><span>Step 4 of 4</span></div>
        <h2 className="text-xl font-semibold tracking-tight">Submit to WinGet</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
          Authenticate with GitHub and submit your manifest as a pull request to <span className="font-mono text-foreground/60">microsoft/winget-pkgs</span>.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#24292e]">
            <Github className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">GitHub Authentication</h3>
            <p className="text-[11px] text-muted-foreground/50">
              Requires a PAT with <code className="rounded bg-secondary/80 px-1 py-px text-[10px]">public_repo</code> scope
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[12px] font-medium text-foreground/70">Personal Access Token</label>
          <div className="relative group">
            <Key className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/30 group-focus-within:text-primary/60 transition-colors" />
            <input type="password" value={token}
              onChange={(e) => { setToken(e.target.value); setGithubUser(null); setError(null); }}
              placeholder={hasStoredToken ? "Token loaded from keychain" : "ghp_xxxxxxxxxxxxxxxxxxxx"}
              className="h-9 w-full rounded-lg border border-border bg-background/50 pl-9 pr-4 font-mono text-[12px] placeholder:text-muted-foreground/25 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all" />
          </div>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground/35">
              <Shield className="h-2.5 w-2.5" />
              {rememberToken ? "Token stored in OS keychain" : "Token is never stored"}
            </p>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={rememberToken} onChange={(e) => setRememberToken(e.target.checked)}
                className="h-3 w-3 rounded border-border accent-primary" />
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
                {rememberToken ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                Remember
              </span>
            </label>
          </div>
        </div>

        {!githubUser ? (
          <button onClick={handleVerifyToken} disabled={!token.trim() || verifying}
            className={cn("flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-medium transition-all",
              "border border-border hover:bg-accent hover:text-foreground", "disabled:cursor-not-allowed disabled:opacity-40")}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verify Token"}
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/8 border border-emerald-500/15 px-3.5 py-2.5 animate-fade-in">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-[12px] font-medium text-emerald-400">Authenticated as <strong>{githubUser}</strong></span>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">Summary</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: "Package", value: manifest.packageIdentifier, icon: Package },
            { label: "Version", value: manifest.packageVersion, icon: Package },
            { label: "Installers", value: String(manifest.installers.length), icon: Package },
            { label: "Files", value: String(generatedYaml.length), icon: FileCode },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2">
              <span className="text-[11px] text-muted-foreground/50">{item.label}</span>
              <span className="ml-auto text-[12px] font-medium text-foreground/80">{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 animate-fade-in">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-destructive shrink-0" />
          <p className="text-[12px] text-destructive/80">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <button onClick={() => setStep("review")}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />Back
        </button>
        <button onClick={handleSubmit} disabled={!githubUser || isSubmitting} data-action="primary"
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-medium transition-all duration-200",
            "bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.98]", "disabled:cursor-not-allowed disabled:opacity-40")}>
          {isSubmitting ? (<><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating PR...</>) : (<><Send className="h-3.5 w-3.5" />Submit Pull Request</>)}
        </button>
      </div>
    </div>
  );
}
