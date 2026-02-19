import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SubmissionEntry } from "@/lib/types";

interface HistoryStore {
  submissions: SubmissionEntry[];
  addSubmission: (entry: SubmissionEntry) => void;
  mergeRecoveredSubmissions: (entries: SubmissionEntry[], maxItems: number) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryStore>()(persist((set) => ({
  submissions: [],

  addSubmission: (entry) =>
    set((s) => ({ submissions: [entry, ...s.submissions] })),

  mergeRecoveredSubmissions: (entries, maxItems) =>
    set((s) => {
      const max = Math.min(Math.max(maxItems, 1), 10);
      const byUrl = new Map<string, SubmissionEntry>();

      for (const entry of [...entries, ...s.submissions]) {
        const current = byUrl.get(entry.prUrl);
        if (!current) {
          byUrl.set(entry.prUrl, entry);
          continue;
        }
        const currentTime = Number.isNaN(Date.parse(current.date)) ? 0 : Date.parse(current.date);
        const entryTime = Number.isNaN(Date.parse(entry.date)) ? 0 : Date.parse(entry.date);
        if (entryTime > currentTime) {
          byUrl.set(entry.prUrl, entry);
        }
      }

      const sorted = [...byUrl.values()].sort((a, b) => {
        const aTime = Number.isNaN(Date.parse(a.date)) ? 0 : Date.parse(a.date);
        const bTime = Number.isNaN(Date.parse(b.date)) ? 0 : Date.parse(b.date);
        return bTime - aTime;
      });

      return { submissions: sorted.slice(0, max) };
    }),

  clearHistory: () => set({ submissions: [] }),
}), {
  name: "unicreate-history",
}));
