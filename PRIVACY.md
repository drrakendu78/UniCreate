# Privacy Policy

Last updated: 2026-02-19

UniCreate is designed to work locally on your device.

## Summary

- We do not collect personal data.
- We do not run analytics or telemetry.
- We do not sell or share your data.
- We do not use ads or tracking cookies.

## What UniCreate stores locally

UniCreate may store the following on your device:

- Wizard and manifest draft data in local storage.
- Submission history (package id, version, PR URL, date, username) in local storage.
- GitHub token only if you choose "Remember session", stored in OS keychain/credential manager.

This data stays on your machine unless you explicitly submit a pull request to GitHub.

## Network requests

When you use related features, UniCreate sends requests to:

- GitHub API (`api.github.com`) for repository metadata, authentication, PR creation, PR status, and update checks.
- Installer URLs you provide, for hash analysis and installer metadata detection.
- GitHub Releases download URL when you trigger in-app update.

UniCreate does not operate its own backend server for data collection.

## In-app updates

On Windows, UniCreate can perform a silent in-app update:

- It downloads the installer from the official GitHub release URL.
- It closes the app, installs the update silently, then relaunches.
- No additional personal data is collected by UniCreate during this process.

## Data retention and control

You control your local data:

- You can reset app draft data from the app.
- You can clear stored GitHub credentials from the app ("Disconnect").
- You can clear local storage from your system/browser storage for the app context.

## Third-party services

UniCreate relies on GitHub services when features require it.
GitHub processing is subject to GitHub's own privacy policy and terms.

## Contact

If needed, contact the maintainer via the repository:
https://github.com/drrakendu78/UniCreate
