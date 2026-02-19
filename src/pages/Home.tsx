import { useEffect, useRef, useState } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useHistoryStore } from "@/stores/history-store";
import { useToastStore } from "@/stores/toast-store";
import { useAuthSessionStore } from "@/stores/auth-session-store";
import type { DeviceFlowStart, ExistingManifest, GitHubUser, PrLiveStatus, RecoveredPr, SubmissionEntry } from "@/lib/types";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import {
  Plus, RefreshCw, Loader2, Search, CheckCircle2,
  AlertCircle, ExternalLink, Clock, Trash2, Github, Copy, Check, X, Lock, Unlock, LogOut,
} from "lucide-react";
import logoTextDarkUrl from "@/assets/logo-text.png";
import logoTextLightUrl from "@/assets/logo-text-light.png";

function parseWingetPkgsUrl(url: string): string | null {
  const match = url.match(/winget-pkgs\/(?:tree|blob)\/\w+\/manifests\/\w\/([^/]+)\/([^/]+)/);
  if (match) return `${match[1]}.${match[2]}`;
  return null;
}

export function Home() {
  const { manifest, isUpdate, setStep, setIsUpdate, applyExistingManifest, reset } = useManifestStore();
  const { submissions, clearHistory, mergeRecoveredSubmissions } = useHistoryStore();
  const {
    activeSessionToken,
    savedSessionUser,
    hasSavedSession,
    touchEphemeralSession,
    isEphemeralSessionExpired,
    setSession,
    clearSession,
  } = useAuthSessionStore();
  const addToast = useToastStore((s) => s.addToast);
  const [mode, setMode] = useState<"choice" | "update">("choice");
  const [packageId, setPackageId] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [showRecoverAuthModal, setShowRecoverAuthModal] = useState(false);
  const [recoverDeviceFlow, setRecoverDeviceFlow] = useState<DeviceFlowStart | null>(null);
  const [recoverAuthPolling, setRecoverAuthPolling] = useState(false);
  const [rememberRecoverSession, setRememberRecoverSession] = useState(false);
  const [recoverCodeCopied, setRecoverCodeCopied] = useState(false);
  const [recoverAuthError, setRecoverAuthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<ExistingManifest | null>(null);
  const [prStatuses, setPrStatuses] = useState<Record<string, PrLiveStatus>>({});
  const [isStatusRefreshing, setIsStatusRefreshing] = useState(false);
  const recoverPollingRef = useRef(false);
  const statusRefreshRef = useRef(false);

  useEffect(() => {
    return () => {
      recoverPollingRef.current = false;
      statusRefreshRef.current = false;
    };
  }, []);

  useEffect(() => {
    let handled = false;
    const timer = setInterval(() => {
      const state = useAuthSessionStore.getState();
      if (!state.activeSessionToken || state.hasSavedSession) return;
      if (!state.isEphemeralSessionExpired()) return;
      if (handled) return;
      handled = true;
      state.clearSession();
      addToast("Session locked for security. Please sign in again.", "info");
    }, 5000);

    return () => clearInterval(timer);
  }, [addToast]);

  useEffect(() => {
    let mounted = true;
    const loadSavedSession = async () => {
      try {
        const token = await invoke<string | null>("get_github_token");
        if (!mounted) return;
        if (!token) {
          const current = useAuthSessionStore.getState();
          if (current.activeSessionToken) {
            setSession(current.activeSessionToken, current.savedSessionUser, false);
            return;
          }
          clearSession();
          return;
        }
        // If a token exists in keychain, treat it as a saved session.
        // Do not clear it on transient network/API errors when returning to Home.
        setSession(token, null, true);

        // Best-effort user display only.
        const user = await invoke<GitHubUser>("authenticate_github", { token }).catch(() => null);
        if (!mounted) return;
        if (user) {
          setSession(token, user.login, true);
        }
      } catch {
        if (!mounted) return;
        const current = useAuthSessionStore.getState();
        if (!current.activeSessionToken) {
          clearSession();
        }
      }
    };

    void loadSavedSession();
    return () => {
      mounted = false;
    };
  }, [setSession, clearSession]);

  const refreshPrStatuses = async () => {
    // Requested behavior: live PR status is available only when the user is connected.
    if (!activeSessionToken) {
      setPrStatuses({});
      return;
    }

    const visible = submissions.slice(0, 5);
    if (!visible.length) {
      setPrStatuses({});
      return;
    }
    if (statusRefreshRef.current) return;

    statusRefreshRef.current = true;
    setIsStatusRefreshing(true);
    try {
      const statuses = await invoke<PrLiveStatus[]>("fetch_pr_statuses", {
        prUrls: visible.map((entry) => entry.prUrl),
        token: activeSessionToken,
      });
      const next: Record<string, PrLiveStatus> = {};
      for (const status of statuses) {
        next[status.prUrl] = status;
      }
      setPrStatuses(next);
    } catch {
      // keep the list usable even if live status refresh fails
    } finally {
      statusRefreshRef.current = false;
      setIsStatusRefreshing(false);
    }
  };

  useEffect(() => {
    if (!activeSessionToken) {
      setPrStatuses({});
      return;
    }
    if (!submissions.length) {
      setPrStatuses({});
      return;
    }

    void refreshPrStatuses();
    const timer = setInterval(() => {
      void refreshPrStatuses();
    }, 30000);

    return () => clearInterval(timer);
  }, [activeSessionToken, submissions]);

  const getPrStatusUi = (status: PrLiveStatus | undefined) => {
    if (!status) {
      return {
        label: "Checking...",
        className: "rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground",
      };
    }
    if (status.status === "merged") {
      return {
        label: "Merged",
        className: "rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-500",
      };
    }
    if (status.status === "open") {
      return {
        label: "Open",
        className: "rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary",
      };
    }
    if (status.status === "closed") {
      return {
        label: "Closed",
        className: "rounded-full border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive",
      };
    }
    return {
      label: "Unknown",
      className: "rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground",
    };
  };

  const getPrMergeableUi = (status: PrLiveStatus | undefined) => {
    if (!status || status.status !== "open") return null;
    const state = (status.mergeableState || "").toLowerCase();

    if (!state || state === "unknown") {
      return {
        label: "Syncing",
        title: "GitHub is still computing mergeability",
        className: "rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground",
      };
    }

    if (state === "clean") {
      return {
        label: "Ready",
        title: "Mergeable state: clean",
        className: "rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-500",
      };
    }
    if (state === "blocked") {
      return {
        label: "Pending review",
        title: "Mergeable state: blocked",
        className: "rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-400",
      };
    }
    if (state === "behind") {
      return {
        label: "Behind",
        title: "Mergeable state: behind",
        className: "rounded-full border border-yellow-500/25 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-400",
      };
    }
    if (state === "draft") {
      return {
        label: "Draft",
        title: "Mergeable state: draft",
        className: "rounded-full border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-violet-400",
      };
    }
    if (state === "dirty") {
      return {
        label: "Conflicts",
        title: "Mergeable state: dirty",
        className: "rounded-full border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-400",
      };
    }
    if (state === "unstable") {
      return {
        label: "Checks failing",
        title: "Mergeable state: unstable",
        className: "rounded-full border border-orange-500/25 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-orange-400",
      };
    }

    return {
      label: state,
      title: `Mergeable state: ${state}`,
      className: "rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground",
    };
  };

  const handleNew = () => {
    const hasDraft =
      manifest.installers.length > 0 ||
      !!manifest.packageIdentifier.trim() ||
      !!manifest.packageVersion.trim() ||
      !!manifest.locale.packageName.trim();

    if (isUpdate) {
      // Leaving update mode always starts a fresh "new package" draft.
      reset();
    } else if (hasDraft) {
      addToast("Resumed existing draft.", "info");
    }
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

  const parseRecoveredPr = (pr: RecoveredPr): SubmissionEntry => {
    const match = pr.title.match(/^New version:\s+(.+?)\s+version\s+(.+)$/i);
    return {
      packageId: match?.[1]?.trim() || pr.title,
      version: match?.[2]?.trim() || "-",
      prUrl: pr.pr_url,
      date: pr.created_at,
      user: pr.user_login,
    };
  };

  const recoverPrsWithToken = async (token: string) => {
    setIsRecovering(true);
    try {
      const recovered = await invoke<RecoveredPr[]>("fetch_unicreate_recent_prs", { token, limit: 10 });
      const parsed = recovered.map(parseRecoveredPr);
      mergeRecoveredSubmissions(parsed, 10);
      if (!hasSavedSession) {
        touchEphemeralSession();
      }

      if (!recovered.length) {
        addToast("No UniCreate PRs found.", "info");
        return;
      }
      addToast(`${recovered.length} PR(s) recovered.`, "success");
    } catch (e) {
      const message = String(e);
      if (/(invalid token|http 401|401)/i.test(message)) {
        await invoke("clear_github_token").catch(() => {});
        clearSession();
        addToast("Session expired. Please sign in again.", "info");
        setShowRecoverAuthModal(true);
      } else {
        addToast(`Failed to recover PRs: ${message}`, "error");
      }
    } finally {
      setIsRecovering(false);
    }
  };

  const closeRecoverAuthModal = () => {
    recoverPollingRef.current = false;
    setRecoverAuthPolling(false);
    setRecoverDeviceFlow(null);
    setRecoverAuthError(null);
    setShowRecoverAuthModal(false);
  };

  const pollRecoverDeviceFlow = async (deviceCode: string, interval: number) => {
    while (recoverPollingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      if (!recoverPollingRef.current) break;

      try {
        const accessToken = await invoke<string>("poll_device_flow", { deviceCode });
        recoverPollingRef.current = false;
        setRecoverAuthPolling(false);
        setRecoverDeviceFlow(null);
        setRecoverAuthError(null);
        setShowRecoverAuthModal(false);
        const user = await invoke<GitHubUser>("authenticate_github", { token: accessToken }).catch(() => null);
        setSession(accessToken, user?.login ?? null, false);

        if (rememberRecoverSession) {
          const stored = await invoke("store_github_token", { token: accessToken })
            .then(() => true)
            .catch(() => false);
          setSession(accessToken, user?.login ?? null, stored);
          if (!stored) {
            addToast("Connected for this session only (could not persist token).", "info");
          }
        }

        addToast("Authenticated. Recovering PRs...", "success");
        await recoverPrsWithToken(accessToken);
        return;
      } catch (e) {
        const err = String(e);
        if (err === "pending") {
          continue;
        }
        if (err === "slow_down") {
          interval += 5;
          continue;
        }
        recoverPollingRef.current = false;
        setRecoverAuthPolling(false);
        setRecoverDeviceFlow(null);
        setRecoverAuthError(err);
        return;
      }
    }
  };

  const handleStartRecoverAuth = async () => {
    setRecoverAuthError(null);
    try {
      const flow = await invoke<DeviceFlowStart>("start_device_flow");
      setRecoverDeviceFlow(flow);
      setRecoverAuthPolling(true);
      recoverPollingRef.current = true;
      await open(flow.verificationUri);
      void pollRecoverDeviceFlow(flow.deviceCode, flow.interval);
    } catch (e) {
      setRecoverAuthError(String(e));
    }
  };

  const handleCopyRecoverCode = async () => {
    if (!recoverDeviceFlow) return;
    await navigator.clipboard.writeText(recoverDeviceFlow.userCode);
    setRecoverCodeCopied(true);
    setTimeout(() => setRecoverCodeCopied(false), 2000);
  };

  const handleRecoverPrs = async () => {
    try {
      if (activeSessionToken) {
        if (!hasSavedSession && isEphemeralSessionExpired()) {
          clearSession();
          addToast("Session locked for security. Please sign in again.", "info");
          setShowRecoverAuthModal(true);
          return;
        }
        await recoverPrsWithToken(activeSessionToken);
        return;
      }

      const token = await invoke<string | null>("get_github_token");
      if (!token) {
        setShowRecoverAuthModal(true);
        return;
      }
      setSession(token, savedSessionUser, true);
      await recoverPrsWithToken(token);
    } catch (e) {
      addToast(`Failed to recover PRs: ${String(e)}`, "error");
    }
  };

  const handleDisconnectSavedSession = async () => {
    try {
      await invoke("clear_github_token").catch(() => {});
      clearSession();
      addToast("Session disconnected.", "info");
    } catch {
      clearSession();
      addToast("Session disconnected.", "info");
    }
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
    <>
      <div className="flex flex-col items-center pt-1 pb-4 animate-scale-in">
      <img
        src={logoTextLightUrl}
        alt="UniCreate"
        className="mb-4 h-auto w-[170px] max-w-[72vw] object-contain dark:hidden sm:w-[220px] md:w-[260px]"
      />
      <img
        src={logoTextDarkUrl}
        alt="UniCreate"
        className="mb-4 hidden h-auto w-[170px] max-w-[72vw] object-contain dark:block sm:w-[220px] md:w-[260px]"
      />
      <p className="text-[13px] text-muted-foreground/70 text-center max-w-sm">
        Create and submit WinGet package manifests with ease.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 w-full max-w-md">
        <button onClick={handleNew}
          className="group flex flex-col items-center gap-2.5 rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-primary/30 hover:bg-card/80">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
            <Plus className="h-5 w-5 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold">New Package</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Create from scratch</p>
          </div>
        </button>

        <button onClick={() => setMode("update")}
          className="group flex flex-col items-center gap-2.5 rounded-xl border border-border bg-card/50 p-4 transition-all hover:border-emerald-500/30 hover:bg-card/80">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 transition-colors group-hover:bg-emerald-500/15">
            <RefreshCw className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="text-center">
            <p className="text-[13px] font-semibold">Update Package</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">New version of existing</p>
          </div>
        </button>
      </div>

      <div className="mt-6 w-full max-w-md">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <Clock className="h-3 w-3" />Recent Submissions
          </h3>
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            {activeSessionToken && savedSessionUser && (
              <span className="max-w-[150px] truncate whitespace-nowrap text-[10px] text-emerald-400/90" title={`@${savedSessionUser}`}>
                @{savedSessionUser}
              </span>
            )}
            {activeSessionToken && (
              <span
                title={isStatusRefreshing ? "Refreshing PR status" : "PR status live"}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground/80"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isStatusRefreshing ? "bg-primary animate-pulse" : "bg-emerald-500"
                  )}
                />
                <span>{isStatusRefreshing ? "Sync" : "Live"}</span>
              </span>
            )}
            <button
              onClick={handleRecoverPrs}
              disabled={isRecovering}
              className="flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", isRecovering && "animate-spin")} />
              {isRecovering ? "Recovering..." : "Recover PRs"}
            </button>
            <button
              onClick={handleDisconnectSavedSession}
              disabled={!activeSessionToken}
              className="flex items-center gap-1 whitespace-nowrap rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LogOut className="h-3 w-3" />
              Disconnect
            </button>
            <button
              onClick={clearHistory}
              disabled={!submissions.length}
              className="text-[10px] text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {submissions.length ? (
          <div className="space-y-1.5">
            {submissions.slice(0, 5).map((sub, idx) => (
              <a
                key={idx}
                href={sub.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/30 px-3.5 py-2.5 transition-colors hover:bg-card/60 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-foreground truncate">
                    {sub.packageId} <span className="text-muted-foreground">v{sub.version}</span>
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="text-[10px] text-muted-foreground">{new Date(sub.date).toLocaleDateString()}</p>
                    {activeSessionToken && (() => {
                      const prStatus = prStatuses[sub.prUrl];
                      const badge = getPrStatusUi(prStatus);
                      const mergeableBadge = getPrMergeableUi(prStatus);
                      return (
                        <>
                          <span className={badge.className}>{badge.label}</span>
                          {mergeableBadge && (
                            <span
                              title={mergeableBadge.title}
                              className={mergeableBadge.className}
                            >
                              {mergeableBadge.label}
                            </span>
                          )}
                          {prStatus?.hasIssues && prStatus.status !== "merged" && (
                            <span
                              title={prStatus.mergeableState || undefined}
                              className="rounded-full border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-400"
                            >
                              Needs action
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </a>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border/50 bg-card/20 px-3.5 py-2.5">
            <p className="text-[11px] text-muted-foreground">
              No recent submissions yet. Click <span className="font-medium text-foreground/80">Recover PRs</span> to reload from GitHub.
            </p>
          </div>
        )}
      </div>
      </div>

      {showRecoverAuthModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#24292e]">
                  <Github className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold">Sign in to recover PRs</h3>
                  <p className="text-[11px] text-muted-foreground">Use GitHub Device Flow</p>
                </div>
              </div>
              <button
                onClick={closeRecoverAuthModal}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {recoverDeviceFlow && recoverAuthPolling ? (
              <div className="space-y-3 animate-fade-in">
                <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="text-[12px] text-muted-foreground">Enter this code on GitHub:</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-lg font-bold tracking-[0.2em] text-foreground">
                      {recoverDeviceFlow.userCode}
                    </span>
                    <button
                      onClick={handleCopyRecoverCode}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {recoverCodeCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Waiting for authorization...
                  </div>
                </div>

                <button
                  onClick={() => open(recoverDeviceFlow.verificationUri)}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border text-[13px] font-medium transition-all hover:bg-accent hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open GitHub again
                </button>
                <button
                  onClick={closeRecoverAuthModal}
                  className="flex h-8 w-full items-center justify-center text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleStartRecoverAuth}
                  className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg bg-[#24292e] text-[13px] font-medium text-white transition-all hover:bg-[#2f363d]"
                >
                  <Github className="h-4 w-4" />
                  Sign in with GitHub
                </button>
                <div className="flex items-center justify-center">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={rememberRecoverSession}
                      onChange={(e) => setRememberRecoverSession(e.target.checked)}
                      className="h-3 w-3 rounded border-border accent-primary"
                    />
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      {rememberRecoverSession ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                      Remember session
                    </span>
                  </label>
                </div>
              </div>
            )}

            {recoverAuthError && (
              <p className="mt-3 text-[12px] text-destructive">{recoverAuthError}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
