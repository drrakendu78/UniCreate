import { useEffect, useState } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useToastStore } from "@/stores/toast-store";
import { useAuthSessionStore } from "@/stores/auth-session-store";
import { useHistoryStore } from "@/stores/history-store";
import { StepperHeader } from "@/components/StepperHeader";
import { Home } from "@/pages/Home";
import { StepInstaller } from "@/pages/StepInstaller";
import { StepMetadata } from "@/pages/StepMetadata";
import { StepReview } from "@/pages/StepReview";
import StepSubmit from "@/pages/StepSubmit";
import { Settings } from "@/pages/Settings";
import type { AppUpdateInfo } from "@/lib/types";
import { CheckCircle2, AlertCircle, Info, X, Minus, Square, Copy, Download, X as XIcon, Settings as SettingsIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ProfileButton } from "@/components/ProfileButton";
import { useSettingsStore } from "@/stores/settings-store";
import { useT } from "@/lib/i18n";
import logoMarkUrl from "@/assets/logo-mark.png";

const appWindow = getCurrentWindow();
const DISMISSED_UPDATE_VERSION_KEY = "unicreate-dismissed-update-version";
const PENDING_UPDATE_KEY = "unicreate-pending-update";

function Toasts() {
  const { toasts, removeToast } = useToastStore();
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 shadow-lg animate-slide-in"
        >
          {toast.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
          {toast.type === "error" && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
          {toast.type === "info" && <Info className="h-4 w-4 text-primary shrink-0" />}
          <span className="text-[12px] text-foreground/80 flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="text-muted-foreground/30 hover:text-foreground transition-colors shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function TitleBar() {
  const t = useT();
  const currentStep = useManifestStore((s) => s.currentStep);
  const isHome = currentStep === "home" || currentStep === "settings";
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
  }, []);

  const handleMinimize = () => appWindow.minimize();
  const handleToggleMaximize = async () => {
    await appWindow.toggleMaximize();
    setMaximized(await appWindow.isMaximized());
  };
  const handleClose = () => appWindow.close();

  return (
    <header
      className="flex h-10 shrink-0 items-center border-b border-border/60 select-none"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        appWindow.startDragging();
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
        handleToggleMaximize();
      }}
    >
      {/* Left: Logo + App name */}
      <div className="flex items-center gap-2 pl-3.5 pr-4">
        <img src={logoMarkUrl} alt="UniCreate" className="h-5 w-5 object-contain" />
        <span className="text-[12px] font-semibold tracking-tight text-foreground/80">UniCreate</span>
        <span className="text-[10px] text-muted-foreground/50 font-medium">v{__APP_VERSION__}</span>
      </div>

      {/* Center: Stepper (when not home) */}
      <div className="flex-1 flex items-center justify-center">
        {!isHome && <StepperHeader />}
      </div>

      {/* Settings + Profile */}
      <button
        onClick={() => useManifestStore.getState().setStep(
          useManifestStore.getState().currentStep === "settings" ? "home" : "settings"
        )}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground mr-1"
        data-no-drag
        title="Settings"
      >
        <SettingsIcon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium">{t("settings.label")}</span>
      </button>
      <ProfileButton />

      {/* Right: Window controls */}
      <div className="flex items-center" data-no-drag>
        <button
          onClick={handleMinimize}
          className="flex h-10 w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="flex h-10 w-11 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {maximized ? <Copy className="h-3 w-3" /> : <Square className="h-3 w-3" />}
        </button>
        <button
          onClick={handleClose}
          className="flex h-10 w-11 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}

function AppUpdatePopup({
  info,
  onLater,
  onPrimaryAction,
  isApplying,
}: {
  info: AppUpdateInfo;
  onLater: () => void;
  onPrimaryAction: () => void;
  isApplying: boolean;
}) {
  const t = useT();
  const publishedLabel = info.publishedAt
    ? new Date(info.publishedAt).toLocaleDateString()
    : null;
  const notes = info.releaseNotes?.trim();

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-40 w-[min(30rem,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-xl border border-primary/20 bg-card/95 p-4 shadow-2xl backdrop-blur animate-slide-in">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">{t("update.available")}</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {t("update.isAvailable", { v: info.latestVersion })}
              {publishedLabel ? ` (${publishedLabel})` : ""}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground/90">
              {t("update.currentVersion", { v: info.currentVersion })}
            </p>
            {info.downloadName && (
              <p className="mt-1 text-[11px] text-muted-foreground/90">
                {t("update.installer", { n: info.downloadName })}
              </p>
            )}
          </div>
          <button
            onClick={onLater}
            disabled={isApplying}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close update popup"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {notes && (
          <div className="mt-3 max-h-28 overflow-y-auto rounded-lg border border-border/70 bg-secondary/20 p-2.5 text-[11px] text-foreground/80 whitespace-pre-wrap">
            {notes}
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={onLater}
            disabled={isApplying}
            className="h-8 rounded-md border border-border px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t("update.later")}
          </button>
          <button
            onClick={onPrimaryAction}
            disabled={isApplying}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {isApplying ? t("update.updating") : t("update.update")}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const currentStep = useManifestStore((s) => s.currentStep);
  const isHome = currentStep === "home" || currentStep === "settings";
  const addToast = useToastStore((s) => s.addToast);
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);

  // Apply enterprise policy config on startup
  useEffect(() => {
    invoke<string | null>("read_policy_config").then((json) => {
      if (!json) return;
      try {
        const policy = JSON.parse(json) as Record<string, unknown>;
        const s = useSettingsStore.getState();
        if (policy.neverSaveSession === true) s.setNeverSaveSession(true);
        if (typeof policy.ephemeralTimeoutMinutes === "number" && [5, 10, 15, 30].includes(policy.ephemeralTimeoutMinutes)) {
          s.setEphemeralTimeoutMinutes(policy.ephemeralTimeoutMinutes as 5 | 10 | 15 | 30);
        }
        if (typeof policy.proxyUrl === "string") s.setProxyUrl(policy.proxyUrl);
        if (policy.autoCheckUpdates === false) s.setAutoCheckUpdates(false);
        if (typeof policy.language === "string" && ["en", "fr"].includes(policy.language)) {
          s.setLanguage(policy.language as "en" | "fr");
        }
      } catch { /* invalid policy JSON, ignore */ }
    }).catch(() => {});
  }, []);

  // Sync history store active user with auth session
  const savedSessionUser = useAuthSessionStore((s) => s.savedSessionUser);
  const setActiveUser = useHistoryStore((s) => s.setActiveUser);
  useEffect(() => {
    setActiveUser(savedSessionUser);
  }, [savedSessionUser, setActiveUser]);

  // Ctrl+Enter keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        const btn = document.querySelector("[data-action='primary']") as HTMLButtonElement;
        if (btn && !btn.disabled) {
          e.preventDefault();
          btn.click();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync proxy setting to backend on app start
  const proxyUrl = useSettingsStore((s) => s.proxyUrl);
  useEffect(() => {
    invoke("set_proxy", { url: proxyUrl }).catch(() => {});
  }, [proxyUrl]);

  // Auto-lock session when window regains visibility (covers Win+L, sleep, etc.)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const state = useAuthSessionStore.getState();
      if (!state.activeSessionToken || state.hasSavedSession) return;
      if (state.isEphemeralSessionExpired()) {
        state.clearSession();
        addToast("Session locked for security. Please sign in again.", "info");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [addToast]);

  const autoCheckUpdates = useSettingsStore((s) => s.autoCheckUpdates);

  useEffect(() => {
    if (!autoCheckUpdates) return;
    let cancelled = false;

    const checkUpdate = async () => {
      try {
        const info = await invoke<AppUpdateInfo>("check_app_update");
        if (cancelled || !info.hasUpdate) return;
        const dismissedVersion = localStorage.getItem(DISMISSED_UPDATE_VERSION_KEY);
        if (dismissedVersion === info.latestVersion) return;
        setAppUpdateInfo(info);
      } catch {
        // Ignore update check failures to keep startup resilient.
      }
    };

    void checkUpdate();
    return () => {
      cancelled = true;
    };
  }, [autoCheckUpdates]);

  // Resume a pending update after the user restarted the app as admin.
  // PENDING_UPDATE_KEY is set just before calling restart_as_admin in openUpdateAction.
  // Once we're back with elevated privileges, we kick off start_silent_update directly.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let pending: { downloadUrl: string; downloadName?: string; latestVersion?: string } | null = null;
      try {
        const raw = localStorage.getItem(PENDING_UPDATE_KEY);
        if (raw) pending = JSON.parse(raw);
      } catch { pending = null; }
      if (!pending?.downloadUrl) return;

      const isAdmin = await invoke<boolean>("is_running_as_admin").catch(() => false);
      if (cancelled) return;

      // Always clear the flag once: avoids an infinite restart loop if anything fails.
      try { localStorage.removeItem(PENDING_UPDATE_KEY); } catch {}

      if (!isAdmin) return; // elevation refused or failed: give up silently

      try {
        await invoke("start_silent_update", {
          downloadUrl: pending.downloadUrl,
          fileName: pending.downloadName,
        });
        if (pending.latestVersion) {
          localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, pending.latestVersion);
        }
        await appWindow.close().catch(() => {});
      } catch (e) {
        addToast(`Update failed: ${String(e)}`, "error");
      }
    })();
    return () => { cancelled = true; };
  }, [addToast]);

  const dismissUpdatePopup = () => {
    if (appUpdateInfo) {
      localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, appUpdateInfo.latestVersion);
    }
    setAppUpdateInfo(null);
  };

  const openUpdateAction = async () => {
    if (!appUpdateInfo) return;
    if (!appUpdateInfo.downloadUrl) {
      addToast("No installer available in this release.", "error");
      return;
    }

    setIsApplyingUpdate(true);

    // Windows installer-detection heuristic forces UAC elevation for any .exe whose
    // name contains "updater" / "setup". Launching the updater from a non-admin
    // process fails with ERROR_ELEVATION_REQUIRED (740). To avoid this, we restart
    // the app as admin first, persist the update info, and resume the install on
    // next boot (see the useEffect that reads PENDING_UPDATE_KEY).
    const isAdmin = await invoke<boolean>("is_running_as_admin").catch(() => true);
    if (!isAdmin) {
      try {
        localStorage.setItem(PENDING_UPDATE_KEY, JSON.stringify({
          downloadUrl: appUpdateInfo.downloadUrl,
          downloadName: appUpdateInfo.downloadName,
          latestVersion: appUpdateInfo.latestVersion,
        }));
      } catch {}
      addToast("Restarting as administrator to install the update...", "info");
      try {
        await invoke("restart_as_admin");
        // App closes after this call.
      } catch (e) {
        try { localStorage.removeItem(PENDING_UPDATE_KEY); } catch {}
        setIsApplyingUpdate(false);
        addToast(`Failed to restart as administrator: ${String(e)}`, "error");
      }
      return;
    }

    try {
      await invoke("start_silent_update", {
        downloadUrl: appUpdateInfo.downloadUrl,
        fileName: appUpdateInfo.downloadName,
      });
    } catch (e) {
      setIsApplyingUpdate(false);
      addToast(`Update failed: ${String(e)}`, "error");
      return;
    }

    localStorage.setItem(DISMISSED_UPDATE_VERSION_KEY, appUpdateInfo.latestVersion);
    setAppUpdateInfo(null);
    await appWindow.close().catch(() => {});
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background rounded-lg">
      <TitleBar />

      <main className="flex-1 overflow-y-auto">
        <div
          className={`mx-auto max-w-2xl px-6 animate-fade-in ${isHome ? "pt-1 pb-4" : "py-10"}`}
          key={currentStep}
        >
          {currentStep === "home" && <Home />}
          {currentStep === "settings" && <Settings />}
          {currentStep === "installer" && <StepInstaller />}
          {currentStep === "metadata" && <StepMetadata />}
          {currentStep === "review" && <StepReview />}
          {currentStep === "submit" && <StepSubmit />}
        </div>
      </main>

      {appUpdateInfo && (
        <AppUpdatePopup
          info={appUpdateInfo}
          onLater={dismissUpdatePopup}
          onPrimaryAction={openUpdateAction}
          isApplying={isApplyingUpdate}
        />
      )}

      <Toasts />
    </div>
  );
}

export default App;
