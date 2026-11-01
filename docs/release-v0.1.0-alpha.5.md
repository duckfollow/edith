# EDITH v0.1.0-alpha.5

This Alpha adds official release checks and a clearer sidebar footer.

## What’s new

- Open **Updates** at the bottom of the sidebar to see the installed version, check for a newer release, read release notes, and open the download page.
- Automatically check official `duckfollow/edith` GitHub releases after startup, at most once per day. Manual checks bypass that interval.
- Alpha builds receive newer alpha and stable releases; stable builds receive stable releases only. Drafts and invalid version tags are ignored.
- Show a **New** badge when an update is available, along with the last successful check time and useful connection/rate-limit errors.
- Keep Updates at the bottom while the tool list scrolls independently.
- Replace duplicate footer version labels and the static Offline workspace label with compact EDITH branding and one version badge.
- Include companion links for Dum-E, Ultron, and u.

## Download and installation

- Apple Silicon Macs (arm64), macOS 13.5 or later.
- Download `EDITH_0.1.0-alpha.5_aarch64.dmg`, quit EDITH, open the DMG, and replace EDITH in Applications.
- Finish active debugging work and stop listeners before quitting. Existing application settings are retained.
- `SHA256SUMS.txt` contains the installer checksum.
- The app bundles its local Node.js runtime; no separate Node installation is required.
- Downloads and installation remain manual. Update checks send the EDITH version to GitHub without workspace traffic, logs, or credentials.
- The app is ad-hoc signed, not Developer ID signed or Apple notarized. macOS may block downloaded builds; see the [installation guide](https://github.com/duckfollow/edith/blob/main/docs/desktop-runtime.md#install-and-open-on-macos).
- Intel Macs, Windows, and Linux installers are not included in this release.

## Validation

- 63 frontend/service tests passed, including runtime IPC, local services, access controls, storage, appearance, and close handling.
- 9 native unit tests passed, including release selection and release-note handling.
- TypeScript and production frontend build passed.
- Native arm64 app and DMG built with the bundled official Node runtime.
- App signature and DMG integrity verified before upload.
- Opened the packaged app without Vite and manually checked GitHub releases successfully.

This remains an Alpha. Independent installation testing on another Mac remains pending.
