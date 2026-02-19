import { create } from "zustand";

const EPHEMERAL_SESSION_TTL_MS = 15 * 60 * 1000;

interface AuthSessionStore {
  activeSessionToken: string | null;
  savedSessionUser: string | null;
  hasSavedSession: boolean;
  ephemeralSessionExpiresAt: number | null;
  setSession: (token: string | null, user: string | null, saved: boolean) => void;
  touchEphemeralSession: () => void;
  isEphemeralSessionExpired: () => boolean;
  clearSession: () => void;
}

export const useAuthSessionStore = create<AuthSessionStore>((set, get) => ({
  activeSessionToken: null,
  savedSessionUser: null,
  hasSavedSession: false,
  ephemeralSessionExpiresAt: null,

  setSession: (token, user, saved) =>
    set({
      activeSessionToken: token,
      savedSessionUser: user,
      hasSavedSession: saved,
      ephemeralSessionExpiresAt: token && !saved ? Date.now() + EPHEMERAL_SESSION_TTL_MS : null,
    }),

  touchEphemeralSession: () => {
    const state = get();
    if (!state.activeSessionToken || state.hasSavedSession) return;
    set({ ephemeralSessionExpiresAt: Date.now() + EPHEMERAL_SESSION_TTL_MS });
  },

  isEphemeralSessionExpired: () => {
    const state = get();
    if (!state.activeSessionToken || state.hasSavedSession || !state.ephemeralSessionExpiresAt) {
      return false;
    }
    return Date.now() >= state.ephemeralSessionExpiresAt;
  },

  clearSession: () =>
    set({
      activeSessionToken: null,
      savedSessionUser: null,
      hasSavedSession: false,
      ephemeralSessionExpiresAt: null,
    }),
}));
