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
}

export interface HashResult {
  sha256: string;
  fileSize: number;
  fileName: string;
  detectedType?: InstallerType;
}

export interface YamlFile {
  fileName: string;
  content: string;
}

export interface GitHubUser {
  login: string;
  avatarUrl: string;
}

export type WizardStep = "installer" | "metadata" | "review" | "submit";
