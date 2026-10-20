# Development setup

## Frontend preview

Use Node.js 22.18+ or Node.js 24+ for the built-in TypeScript test runner, npm, and the repository lockfile:

```sh
npm ci
npm run dev:web --workspace appsdesktop
```

The preview binds to `127.0.0.1:1420`, uses no external services, and generates only sample records. JSON export is a browser-style download; native webview download behavior still requires platform validation. It is not PCAP export.

## Native app

Install a stable Rust toolchain using the official rustup instructions, then the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. Rust was not available in the initial development environment; a frontend build does not establish that the native app compiles.

### macOS

Install Xcode Command Line Tools. `pcap` links to the platform libpcap. Interface enumeration does not guarantee capture access; a later capture helper must handle BPF permissions. Do not run the desktop webview as root.

### Windows

Install the Rust MSVC toolchain, Visual Studio C++ build tools, and WebView2 as required by Tauri. Install Npcap and configure the Npcap SDK/library path for `pcap` according to [its instructions](https://docs.rs/pcap/latest/pcap/). The app does not bundle Npcap. Respect [Npcap licensing](https://npcap.com/oem/redist), including separate redistribution requirements.

### Linux

Install Tauri's WebKitGTK/build prerequisites and the libpcap development package for your distribution (for example `libpcap-dev` on Debian-based systems). Capture permissions must be scoped to the future helper; do not grant privileges to the whole desktop app.

### Run and check

```sh
npm run dev --workspace appsdesktop
npm run build --workspace appsdesktop
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

The Tauri config starts the desktop's own Vite server and builds `apps/desktop/dist`; it does not depend on the old Next.js frontend or NestJS API.

## Current behavior

- Native launch lists interfaces using `list_interfaces`. Errors are shown in the sidebar.
- Selecting a discovered interface explains that it is discovery-only.
- Sample mode is explicit. Start/stop controls the generator; Pause view freezes a snapshot while generation continues.
- The session retains up to 1,500 rows; the table shows the newest 250 matching rows, newest first. Session byte/packet totals include evicted rows. Clear resets the session counters and buffer while preserving whether the generator is running.
- Search, filters, selected details, and export operate on the paused snapshot when paused.
- No payload is captured, saved, or uploaded. Generated TLS rows are illustrative metadata, not a protocol decoder.

## Validation before release

Run the frontend checks from the README, then build and test each native platform. Real capture must not be enabled before its privilege boundary, parsing limits, shutdown, concurrency, and permission errors are tested. Automated cross-platform builds and packaging are still pending.

## Initial verification

- Dependency installation with `npm ci --ignore-scripts` completed.
- Desktop frontend TypeScript check and production build passed.
- Eight model tests pass across packet retention/filtering, HAR parsing, credential masking, log normalization, and storage snapshot edits.
- Native compilation and interface enumeration remain unverified: Cargo/Rust was not available.
- Browser visual/interaction inspection was blocked by the browser permission gate.
- Real network capture is not implemented or tested in this milestone.

## Debug workbench

See [Debug Tools](debug-tools.md) for imports, formats, sample fixtures, export behavior, and live-integration boundaries. The browser preview supports HAR, text/JSONL logs, and JSON snapshots without a native build. `packet-tool.ts` contains the original packet explorer; `main.ts` composes the workbench.

## Local proxy runtime

The Vite plugin exposes same-origin local proxy controls. See [setup and boundaries](local-proxy.md). It runs in Node with built-in modules and needs no additional npm dependencies. The packaged desktop build still needs a bundled backend implementation; the UI reports an unavailable service outside the development runtime. The test script includes loopback proxy integration tests.

## SDK development

`packages/sdk` contains the opt-in JavaScript client and TypeScript declarations. Run `npm run test:sdk` at the root for client tests; desktop tests include receiver validation. See [SDK integration and the runnable demo](sdk.md). The receiver is integrated into the same Vite development plugin as the proxy and is disabled until explicitly enabled in the UI.

## Interface icons

Desktop icons use the `lucide` package through `src/icons.ts`. Import only the icons used by the UI. Keep decorative SVGs hidden from assistive technology, preserve button text/accessible names, and use `setIconLabel` when changing a control state so its icon changes with its label. Icons are bundled locally; no CDN is required.

## Visual theme

The desktop uses shared `--gh-*` dark theme tokens declared in `src/styles.css` and GitHub-inspired component styling in `src/workbench.css`. The contribution-style request calendar uses five fixed green intensity steps and reports retained data rather than fabricated historical activity. See [Overview definitions](overview.md).

## System Monitor

See [System Monitor](system-monitor.md) for CPU/RAM semantics and sampling lifecycle. The desktop now includes a native `sysinfo` command; native CPU/memory tests compile and pass on the current macOS machine. The development server has a Node OS provider for the browser preview. This newer validation supersedes the earlier missing-Cargo note for this command only; Windows/Linux and interface-capture behavior remain unverified.
