export type Architecture = "x86" | "x64" | "arm" | "arm64" | "neutral";

export type InstallerType =
  | "exe"
  | "msi"
  | "msix"
  | "inno"
  | "nullsoft"
  | "wix"
  | "burn"
  | "zip"
  | "portable";

export type Scope = "user" | "machine";

export type InstallMode = "silent" | "silentWithProgress" | "interactive";

export type UpgradeBehavior = "install" | "uninstallPrevious" | "deny";

export type ElevationRequirement =
  | "elevationRequired"
  | "elevationProhibited"
  | "elevatesSelf";

export interface InstallerSwitches {
  silent?: string;
  silentWithProgress?: string;
  interactive?: string;
  installLocation?: string;
  log?: string;
  upgrade?: string;
  custom?: string;
  repair?: string;
}

export interface InstallerEntry {
  architecture: Architecture;
  installerType: InstallerType;
  installerUrl: string;
  installerSha256: string;
  scope?: Scope;
  installerSwitches?: InstallerSwitches;
  installModes?: InstallMode[];
  signatureSha256?: string;
  productCode?: string;
  upgradeBehavior?: UpgradeBehavior;
  elevationRequirement?: ElevationRequirement;
}

export interface LocaleData {
  packageLocale: string;
  publisher: string;
  publisherUrl?: string;
  publisherSupportUrl?: string;
  privacyUrl?: string;
  author?: string;
  packageName: string;
  packageUrl?: string;
  license: string;
  licenseUrl?: string;
  copyright?: string;
  copyrightUrl?: string;
  shortDescription: string;
  description?: string;
  moniker?: string;
  tags?: string[];
  releaseNotes?: string;
  releaseNotesUrl?: string;
}

export interface ManifestData {
  packageIdentifier: string;
  packageVersion: string;
  defaultLocale: string;
  minimumOSVersion?: string;
  installers: InstallerEntry[];
  locale: LocaleData;
  additionalLocales?: LocaleData[];
}

export interface HashResult {
  sha256: string;
  fileSize: number;
  fileName: string;
  detectedType?: InstallerType;
  detectedArch?: Architecture;
  signatureSha256?: string;
}

export interface YamlFile {
  fileName: string;
  content: string;
}

export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export interface DeviceFlowStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
}

export interface RepoMetadata {
  owner: string;
  repoName: string;
  description: string | null;
  license: string | null;
  homepage: string | null;
  htmlUrl: string;
  topics: string[];
  version: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
}

export interface ExistingManifest {
  packageIdentifier: string;
  latestVersion: string;
  publisher: string;
  packageName: string;
  license: string;
  shortDescription: string;
  description: string | null;
  publisherUrl: string | null;
  packageUrl: string | null;
  licenseUrl: string | null;
  privacyUrl: string | null;
  author: string | null;
  moniker: string | null;
  tags: string[];
  releaseNotesUrl: string | null;
  packageLocale: string;
}

export interface RecoveredPr {
  pr_url: string;
  title: string;
  created_at: string;
  user_login: string;
}

export type PrLiveState = "open" | "merged" | "closed" | "unknown";

export interface PrLiveStatus {
  prUrl: string;
  status: PrLiveState;
  hasIssues: boolean;
  mergeableState: string | null;
}

export interface SubmissionEntry {
  packageId: string;
  version: string;
  prUrl: string;
  date: string;
  user: string;
}

export type WizardStep = "home" | "installer" | "metadata" | "review" | "submit";
