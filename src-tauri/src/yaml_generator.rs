use serde::{Deserialize, Serialize};

const MANIFEST_SCHEMA_VERSION: &str = "1.9.0";

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
        Some(v) if !v.is_empty() => format_yaml_field(key, v),
        _ => String::new(),
    }
}

fn needs_yaml_quotes(value: &str) -> bool {
    if value.is_empty() || value.trim() != value {
        return true;
    }

    let lower = value.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "null" | "~" | "true" | "false" | "yes" | "no" | "on" | "off"
    ) {
        return true;
    }

    let starts_with_special = matches!(
        value.chars().next(),
        Some('-'
            | '?'
            | ':'
            | ','
            | '['
            | ']'
            | '{'
            | '}'
            | '#'
            | '&'
            | '*'
            | '!'
            | '|'
            | '>'
            | '@'
            | '`'
            | '"'
            | '\'')
    );
    if starts_with_special {
        return true;
    }

    value.contains(": ")
        || value.contains(" #")
        || value.ends_with(':')
        || value.contains('\t')
        || value.chars().any(|c| c.is_control())
}

fn format_yaml_scalar(value: &str) -> String {
    if needs_yaml_quotes(value) {
        format!("'{}'", value.replace('\'', "''"))
    } else {
        value.to_string()
    }
}

fn format_yaml_field(key: &str, value: &str) -> String {
    if value.contains('\n') {
        let mut out = format!("{}: |-\n", key);
        for line in value.lines() {
            out.push_str("  ");
            out.push_str(line);
            out.push('\n');
        }
        out
    } else {
        format!("{}: {}\n", key, format_yaml_scalar(value))
    }
}

fn schema_header(manifest_kind: &str) -> String {
    format!(
        "# yaml-language-server: $schema=https://aka.ms/winget-manifest.{}.{}.schema.json\n\n",
        manifest_kind, MANIFEST_SCHEMA_VERSION
    )
}

fn generate_version_yaml(m: &ManifestData) -> YamlFile {
    let mut content = schema_header("version");
    content.push_str(&format_yaml_field("PackageIdentifier", &m.package_identifier));
    content.push_str(&format_yaml_field("PackageVersion", &m.package_version));
    content.push_str(&format_yaml_field("DefaultLocale", &m.default_locale));
    content.push_str(&format_yaml_field("ManifestType", "version"));
    content.push_str(&format_yaml_field("ManifestVersion", MANIFEST_SCHEMA_VERSION));
    YamlFile {
        file_name: format!("{}.yaml", m.package_identifier),
        content,
    }
}

