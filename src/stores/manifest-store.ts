import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ManifestData,
  InstallerEntry,
  LocaleData,
  WizardStep,
  YamlFile,
  RepoMetadata,
  ExistingManifest,
} from "@/lib/types";
import { repoMappings } from "@/lib/repo-mappings";

interface ManifestStore {
  currentStep: WizardStep;
  manifest: ManifestData;
  generatedYaml: YamlFile[];
  isAnalyzing: boolean;
  isSubmitting: boolean;
  isUpdate: boolean;

  setStep: (step: WizardStep) => void;
  setPackageIdentifier: (id: string) => void;
  setPackageVersion: (version: string) => void;
  setDefaultLocale: (locale: string) => void;
  setMinimumOSVersion: (version: string) => void;
  addInstaller: (installer: InstallerEntry) => void;
  updateInstaller: (index: number, installer: InstallerEntry) => void;
  removeInstaller: (index: number) => void;
  setLocale: (locale: Partial<LocaleData>) => void;
  addAdditionalLocale: (locale: LocaleData) => void;
  updateAdditionalLocale: (index: number, locale: Partial<LocaleData>) => void;
  removeAdditionalLocale: (index: number) => void;
  setGeneratedYaml: (files: YamlFile[]) => void;
  setIsAnalyzing: (value: boolean) => void;
  setIsSubmitting: (value: boolean) => void;
  setIsUpdate: (value: boolean) => void;
  applyRepoMetadata: (meta: RepoMetadata) => void;
  applyExistingManifest: (existing: ExistingManifest) => void;
  reset: () => void;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
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

export const useManifestStore = create<ManifestStore>()(persist((set) => ({
  currentStep: "home",
  manifest: { ...defaultManifest },
  generatedYaml: [],
  isAnalyzing: false,
  isSubmitting: false,
  isUpdate: false,

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

  addAdditionalLocale: (locale) =>
    set((s) => ({
      manifest: {
        ...s.manifest,
        additionalLocales: [...(s.manifest.additionalLocales || []), locale],
      },
    })),

  updateAdditionalLocale: (index, locale) =>
    set((s) => {
      const locales = [...(s.manifest.additionalLocales || [])];
      locales[index] = { ...locales[index], ...locale };
      return { manifest: { ...s.manifest, additionalLocales: locales } };
    }),

  removeAdditionalLocale: (index) =>
    set((s) => ({
      manifest: {
        ...s.manifest,
        additionalLocales: (s.manifest.additionalLocales || []).filter((_, i) => i !== index),
      },
    })),

  setGeneratedYaml: (files) => set({ generatedYaml: files }),
  setIsAnalyzing: (value) => set({ isAnalyzing: value }),
  setIsSubmitting: (value) => set({ isSubmitting: value }),
  setIsUpdate: (value) => set({ isUpdate: value }),

  applyRepoMetadata: (meta) =>
    set((s) => {
      const m = s.manifest;
      const loc = m.locale;
      const owner = capitalize(meta.owner);
      const repoName = capitalize(meta.repoName);
      const mappingKey = `${meta.owner}/${meta.repoName}`.toLowerCase();
      const mapping = repoMappings[mappingKey];
      const id = m.packageIdentifier || mapping?.packageIdentifier || `${owner}.${repoName}`;
      const pkgName = mapping?.packageName || repoName;
      const version = m.packageVersion || meta.version || "";
      return {
        manifest: {
          ...m,
          packageIdentifier: id,
          packageVersion: version,
          locale: {
            ...loc,
            publisher: loc.publisher || owner,
            packageName: loc.packageName || pkgName,
            shortDescription: loc.shortDescription || meta.description || "",
            license: loc.license || meta.license || "",
            description: loc.description || meta.description || undefined,
            packageUrl: loc.packageUrl || meta.homepage || meta.htmlUrl,
            publisherUrl: loc.publisherUrl || `https://github.com/${meta.owner}`,
            tags: loc.tags?.length ? loc.tags : meta.topics.length ? meta.topics : undefined,
            releaseNotes: loc.releaseNotes || meta.releaseNotes || undefined,
            releaseNotesUrl: loc.releaseNotesUrl || meta.releaseUrl || undefined,
          },
        },
      };
    }),

  applyExistingManifest: (existing) =>
    set((s) => ({
      manifest: {
        ...s.manifest,
        packageIdentifier: existing.packageIdentifier,
        defaultLocale: existing.packageLocale,
        locale: {
          packageLocale: existing.packageLocale,
          publisher: existing.publisher,
          packageName: existing.packageName,
          license: existing.license,
          shortDescription: existing.shortDescription,
          description: existing.description || undefined,
          publisherUrl: existing.publisherUrl || undefined,
          packageUrl: existing.packageUrl || undefined,
          licenseUrl: existing.licenseUrl || undefined,
          privacyUrl: existing.privacyUrl || undefined,
          author: existing.author || undefined,
          moniker: existing.moniker || undefined,
          tags: existing.tags.length ? existing.tags : undefined,
          releaseNotesUrl: existing.releaseNotesUrl || undefined,
        },
      },
    })),

  reset: () =>
    set({
      currentStep: "home",
      manifest: { ...defaultManifest, locale: { ...defaultLocale } },
      generatedYaml: [],
      isAnalyzing: false,
      isSubmitting: false,
      isUpdate: false,
    }),
}), {
  name: "unicreate-manifest",
  partialize: (state) => ({
    currentStep: state.currentStep,
    manifest: state.manifest,
    isUpdate: state.isUpdate,
  }),
}));
