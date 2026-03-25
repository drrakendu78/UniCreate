import { useState, useEffect } from "react";
import { useManifestStore } from "@/stores/manifest-store";
import { useAuthSessionStore } from "@/stores/auth-session-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { EphemeralTimeout } from "@/stores/settings-store";
import { useToastStore } from "@/stores/toast-store";
import { useT } from "@/lib/i18n";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Globe, History, Shield, Trash2, KeyRound,
  LogOut, ChevronRight, Download, Bell, Lock, Wifi,
  FileText,
} from "lucide-react";

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        {icon}
        {title}
      </div>
      <div className="rounded-xl border border-border bg-card/50 divide-y divide-border/50">
        {children}
      </div>
    </div>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-foreground">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border"
      )}
    >
      <span className={cn(
        "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
        checked && "translate-x-4"
      )} />
    </button>
  );
}

export function Settings() {
  const setStep = useManifestStore((s) => s.setStep);
  const {
    activeSessionToken, savedSessionUser, savedSessionAvatar,
    hasSavedSession, clearSession,
  } = useAuthSessionStore();
  const { submissions, recentPackageIds, clearHistory } = useHistoryStore();
  const {
    language, defaultLocale, maxRecentSubmissions, autoCheckUpdates, neverSaveSession,
    ephemeralTimeoutMinutes, proxyUrl,
    setLanguage, setDefaultLocale, setMaxRecentSubmissions, setAutoCheckUpdates, setNeverSaveSession,
    setEphemeralTimeoutMinutes, setProxyUrl,
  } = useSettingsStore();
  const addToast = useToastStore((s) => s.addToast);
  const t = useT();

  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [proxyInput, setProxyInput] = useState(proxyUrl);

  // Sync proxyInput when proxyUrl changes externally (e.g. policy config)
  useEffect(() => {
    setProxyInput(proxyUrl);
  }, [proxyUrl]);

  const isConnected = !!activeSessionToken && !!savedSessionUser;

  const handleDisconnect = async () => {
    await invoke("clear_github_token").catch(() => {});
    clearSession();
    setConfirmDisconnect(false);
    addToast(t("settings.disconnect"), "info");
  };

  const handleClearHistory = () => {
    clearHistory();
    setConfirmClearHistory(false);
    addToast(t("settings.clear"), "info");
  };

  const handleOpenAuditLog = async () => {
    try {
      await invoke("open_audit_log_folder");
    } catch {
      addToast("Cannot open audit log.", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => setStep("home")}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground -ml-2 mb-3"
        >
          <ArrowLeft className="h-3 w-3" />{t("settings.back")}
        </button>
        <h2 className="text-xl font-semibold tracking-tight">{t("settings.title")}</h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">
          {t("settings.desc")}
        </p>
      </div>

      {/* Account */}
      <Section title={t("settings.account")} icon={<Shield className="h-3.5 w-3.5 text-primary/70" />}>
        {isConnected ? (
          <>
            <Row label={t("settings.connectedAs")} description={hasSavedSession ? t("settings.savedSession") : t("settings.ephemeralSession", { n: ephemeralTimeoutMinutes })}>
              <div className="flex items-center gap-2">
                {savedSessionAvatar ? (
                  <img src={savedSessionAvatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                    {savedSessionUser?.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-[12px] font-medium text-foreground">@{savedSessionUser}</span>
              </div>
            </Row>
            <Row label={t("settings.disconnect")} description={t("settings.disconnectDesc")}>
              {confirmDisconnect ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => setConfirmDisconnect(false)} className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent">{t("common.cancel")}</button>
                  <button onClick={handleDisconnect} className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20">{t("settings.confirm")}</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDisconnect(true)} className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive">
                  <LogOut className="h-3 w-3" />{t("settings.disconnect")}
                </button>
              )}
            </Row>
          </>
        ) : (
          <Row label={t("settings.notConnected")} description={t("settings.notConnectedDesc")}>
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground/50" />
          </Row>
        )}
        <Row label={t("settings.tokenScope")} description={t("settings.tokenScopeDesc")}>
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-500">public_repo</span>
        </Row>
      </Section>

      {/* Security */}
      <Section title={t("settings.security")} icon={<Lock className="h-3.5 w-3.5 text-primary/70" />}>
        <Row label={t("settings.neverSave")} description={t("settings.neverSaveDesc")}>
          <Toggle checked={neverSaveSession} onChange={async (val) => {
            setNeverSaveSession(val);
            if (val && hasSavedSession) {
              await invoke("clear_github_token").catch(() => {});
              clearSession();
              addToast(t("settings.disconnect"), "info");
            }
          }} />
        </Row>
        <Row label={t("settings.ephemeralTimeout")} description={t("settings.ephemeralTimeoutDesc")}>
          <select
            value={ephemeralTimeoutMinutes}
            onChange={(e) => setEphemeralTimeoutMinutes(Number(e.target.value) as EphemeralTimeout)}
            className="h-7 rounded-md border border-border bg-background/50 px-2 text-[11px] font-medium focus:border-primary/50 focus:outline-none"
          >
            {([5, 10, 15, 30] as const).map((n) => (
              <option key={n} value={n}>{t("settings.ephemeralMinutes", { n })}</option>
            ))}
          </select>
        </Row>
        <Row label={t("settings.auditLog")} description={t("settings.auditLogDesc")}>
          <button
            onClick={handleOpenAuditLog}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <FileText className="h-3 w-3" />{t("settings.openAuditLog")}
          </button>
        </Row>
      </Section>

      {/* Network */}
      <Section title={t("settings.network")} icon={<Wifi className="h-3.5 w-3.5 text-primary/70" />}>
        <Row label={t("settings.proxy")} description={t("settings.proxyDesc")}>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={proxyInput}
              onChange={(e) => setProxyInput(e.target.value)}
              onBlur={() => setProxyUrl(proxyInput)}
              onKeyDown={(e) => { if (e.key === "Enter") setProxyUrl(proxyInput); }}
              placeholder={t("settings.proxyPlaceholder")}
              className="h-7 w-44 rounded-md border border-border bg-background/50 px-2 text-[11px] font-medium focus:border-primary/50 focus:outline-none"
            />
          </div>
        </Row>
      </Section>

      {/* General */}
      <Section title={t("settings.general")} icon={<Globe className="h-3.5 w-3.5 text-primary/70" />}>
        <Row label={t("settings.language")} description={t("settings.languageDesc")}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as "en" | "fr" | "zh-Hans" | "zh-Hant")}
            className="h-7 rounded-md border border-border bg-background/50 px-2 text-[11px] font-medium focus:border-primary/50 focus:outline-none"
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="zh-Hans">简体中文</option>
            <option value="zh-Hant">繁體中文</option>
          </select>
        </Row>
        <Row label={t("settings.defaultLocale")} description={t("settings.defaultLocaleDesc")}>
          <input
            type="text"
            value={defaultLocale}
            onChange={(e) => setDefaultLocale(e.target.value)}
            placeholder="en-US"
            className="h-7 w-20 rounded-md border border-border bg-background/50 px-2 text-[11px] font-medium text-center focus:border-primary/50 focus:outline-none"
          />
        </Row>
      </Section>

      {/* Updates */}
      <Section title={t("settings.updates")} icon={<Download className="h-3.5 w-3.5 text-primary/70" />}>
        <Row label={t("settings.autoCheck")} description={t("settings.autoCheckDesc")}>
          <Toggle checked={autoCheckUpdates} onChange={setAutoCheckUpdates} />
        </Row>
      </Section>

      {/* History */}
      <Section title={t("settings.history")} icon={<History className="h-3.5 w-3.5 text-primary/70" />}>
        <Row label={t("settings.maxRecent")} description={t("settings.maxRecentDesc")}>
          <select
            value={maxRecentSubmissions}
            onChange={(e) => setMaxRecentSubmissions(Number(e.target.value))}
            className="h-7 rounded-md border border-border bg-background/50 px-2 text-[11px] font-medium focus:border-primary/50 focus:outline-none"
          >
            {[5, 10, 15, 20, 30, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </Row>
        <Row label={t("settings.currentHistory")} description={t("settings.submissions", { n: submissions.length, p: recentPackageIds.length })}>
          {confirmClearHistory ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmClearHistory(false)} className="rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent">{t("common.cancel")}</button>
              <button onClick={handleClearHistory} className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20">{t("settings.confirm")}</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClearHistory(true)}
              disabled={submissions.length === 0 && recentPackageIds.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3 w-3" />{t("settings.clear")}
            </button>
          )}
        </Row>
      </Section>

      {/* About */}
      <Section title={t("settings.about")} icon={<Bell className="h-3.5 w-3.5 text-primary/70" />}>
        <Row label={t("settings.version")} description="UniCreate">
          <span className="text-[11px] font-mono text-muted-foreground">v{__APP_VERSION__}</span>
        </Row>
        <Row label={t("settings.github")} description={t("settings.githubDesc")}>
          <a
            href="https://github.com/Drrakendu78/UniCreate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
          >
            {t("settings.repository")}<ChevronRight className="h-3 w-3" />
          </a>
        </Row>
      </Section>
    </div>
  );
}
