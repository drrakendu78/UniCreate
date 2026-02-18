use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestData {
    pub package_identifier: String,
    pub package_version: String,
    pub default_locale: String,
    pub minimum_os_version: Option<String>,
    pub installers: Vec<InstallerEntry>,
    pub locale: LocaleData,
    pub additional_locales: Option<Vec<LocaleData>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallerEntry {
    pub architecture: String,
    pub installer_type: String,
    pub installer_url: String,
    pub installer_sha256: String,
    pub scope: Option<String>,
    pub installer_switches: Option<InstallerSwitches>,
    pub install_modes: Option<Vec<String>>,
    pub signature_sha256: Option<String>,
    pub product_code: Option<String>,
    pub upgrade_behavior: Option<String>,
    pub elevation_requirement: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallerSwitches {
    pub silent: Option<String>,
    pub silent_with_progress: Option<String>,
    pub interactive: Option<String>,
    pub install_location: Option<String>,
    pub log: Option<String>,
    pub upgrade: Option<String>,
    pub custom: Option<String>,
    pub repair: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocaleData {
    pub package_locale: String,
    pub publisher: String,
    pub publisher_url: Option<String>,
    pub publisher_support_url: Option<String>,
    pub privacy_url: Option<String>,
    pub author: Option<String>,
    pub package_name: String,
    pub package_url: Option<String>,
    pub license: String,
    pub license_url: Option<String>,
    pub copyright: Option<String>,
    pub copyright_url: Option<String>,
    pub short_description: String,
    pub description: Option<String>,
    pub moniker: Option<String>,
    pub tags: Option<Vec<String>>,
    pub release_notes: Option<String>,
    pub release_notes_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct YamlFile {
    pub file_name: String,
    pub content: String,
}

fn opt_field(key: &str, value: &Option<String>) -> String {
    match value {
        Some(v) if !v.is_empty() => format!("{}: \"{}\"\n", key, v),
        _ => String::new(),
    }
}

fn generate_version_yaml(m: &ManifestData) -> YamlFile {
    let content = format!(
        "PackageIdentifier: \"{}\"\n\
         PackageVersion: \"{}\"\n\
         DefaultLocale: \"{}\"\n\
         ManifestType: \"version\"\n\
         ManifestVersion: \"1.9.0\"\n",
        m.package_identifier, m.package_version, m.default_locale
    );
    YamlFile {
        file_name: format!("{}.yaml", m.package_identifier),
        content,
    }
}

fn generate_installer_yaml(m: &ManifestData) -> YamlFile {
    let mut content = format!(
        "PackageIdentifier: \"{}\"\n\
         PackageVersion: \"{}\"\n",
        m.package_identifier, m.package_version
    );

    if let Some(ref os) = m.minimum_os_version {
        if !os.is_empty() {
            content.push_str(&format!("MinimumOSVersion: \"{}\"\n", os));
        }
    }

    content.push_str("Installers:\n");

    for inst in &m.installers {
        content.push_str(&format!("- Architecture: \"{}\"\n", inst.architecture));
        content.push_str(&format!("  InstallerType: \"{}\"\n", inst.installer_type));
        content.push_str(&format!("  InstallerUrl: \"{}\"\n", inst.installer_url));
        content.push_str(&format!("  InstallerSha256: {}\n", inst.installer_sha256));

        if let Some(ref scope) = inst.scope {
            if !scope.is_empty() {
                content.push_str(&format!("  Scope: \"{}\"\n", scope));
            }
        }
        if let Some(ref sig) = inst.signature_sha256 {
            if !sig.is_empty() {
                content.push_str(&format!("  SignatureSha256: {}\n", sig));
            }
        }
        if let Some(ref pc) = inst.product_code {
            if !pc.is_empty() {
                content.push_str(&format!("  ProductCode: \"{}\"\n", pc));
            }
        }
        if let Some(ref ub) = inst.upgrade_behavior {
            if !ub.is_empty() {
                content.push_str(&format!("  UpgradeBehavior: \"{}\"\n", ub));
            }
        }
        if let Some(ref er) = inst.elevation_requirement {
            if !er.is_empty() {
                content.push_str(&format!("  ElevationRequirement: \"{}\"\n", er));
            }
        }
        if let Some(ref modes) = inst.install_modes {
            if !modes.is_empty() {
                content.push_str("  InstallModes:\n");
                for mode in modes {
                    content.push_str(&format!("  - \"{}\"\n", mode));
                }
            }
        }
        if let Some(ref switches) = inst.installer_switches {
            let mut sw = String::new();
            if let Some(ref v) = switches.silent {
                if !v.is_empty() { sw.push_str(&format!("    Silent: \"{}\"\n", v)); }
            }
            if let Some(ref v) = switches.silent_with_progress {
                if !v.is_empty() { sw.push_str(&format!("    SilentWithProgress: \"{}\"\n", v)); }
            }
            if let Some(ref v) = switches.custom {
                if !v.is_empty() { sw.push_str(&format!("    Custom: \"{}\"\n", v)); }
            }
            if !sw.is_empty() {
                content.push_str("  InstallerSwitches:\n");
                content.push_str(&sw);
            }
        }
    }

    content.push_str("ManifestType: \"installer\"\n");
    content.push_str("ManifestVersion: \"1.9.0\"\n");

    YamlFile {
        file_name: format!("{}.installer.yaml", m.package_identifier),
        content,
    }
}

fn generate_locale_yaml(m: &ManifestData) -> YamlFile {
    let l = &m.locale;
    let mut content = format!(
        "PackageIdentifier: \"{}\"\n\
         PackageVersion: \"{}\"\n\
         PackageLocale: \"{}\"\n\
         Publisher: \"{}\"\n",
        m.package_identifier, m.package_version, l.package_locale, l.publisher
    );

    content.push_str(&opt_field("PublisherUrl", &l.publisher_url));
    content.push_str(&opt_field("PublisherSupportUrl", &l.publisher_support_url));
    content.push_str(&opt_field("PrivacyUrl", &l.privacy_url));
    content.push_str(&opt_field("Author", &l.author));
    content.push_str(&format!("PackageName: \"{}\"\n", l.package_name));
    content.push_str(&opt_field("PackageUrl", &l.package_url));
    content.push_str(&format!("License: \"{}\"\n", l.license));
    content.push_str(&opt_field("LicenseUrl", &l.license_url));
    content.push_str(&opt_field("Copyright", &l.copyright));
    content.push_str(&opt_field("CopyrightUrl", &l.copyright_url));
    content.push_str(&format!("ShortDescription: \"{}\"\n", l.short_description));
    content.push_str(&opt_field("Description", &l.description));
    content.push_str(&opt_field("Moniker", &l.moniker));

    if let Some(ref tags) = l.tags {
        if !tags.is_empty() {
            content.push_str("Tags:\n");
            for tag in tags {
                content.push_str(&format!("- \"{}\"\n", tag));
            }
        }
    }

    content.push_str(&opt_field("ReleaseNotes", &l.release_notes));
    content.push_str(&opt_field("ReleaseNotesUrl", &l.release_notes_url));
    content.push_str("ManifestType: \"defaultLocale\"\n");
    content.push_str("ManifestVersion: \"1.9.0\"\n");

    YamlFile {
        file_name: format!(
            "{}.locale.{}.yaml",
            m.package_identifier, l.package_locale
        ),
        content,
    }
}

fn generate_additional_locale_yaml(m: &ManifestData, l: &LocaleData) -> YamlFile {
    let mut content = format!(
        "PackageIdentifier: \"{}\"\n\
         PackageVersion: \"{}\"\n\
         PackageLocale: \"{}\"\n\
         Publisher: \"{}\"\n",
        m.package_identifier, m.package_version, l.package_locale, l.publisher
    );

    content.push_str(&opt_field("PublisherUrl", &l.publisher_url));
    content.push_str(&opt_field("PublisherSupportUrl", &l.publisher_support_url));
    content.push_str(&opt_field("PrivacyUrl", &l.privacy_url));
    content.push_str(&opt_field("Author", &l.author));
    content.push_str(&format!("PackageName: \"{}\"\n", l.package_name));
    content.push_str(&opt_field("PackageUrl", &l.package_url));
    content.push_str(&format!("License: \"{}\"\n", l.license));
    content.push_str(&opt_field("LicenseUrl", &l.license_url));
    content.push_str(&opt_field("Copyright", &l.copyright));
    content.push_str(&opt_field("CopyrightUrl", &l.copyright_url));
    content.push_str(&format!("ShortDescription: \"{}\"\n", l.short_description));
    content.push_str(&opt_field("Description", &l.description));

    if let Some(ref tags) = l.tags {
        if !tags.is_empty() {
            content.push_str("Tags:\n");
            for tag in tags {
                content.push_str(&format!("- \"{}\"\n", tag));
            }
        }
    }

    content.push_str(&opt_field("ReleaseNotes", &l.release_notes));
    content.push_str(&opt_field("ReleaseNotesUrl", &l.release_notes_url));
    content.push_str("ManifestType: \"locale\"\n");
    content.push_str("ManifestVersion: \"1.9.0\"\n");

    YamlFile {
        file_name: format!(
            "{}.locale.{}.yaml",
            m.package_identifier, l.package_locale
        ),
        content,
    }
}

pub fn generate_yaml(manifest: &ManifestData) -> Vec<YamlFile> {
    let mut files = vec![
        generate_version_yaml(manifest),
        generate_installer_yaml(manifest),
        generate_locale_yaml(manifest),
    ];

    if let Some(ref locales) = manifest.additional_locales {
        for locale in locales {
            files.push(generate_additional_locale_yaml(manifest, locale));
        }
    }

    files
}
