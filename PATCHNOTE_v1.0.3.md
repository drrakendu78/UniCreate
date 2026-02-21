# UniCreate - Patch Notes v1.0.3

Date: 2026-02-21
Release tag: `v1.0.3`
Repository: `drrakendu78/UniCreate`

## Highlights

- Standalone updater app with progress bar (Discord-style) replaces invisible PowerShell script.
- Update mode now auto-fills version, release notes, and release notes URL from the new release.
- Recent packages quick-select chips in Update mode.
- Multi-segment package IDs fully supported (e.g., `Microsoft.VisualStudio.2022.Community`).
- All `InstallerSwitches` fields now written to YAML output.
- App version in TitleBar auto-synced from `package.json`.
- Docs: PR labels collapsed into hover tooltip.

## Technical changes

### 1) Standalone updater app
- New `updater/` Tauri project — a lightweight standalone window with logo, animated progress bar, and status text.
- Replaces the old PowerShell silent update script.
- Flow: main app launches `UniCreate-Updater.exe` with CLI args (`--url`, `--name`, `--app`, `--pid`), then closes. The updater waits for the main app PID to exit, downloads the installer with real-time progress, runs the silent install, and relaunches the app.
- PID polling uses Windows `OpenProcess` API (no more `tasklist` subprocess).
- Bundled as a resource alongside the main executable.

Impacted/new files:
- `updater/` (new Tauri project)
- `src-tauri/src/github.rs` (replaced PowerShell script with updater launch)
- `src-tauri/tauri.conf.json` (added `resources` for updater exe)

### 2) YAML field parser fix
- `parse_yaml_field` now matches `"Field: "` exactly instead of prefix-matching.
- Prevents `Publisher` from matching `PublisherUrl`.

Impacted file:
- `src-tauri/src/github.rs`

### 3) InstallerSwitches complete output
- All switch fields (`Interactive`, `InstallLocation`, `Log`, `Upgrade`, `Repair`) are now written to YAML when provided.
- Removed `#[allow(dead_code)]` on `InstallerSwitches` struct.

Impacted file:
- `src-tauri/src/yaml_generator.rs`

### 4) Multi-segment package ID support
- Replaced `splitn(2, '.')` with `split('.')` + `join("/")` for building winget-pkgs paths.
- Correctly handles IDs like `Microsoft.VisualStudio.2022.Community` → `manifests/m/Microsoft/VisualStudio/2022/Community/`.
- Applied to `fetch_existing_manifest`, `check_package_exists`, and `submit_manifest`.

Impacted file:
- `src-tauri/src/github.rs`

### 5) Dynamic version in TitleBar
- Added `__APP_VERSION__` define in Vite config, reading from `package.json`.
- TitleBar now displays version dynamically instead of hardcoded string.

Impacted files:
- `vite.config.ts`
- `src/vite-env.d.ts`
- `src/App.tsx`

### 6) Update mode: auto-fill from new release
- In update mode, `StepInstaller` now applies `version`, `releaseNotes`, and `releaseNotesUrl` from the new GitHub release metadata.
- Removed stale `releaseNotesUrl` from `applyExistingManifest` to prevent old tag carry-over.

Impacted files:
- `src/pages/StepInstaller.tsx`
- `src/stores/manifest-store.ts`

### 7) Recent packages quick-select in Update mode
- Added clickable chips showing previously submitted package IDs in the Update search view.
- Clicking a chip auto-fills the input and triggers the search immediately.
- Chips are deduplicated from submission history.

Impacted file:
- `src/pages/Home.tsx`

### 8) Docs: PR labels as tooltip
- PR label badges on the site are now collapsed into a compact "N labels" chip.
- Hovering reveals all labels in a dropdown tooltip.

Impacted files:
- `docs/app.js`
- `docs/styles.css`

### 9) Version bump
- App version updated to `1.0.3`.

Impacted files:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

## Build artifacts and SHA256 checksums

Checksums below match binaries produced by `npm run tauri build`.

| File | Size (bytes) | SHA256 |
|---|---:|---|
| `UniCreate_1.0.3_x64-setup.exe` | 16414018 | `b9994b533f2f43aa2965b0fe9a371c7e54d245e61ad30b5723475f5c72fcdba8` |
| `UniCreate_1.0.3_x64_en-US.msi` | 19722240 | `a53f07cb33c57ab9a7f0856c6faa3180a69fa4168cfaa322a42c070b9a63b631` |
| `UniCreate_1.0.3_x64_portable.exe` | 24460288 | `a120fd636caccb9a5a7051b706abb19ae7396e4323bf895a55212940f6b25ff6` |
