import { create } from "zustand";
import type {
  ManifestData,
  InstallerEntry,
  LocaleData,
  WizardStep,
  YamlFile,
} from "@/lib/types";

interface ManifestStore {
  currentStep: WizardStep;
  manifest: ManifestData;
  generatedYaml: YamlFile[];
  isAnalyzing: boolean;
  isSubmitting: boolean;

  setStep: (step: WizardStep) => void;
  setPackageIdentifier: (id: string) => void;
  setPackageVersion: (version: string) => void;
  setDefaultLocale: (locale: string) => void;
  setMinimumOSVersion: (version: string) => void;
  addInstaller: (installer: InstallerEntry) => void;
  updateInstaller: (index: number, installer: InstallerEntry) => void;
  removeInstaller: (index: number) => void;
  setLocale: (locale: Partial<LocaleData>) => void;
  setGeneratedYaml: (files: YamlFile[]) => void;
  setIsAnalyzing: (value: boolean) => void;
  setIsSubmitting: (value: boolean) => void;
  reset: () => void;
}

const defaultLocale: LocaleData = {
  packageLocale: "en-US",
  publisher: "",
  packageName: "",
  license: "",
  shortDescription: "",
};

const defaultManifest: ManifestData = {
  packageIdentifier: "",
  packageVersion: "",
  defaultLocale: "en-US",
  installers: [],
  locale: defaultLocale,
};

export const useManifestStore = create<ManifestStore>((set) => ({
  currentStep: "installer",
  manifest: { ...defaultManifest },
  generatedYaml: [],
  isAnalyzing: false,
  isSubmitting: false,

  setStep: (step) => set({ currentStep: step }),

  setPackageIdentifier: (id) =>
    set((s) => ({ manifest: { ...s.manifest, packageIdentifier: id } })),

  setPackageVersion: (version) =>
    set((s) => ({ manifest: { ...s.manifest, packageVersion: version } })),

  setDefaultLocale: (locale) =>
    set((s) => ({ manifest: { ...s.manifest, defaultLocale: locale } })),

  setMinimumOSVersion: (version) =>
    set((s) => ({
      manifest: { ...s.manifest, minimumOSVersion: version },
    })),

  addInstaller: (installer) =>
    set((s) => ({
      manifest: {
        ...s.manifest,
        installers: [...s.manifest.installers, installer],
      },
    })),

  updateInstaller: (index, installer) =>
    set((s) => {
      const installers = [...s.manifest.installers];
      installers[index] = installer;
      return { manifest: { ...s.manifest, installers } };
    }),

  removeInstaller: (index) =>
    set((s) => ({
      manifest: {
        ...s.manifest,
        installers: s.manifest.installers.filter((_, i) => i !== index),
      },
    })),

  setLocale: (locale) =>
    set((s) => ({
      manifest: {
        ...s.manifest,
        locale: { ...s.manifest.locale, ...locale },
      },
    })),

  setGeneratedYaml: (files) => set({ generatedYaml: files }),
  setIsAnalyzing: (value) => set({ isAnalyzing: value }),
  setIsSubmitting: (value) => set({ isSubmitting: value }),

  reset: () =>
    set({
      currentStep: "installer",
      manifest: { ...defaultManifest, locale: { ...defaultLocale } },
      generatedYaml: [],
      isAnalyzing: false,
      isSubmitting: false,
    }),
}));
