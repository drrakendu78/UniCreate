<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src-tauri/icons/logo light.png" />
    <source media="(prefers-color-scheme: light)" srcset="src-tauri/icons/logo dark.png" />
    <img src="src-tauri/icons/logo dark.png" alt="UniCreate" width="280" />
  </picture>
</p>

<p align="center">
  <strong>The modern WinGet manifest creator</strong>
</p>

<p align="center">
  Create, update, and submit <a href="https://github.com/microsoft/winget-pkgs">WinGet package manifests</a> with a beautiful GUI.<br/>
  No YAML editing. No CLI. Just a few clicks.
</p>

<p align="center">
  <a href="https://github.com/drrakendu78/UniCreate/releases/latest"><img src="https://img.shields.io/github/v/release/drrakendu78/UniCreate?style=flat-square&color=blue" alt="Latest Release" /></a>
  <a href="https://github.com/drrakendu78/UniCreate/blob/master/LICENSE"><img src="https://img.shields.io/github/license/drrakendu78/UniCreate?style=flat-square" alt="License" /></a>
  <a href="https://github.com/drrakendu78/UniCreate/releases"><img src="https://img.shields.io/github/downloads/drrakendu78/UniCreate/total?style=flat-square&color=green" alt="Downloads" /></a>
</p>

---

## Features

- **Smart Installer Analysis** — Paste a download URL or drag & drop a local file. UniCreate computes the SHA256 hash, detects the installer type (EXE, MSI, MSIX, Inno, NSIS, WiX...) and architecture automatically.

- **GitHub Metadata Fetch** — Detects GitHub URLs and auto-fills package description, license, homepage, tags, and release notes from the repository API.

- **Update Existing Packages** — Search any existing WinGet package by identifier. All metadata is loaded automatically — just add the new installer URL.

- **Multi-Locale Support** — Add translations for your package description in multiple languages (en-US, fr-FR, de-DE, etc.) with dedicated locale manifests.

- **Live YAML Preview** — Review the generated manifests (version, installer, and locale files) before submitting. Copy to clipboard or save to disk.

- **One-Click GitHub Submit** — Sign in with GitHub via OAuth Device Flow (no token to create manually), and submit your manifest as a PR to `microsoft/winget-pkgs` directly from the app.

- **Secure Token Storage** — Optionally store your session in the OS keychain (Windows Credential Manager) for seamless re-authentication.

- **Submission History** — Track all your past submissions with direct links to the pull requests.

- **MSIX Signature Extraction** — Automatically extracts `SignatureSha256` from MSIX packages for proper manifest generation.

## Installation

### Via WinGet (recommended)

```
winget install Drrakendu78.UniCreate
```

### Manual Download

Download the latest installer from the [Releases](https://github.com/drrakendu78/UniCreate/releases/latest) page.

## Quick Start

1. **Launch UniCreate** and choose "New Manifest" or "Update Existing"
2. **Add an installer** — Paste the download URL and click "Analyze & Add"
3. **Fill metadata** — Package name, publisher, description (auto-filled from GitHub if applicable)
4. **Review** the generated YAML files
5. **Submit** — Sign in with GitHub and submit your PR in one click

## Screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/drrakendu78/UniCreate/master/.github/screenshot.png" alt="UniCreate Screenshot" width="700" />
</p>

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | [Tauri 2](https://v2.tauri.app/) |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS + Radix UI |
| Backend | Rust |
| State | Zustand (persisted) |
| Auth | GitHub OAuth Device Flow |
| Storage | OS Keychain (keyring) |

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/)

### Steps

```bash
# Clone the repository
git clone https://github.com/drrakendu78/UniCreate.git
cd UniCreate

# Install dependencies
npm install

# Run in development
npm run tauri dev

# Build for production
npm run tauri build
```

## Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Made with Rust and React by <a href="https://github.com/drrakendu78">Drrakendu78</a>
</p>