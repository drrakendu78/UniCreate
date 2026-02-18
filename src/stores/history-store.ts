import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SubmissionEntry } from "@/lib/types";

interface HistoryStore {
  submissions: SubmissionEntry[];
  addSubmission: (entry: SubmissionEntry) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryStore>()(persist((set) => ({
  submissions: [],

  addSubmission: (entry) =>
    set((s) => ({ submissions: [entry, ...s.submissions] })),

  clearHistory: () => set({ submissions: [] }),
}), {
  name: "unicreate-history",
}));
