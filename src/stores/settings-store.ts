import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppLanguage = "en" | "fr" | "zh-Hans" | "zh-Hant";

export type EphemeralTimeout = 5 | 10 | 15 | 30;

interface SettingsStore {
  language: AppLanguage;
  defaultLocale: string;
  maxRecentSubmissions: number;
  autoCheckUpdates: boolean;
  neverSaveSession: boolean;
  ephemeralTimeoutMinutes: EphemeralTimeout;
  proxyUrl: string;
  setLanguage: (lang: AppLanguage) => void;
  setDefaultLocale: (locale: string) => void;
  setMaxRecentSubmissions: (max: number) => void;
  setAutoCheckUpdates: (value: boolean) => void;
  setNeverSaveSession: (value: boolean) => void;
  setEphemeralTimeoutMinutes: (minutes: EphemeralTimeout) => void;
  setProxyUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsStore>()(persist((set) => ({
  language: "en",
  defaultLocale: "en-US",
  maxRecentSubmissions: 10,
  autoCheckUpdates: true,
  neverSaveSession: false,
  ephemeralTimeoutMinutes: 15,
  proxyUrl: "",

  setLanguage: (language) => set({ language }),
  setDefaultLocale: (defaultLocale) => set({ defaultLocale }),
  setMaxRecentSubmissions: (maxRecentSubmissions) => set({ maxRecentSubmissions: Math.max(1, Math.min(50, maxRecentSubmissions)) }),
  setAutoCheckUpdates: (autoCheckUpdates) => set({ autoCheckUpdates }),
  setNeverSaveSession: (neverSaveSession) => set({ neverSaveSession }),
  setEphemeralTimeoutMinutes: (ephemeralTimeoutMinutes) => set({ ephemeralTimeoutMinutes }),
  setProxyUrl: (proxyUrl) => set({ proxyUrl: proxyUrl.trim() }),
}), {
  name: "unicreate-settings",
}));