fn generate_installer_yaml(m: &ManifestData) -> YamlFile {
    let mut content = schema_header("installer");
    content.push_str(&format_yaml_field("PackageIdentifier", &m.package_identifier));
    content.push_str(&format_yaml_field("PackageVersion", &m.package_version));

    if let Some(ref os) = m.minimum_os_version {
        if !os.is_empty() {
            content.push_str(&format_yaml_field("MinimumOSVersion", os));
        }
    }

    content.push_str("Installers:\n");

    for inst in &m.installers {
        content.push_str(&format!(
            "- Architecture: {}\n",
            format_yaml_scalar(&inst.architecture)
        ));
        content.push_str(&format!(
            "  InstallerType: {}\n",
            format_yaml_scalar(&inst.installer_type)
        ));
        content.push_str(&format!(
            "  InstallerUrl: {}\n",
            format_yaml_scalar(&inst.installer_url)
        ));
        content.push_str(&format!("  InstallerSha256: {}\n", inst.installer_sha256));

        if let Some(ref scope) = inst.scope {
            if !scope.is_empty() {
                content.push_str(&format!("  Scope: {}\n", format_yaml_scalar(scope)));
            }
        }
        if let Some(ref sig) = inst.signature_sha256 {
            if !sig.is_empty() {
                content.push_str(&format!("  SignatureSha256: {}\n", sig));
            }
        }
        if let Some(ref pc) = inst.product_code {
            if !pc.is_empty() {
                content.push_str(&format!("  ProductCode: {}\n", format_yaml_scalar(pc)));
            }
        }
        if let Some(ref ub) = inst.upgrade_behavior {
            if !ub.is_empty() {
                content.push_str(&format!(
                    "  UpgradeBehavior: {}\n",
                    format_yaml_scalar(ub)
                ));
            }
        }
        if let Some(ref er) = inst.elevation_requirement {
            if !er.is_empty() {
                content.push_str(&format!(
                    "  ElevationRequirement: {}\n",
                    format_yaml_scalar(er)
                ));
            }
        }
        if let Some(ref modes) = inst.install_modes {
            if !modes.is_empty() {
                content.push_str("  InstallModes:\n");
                for mode in modes {
                    content.push_str(&format!("  - {}\n", format_yaml_scalar(mode)));
                }
            }
        }
        let is_exe = inst.installer_type.eq_ignore_ascii_case("exe");
        let silent = inst
            .installer_switches
            .as_ref()
            .and_then(|s| s.silent.as_ref())
            .filter(|v| !v.is_empty())
            .cloned()
            .or_else(|| if is_exe { Some("/S".to_string()) } else { None });
        let silent_with_progress = inst
            .installer_switches
            .as_ref()
            .and_then(|s| s.silent_with_progress.as_ref())
            .filter(|v| !v.is_empty())
            .cloned()
            .or_else(|| if is_exe { Some("/S".to_string()) } else { None });
        let custom = inst
            .installer_switches
            .as_ref()
            .and_then(|s| s.custom.as_ref())
            .filter(|v| !v.is_empty())
            .cloned();

        let interactive = inst.installer_switches.as_ref().and_then(|s| s.interactive.as_ref()).filter(|v| !v.is_empty()).cloned();
        let install_location = inst.installer_switches.as_ref().and_then(|s| s.install_location.as_ref()).filter(|v| !v.is_empty()).cloned();
        let log = inst.installer_switches.as_ref().and_then(|s| s.log.as_ref()).filter(|v| !v.is_empty()).cloned();
        let upgrade = inst.installer_switches.as_ref().and_then(|s| s.upgrade.as_ref()).filter(|v| !v.is_empty()).cloned();
        let repair = inst.installer_switches.as_ref().and_then(|s| s.repair.as_ref()).filter(|v| !v.is_empty()).cloned();

        if silent.is_some() || silent_with_progress.is_some() || custom.is_some()
            || interactive.is_some() || install_location.is_some() || log.is_some()
            || upgrade.is_some() || repair.is_some()
        {
            content.push_str("  InstallerSwitches:\n");
            if let Some(v) = silent {
                content.push_str(&format!("    Silent: {}\n", format_yaml_scalar(&v)));
            }
            if let Some(v) = silent_with_progress {
                content.push_str(&format!(
                    "    SilentWithProgress: {}\n",
                    format_yaml_scalar(&v)
                ));
            }
            if let Some(v) = interactive {
                content.push_str(&format!("    Interactive: {}\n", format_yaml_scalar(&v)));
            }
            if let Some(v) = install_location {
                content.push_str(&format!("    InstallLocation: {}\n", format_yaml_scalar(&v)));
            }
            if let Some(v) = log {
                content.push_str(&format!("    Log: {}\n", format_yaml_scalar(&v)));
            }
            if let Some(v) = upgrade {
                content.push_str(&format!("    Upgrade: {}\n", format_yaml_scalar(&v)));
            }
            if let Some(v) = custom {
                content.push_str(&format!("    Custom: {}\n", format_yaml_scalar(&v)));
            }
            if let Some(v) = repair {
                content.push_str(&format!("    Repair: {}\n", format_yaml_scalar(&v)));
            }
        }
    }

    content.push_str(&format_yaml_field("ManifestType", "installer"));
    content.push_str(&format_yaml_field("ManifestVersion", MANIFEST_SCHEMA_VERSION));

    YamlFile {
        file_name: format!("{}.installer.yaml", m.package_identifier),
        content,
    }
}

