# UniCreate - Patch Notes v1.0.1

Date: 2026-02-19  
Release tag: `v1.0.1`  
Repository: `drrakendu78/UniCreate`

## Summary

This patch release improves WinGet manifest output quality and adds in-app YAML editing in the Review step.

## Changes

### 1) Review step: editable YAML
- Added `Edit YAML` mode in Step 3 (Review).
- Added inline editor (`textarea`) for the active YAML tab.
- Edits are applied directly to the in-memory generated files.
- Updated `Copy` and `Save to Desktop` flows to use edited content.

Impacted file:
- `src/pages/StepReview.tsx`

### 2) WinGet YAML generation: reduced forced quoting
- Removed forced double quotes on most generated fields.
- Added safer scalar formatting that only quotes when needed.
- Added multiline YAML block output (`|-`) for multiline fields (for example `ReleaseNotes`).
- Kept compatibility for values that require quoting (special tokens, controls, leading/trailing spaces, etc.).

Impacted file:
- `src-tauri/src/yaml_generator.rs`

### 3) App version bump
- Bumped application version from `1.0.0` to `1.0.1` across app metadata and UI.

Impacted files:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `src/App.tsx`

## Validation

- TypeScript check: `.\node_modules\.bin\tsc.cmd --noEmit` (passed)
- Rust check: `cargo check` in `src-tauri` (passed)

## Build artifacts and checksums

To be filled after running `npm run tauri build`.
