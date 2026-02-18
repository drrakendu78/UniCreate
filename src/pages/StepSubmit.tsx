import { useState, useEffect, useRef } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useHistoryStore } from "@/stores/history-store";
import { useToastStore } from "@/stores/toast-store";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import type { DeviceFlowStart, GitHubUser } from "@/lib/types";
import {
  ArrowLeft, Send, Loader2, ExternalLink, CheckCircle2,
  AlertCircle, Github, Package, FileCode, RotateCcw, Lock, Unlock, Copy, Check,
} from "lucide-react";

export function StepSubmit() {
  const { manifest, generatedYaml, setStep, isSubmitting, setIsSubmitting, reset } = useManifestStore();
  const addSubmission = useHistoryStore((s) => s.addSubmission);
  const addToast = useToastStore((s) => s.addToast);

  const [token, setToken] = useState("");
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [rememberToken, setRememberToken] = useState(false);

  // Device flow state
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowStart | null>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollingRef = useRef(false);

  // Load stored token on mount
  useEffect(() => {
    const loadToken = async () => {
      try {
        const stored = await invoke<string | null>("get_github_token");
        if (stored) {
          setToken(stored);
          setRememberToken(true);
          // Verify stored token is still valid
          try {
            const user = await invoke<GitHubUser>("authenticate_github", { token: stored });
            setGithubUser(user.login);
          } catch {
            // Token expired/revoked, clear it
            setToken("");
            await invoke("clear_github_token").catch(() => {});
          }
        }
      } catch {
        // Keyring not available
      }
    };
    loadToken();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { pollingRef.current = false; };
  }, []);

  const handleStartDeviceFlow = async () => {
    setError(null);
    try {
      const flow = await invoke<DeviceFlowStart>("start_device_flow");
      setDeviceFlow(flow);
      setPolling(true);
      pollingRef.current = true;

      // Open GitHub in browser
      await open(flow.verificationUri);

      // Start polling
      pollForToken(flow.deviceCode, flow.interval);
    } catch (e) {
      setError(String(e));
    }
  };

  const pollForToken = async (deviceCode: string, interval: number) => {
    while (pollingRef.current) {
      await new Promise((r) => setTimeout(r, interval * 1000));
      if (!pollingRef.current) break;

      try {
        const accessToken = await invoke<string>("poll_device_flow", { deviceCode });
        // Success!
        pollingRef.current = false;
        setPolling(false);
        setToken(accessToken);
        setDeviceFlow(null);

        // Get user info
        const user = await invoke<GitHubUser>("authenticate_github", { token: accessToken });
        setGithubUser(user.login);

        // Store token if remember is checked
        if (rememberToken) {
          await invoke("store_github_token", { token: accessToken }).catch(() => {});
        }

        addToast(`Connecté en tant que ${user.login}`, "success");
        return;
      } catch (e) {
        const err = String(e);
        if (err === "pending") {
          continue; // Still waiting for user
        } else if (err === "slow_down") {
          interval += 5; // Back off
          continue;
        } else {
          // Real error
          pollingRef.current = false;
          setPolling(false);
          setDeviceFlow(null);
          setError(err);
          return;
        }
      }
    }
  };

  const handleCopyCode = async () => {
    if (!deviceFlow) return;
    await navigator.clipboard.writeText(deviceFlow.userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = async () => {
    setToken("");
    setGithubUser(null);
    await invoke("clear_github_token").catch(() => {});
    addToast("Déconnecté", "info");
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
      addToast("Pull request créée avec succès !", "success");
    } catch (e) {
      setError(String(e));
      addToast("Échec de la création de la pull request", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success screen ──
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
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2"><span>Step 4 of 4</span></div>
        <h2 className="text-xl font-semibold tracking-tight">Submit to WinGet</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
          Authenticate with GitHub and submit your manifest as a pull request to <span className="font-mono text-foreground">microsoft/winget-pkgs</span>.
        </p>
      </div>

      {/* ── Auth Section ── */}
      <section className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#24292e]">
            <Github className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">GitHub Authentication</h3>
            <p className="text-[11px] text-muted-foreground">
              Sign in with your GitHub account
            </p>
          </div>
        </div>

        {!githubUser ? (
          <>
            {/* Device flow in progress — show code */}
            {deviceFlow && polling ? (
              <div className="space-y-4 animate-fade-in">
                <div className="flex flex-col items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-5">
                  <p className="text-[12px] text-muted-foreground">
                    Enter this code on GitHub:
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-bold tracking-[0.3em] text-foreground">
                      {deviceFlow.userCode}
                    </span>
                    <button onClick={handleCopyCode}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
                      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Waiting for authorization...
                  </div>
                </div>
                <button
                  onClick={() => open(deviceFlow.verificationUri)}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border text-[13px] font-medium transition-all hover:bg-accent hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open GitHub again
                </button>
                <button
                  onClick={() => { pollingRef.current = false; setPolling(false); setDeviceFlow(null); }}
                  className="flex h-8 w-full items-center justify-center text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
              </div>
            ) : (
              /* Sign in button */
              <div className="space-y-3">
                <button onClick={handleStartDeviceFlow}
                  className={cn(
                    "flex h-10 w-full items-center justify-center gap-2.5 rounded-lg text-[13px] font-medium transition-all",
                    "bg-[#24292e] text-white hover:bg-[#2f363d]"
                  )}>
                  <Github className="h-4 w-4" />
                  Sign in with GitHub
                </button>
                <div className="flex items-center justify-center">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={rememberToken} onChange={(e) => setRememberToken(e.target.checked)}
                      className="h-3 w-3 rounded border-border accent-primary" />
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {rememberToken ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                      Remember session
                    </span>
                  </label>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between rounded-lg bg-emerald-500/8 border border-emerald-500/15 px-3.5 py-2.5 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[12px] font-medium text-emerald-400">Authenticated as <strong>{githubUser}</strong></span>
            </div>
            <button onClick={handleDisconnect}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Disconnect
            </button>
          </div>
        )}
      </section>

      {/* ── Summary ── */}
      <section className="rounded-xl border border-border bg-card/50 p-5 space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Summary</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: "Package", value: manifest.packageIdentifier, icon: Package },
            { label: "Version", value: manifest.packageVersion, icon: Package },
            { label: "Installers", value: String(manifest.installers.length), icon: Package },
            { label: "Files", value: String(generatedYaml.length), icon: FileCode },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 rounded-lg bg-secondary/30 px-3 py-2">
              <span className="text-[11px] text-muted-foreground">{item.label}</span>
              <span className="ml-auto text-[12px] font-medium text-foreground">{item.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 animate-fade-in">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 text-destructive shrink-0" />
          <p className="text-[12px] text-destructive/80">{error}</p>
        </div>
      )}

      {/* ── Actions ── */}
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