fn generate_locale_yaml(m: &ManifestData) -> YamlFile {
    let l = &m.locale;
    let mut content = schema_header("defaultLocale");
    content.push_str(&format_yaml_field("PackageIdentifier", &m.package_identifier));
    content.push_str(&format_yaml_field("PackageVersion", &m.package_version));
    content.push_str(&format_yaml_field("PackageLocale", &l.package_locale));
    content.push_str(&format_yaml_field("Publisher", &l.publisher));

    content.push_str(&opt_field("PublisherUrl", &l.publisher_url));
    content.push_str(&opt_field("PublisherSupportUrl", &l.publisher_support_url));
    content.push_str(&opt_field("PrivacyUrl", &l.privacy_url));
    content.push_str(&opt_field("Author", &l.author));
    content.push_str(&format_yaml_field("PackageName", &l.package_name));
    content.push_str(&opt_field("PackageUrl", &l.package_url));
    content.push_str(&format_yaml_field("License", &l.license));
    content.push_str(&opt_field("LicenseUrl", &l.license_url));
    content.push_str(&opt_field("Copyright", &l.copyright));
    content.push_str(&opt_field("CopyrightUrl", &l.copyright_url));
    content.push_str(&format_yaml_field("ShortDescription", &l.short_description));
    content.push_str(&opt_field("Description", &l.description));
    content.push_str(&opt_field("Moniker", &l.moniker));

    if let Some(ref tags) = l.tags {
        if !tags.is_empty() {
            content.push_str("Tags:\n");
            for tag in tags {
                content.push_str(&format!("- {}\n", format_yaml_scalar(tag)));
            }
        }
    }

    content.push_str(&opt_field("ReleaseNotes", &l.release_notes));
    content.push_str(&opt_field("ReleaseNotesUrl", &l.release_notes_url));
    content.push_str(&format_yaml_field("ManifestType", "defaultLocale"));
    content.push_str(&format_yaml_field("ManifestVersion", MANIFEST_SCHEMA_VERSION));

    YamlFile {
        file_name: format!(
            "{}.locale.{}.yaml",
            m.package_identifier, l.package_locale
        ),
        content,
    }
}

fn generate_additional_locale_yaml(m: &ManifestData, l: &LocaleData) -> YamlFile {
    let mut content = schema_header("locale");
    content.push_str(&format_yaml_field("PackageIdentifier", &m.package_identifier));
    content.push_str(&format_yaml_field("PackageVersion", &m.package_version));
    content.push_str(&format_yaml_field("PackageLocale", &l.package_locale));
    content.push_str(&format_yaml_field("Publisher", &l.publisher));

    content.push_str(&opt_field("PublisherUrl", &l.publisher_url));
    content.push_str(&opt_field("PublisherSupportUrl", &l.publisher_support_url));
    content.push_str(&opt_field("PrivacyUrl", &l.privacy_url));
    content.push_str(&opt_field("Author", &l.author));
    content.push_str(&format_yaml_field("PackageName", &l.package_name));
    content.push_str(&opt_field("PackageUrl", &l.package_url));
    content.push_str(&format_yaml_field("License", &l.license));
    content.push_str(&opt_field("LicenseUrl", &l.license_url));
    content.push_str(&opt_field("Copyright", &l.copyright));
    content.push_str(&opt_field("CopyrightUrl", &l.copyright_url));
    content.push_str(&format_yaml_field("ShortDescription", &l.short_description));
    content.push_str(&opt_field("Description", &l.description));

    if let Some(ref tags) = l.tags {
        if !tags.is_empty() {
            content.push_str("Tags:\n");
            for tag in tags {
                content.push_str(&format!("- {}\n", format_yaml_scalar(tag)));
            }
        }
    }

    content.push_str(&opt_field("ReleaseNotes", &l.release_notes));
    content.push_str(&opt_field("ReleaseNotesUrl", &l.release_notes_url));
    content.push_str(&format_yaml_field("ManifestType", "locale"));
    content.push_str(&format_yaml_field("ManifestVersion", MANIFEST_SCHEMA_VERSION));

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
