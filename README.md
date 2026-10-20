# EDITH

A local-first, open-source desktop debugging workbench for **macOS, Windows, and Linux**.

EDITH aims to make the traffic entering and leaving your machine understandable: select an interface, start capture, search packets, and inspect endpoints. No account or central server required.

## Current status

**Early development — file-based debugging tools with a sample packet explorer. A live local HTTP proxy is available in the development runtime. A JavaScript SDK connects fetch, logs, and errors in development. OS packet capture is not implemented.**

Implemented:

- System Monitor with real machine-wide CPU/RAM, per-core usage, live graphs, pause, and bounded history.

- Overview with request activity/latency graphs, HTTP status/method breakdowns, and log error totals.

- Opt-in JavaScript SDK with pairing, app selection, fetch instrumentation, and live logs/errors.

- Flipper-inspired workbench with Network, Logs, Storage, and Packets tools.
- Live local HTTP proxy with request/response inspection, plus HTTPS CONNECT destination metadata (development runtime).
- HAR import with HTTP status/method filters, request/response inspection, and timing details.
- Text/JSONL log import with severity filters and raw-event inspection.
- JSON storage snapshot inspection, validated edits in memory, and export.

- Searchable packet table with protocol/direction filters and selected-packet metadata.
- Explicit sample start/stop, independent display pause, bounded retention, and JSON sample export.
- Native interface discovery command using Rust `pcap` (requires native build and dependencies).
- Browser preview that clearly labels all generated traffic as sample data.

Next: package the local proxy for desktop releases, a restricted platform capture helper, real packet parsing, robust capture lifecycle, PCAP files, and platform release validation. Encrypted traffic will not automatically expose HTTPS content. Per-app attribution is a later platform-specific feature.

See [System Monitor](docs/system-monitor.md), [Overview and graphs](docs/overview.md), [SDK setup and demo](docs/sdk.md), [live proxy setup](docs/local-proxy.md), [debug tools and sample files](docs/debug-tools.md), [product scope and architecture](docs/network-monitor.md) and [development setup](docs/development.md).

## Running EDITH

Run all commands below from the repository root. Use **Node.js 22.18+ or 24+** and npm. The same npm commands work on macOS, Windows, and Linux.

### 1. Install dependencies

For a new checkout:

```sh
git clone https://github.com/duckfollow/edith.git
cd edith
npm ci
```

If you already have the repository, open a terminal in its folder and run `npm ci`. Run it again when the lockfile changes.

### Quick start: browser preview

This is the easiest way to run EDITH. It does **not** require Rust, Cargo, Tauri build tools, or a separate API server.

```sh
npm run dev:web --workspace appsdesktop
```

Open **http://127.0.0.1:1420/** and keep the terminal running. Stop it with **Ctrl+C**.

- **Overview, Network, Logs, and Storage:** import files or click **Load demo** for synthetic data.
- **System Monitor:** displays real CPU/RAM of the machine running the development server.
- **Live HTTP proxy:** in Network, click **Start proxy**, then [configure a test app to use it](docs/local-proxy.md). The default address is `127.0.0.1:8899`; requests are not routed there automatically. HTTPS currently shows CONNECT tunnel metadata, without decrypted contents.
- **SDK connection:** enable the receiver and connect a development app using the [SDK instructions](docs/sdk.md).
- **Packets:** **Start sample** generates sample packets. Live OS packet capture is not implemented.

The preview listens on loopback. If port `1420` is already in use, stop the existing EDITH preview before starting another one.

### Desktop development

Install Rust/Cargo, the Tauri prerequisites, and your platform's native capture dependency first; see [development setup](docs/development.md) and the troubleshooting steps below. Then run:

```sh
npm run dev --workspace appsdesktop
```

This opens the native EDITH window and starts its web development server automatically. Stop any browser preview using port `1420` before running this command. Keep the terminal running; **Ctrl+C** stops the development session.

### Build the web frontend

```sh
npm run build:web --workspace appsdesktop
```

The generated frontend files are in `apps/desktop/dist`. This command builds files; it does not start a server.

A static web deployment supports the UI and file-based tools. The live proxy, SDK receiver, and browser CPU/RAM monitor currently depend on the Vite development server and are **not included** in those static files. Use browser development mode above to run those features locally.

### Build the desktop app

With the native dependencies installed, run:

```sh
npm run build --workspace appsdesktop
```

Tauri builds for the current machine's platform. With the default target directory, application bundles/installers are written under `apps/desktop/src-tauri/target/release/bundle`. Building for each OS requires that platform's build environment; Windows and Linux native builds have not yet been verified.

The packaged desktop app includes native CPU/RAM monitoring and interface discovery. The live HTTP proxy and SDK receiver still require the development runtime and have not yet been packaged for desktop releases.

### Run the SDK demo

Start EDITH in browser or desktop development mode, open **SDK connection**, and enable the receiver. In another terminal at the repository root, replace `YOUR_PAIRING_TOKEN` with the token shown in EDITH:

macOS / Linux (Bash or Zsh):

```sh
EDITH_TOKEN='YOUR_PAIRING_TOKEN' npm run demo:sdk
```

Windows PowerShell:

```powershell
$env:EDITH_TOKEN = 'YOUR_PAIRING_TOKEN'
npm run demo:sdk
```

Select the demo app in EDITH to inspect its requests, logs, and errors. Stop the demo with **Ctrl+C**. See [SDK setup and demo](docs/sdk.md) for integration details.

### Troubleshooting: `cargo metadata` not found

If desktop startup fails with `failed to run cargo metadata` and `No such file or directory (os error 2)`, Cargo is either not installed or not available on your terminal's `PATH`. Cargo is installed together with Rust through [rustup](https://www.rust-lang.org/tools/install/).

#### macOS and Linux: Rust / Cargo

Install Rust if it is missing:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Choose the default installation, then load the environment in your current Bash/Zsh terminal. If Rust is already installed, try this step before reinstalling:

```sh
source "$HOME/.cargo/env"
cargo --version
rustc --version
```

For other shells, follow the environment instructions printed by rustup, or reopen your terminal.

#### macOS: native build dependencies

Install Xcode Command Line Tools if they are missing:

```sh
xcode-select --install
```

#### Linux: native build dependencies

On **Ubuntu / Debian** releases providing WebKitGTK 4.1 development packages:

```sh
sudo apt update
sudo apt install build-essential pkg-config curl wget file \
  libwebkit2gtk-4.1-dev libxdo-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev libpcap-dev
```

EDITH needs `libpcap-dev` in addition to the Tauri dependencies because the native app uses the Rust `pcap` crate. For Fedora, Arch, and other distributions, use the matching packages in the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux), plus your distribution's libpcap development package. The commands above are not intended for every Linux distribution.

#### Windows: Rust / Cargo and native build dependencies

1. Download and run the official [Rust installer](https://www.rust-lang.org/tools/install/), selecting the default **MSVC** toolchain for your architecture.
2. Install **Visual Studio Build Tools** with **Desktop development with C++**, including MSVC and a Windows SDK. Install **Microsoft Edge WebView2 Runtime** if it is missing; see the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows).
3. Close and reopen PowerShell or Command Prompt, then check:

```powershell
cargo --version
rustc --version
```

If Rust is installed but Cargo is still not found, temporarily add its default directory to the current **PowerShell** session and check again:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cargo --version
```

If this works, add `%USERPROFILE%\.cargo\bin` to your user's **Path** through Windows Environment Variables, then reopen your terminal. Do not use `source "$HOME/.cargo/env"` in PowerShell or Command Prompt; that command is for Unix shells.

The native `pcap` dependency also requires **Npcap** and the **Npcap SDK** with the library path configured for the selected architecture. Follow the [pcap Windows setup](https://docs.rs/pcap/latest/pcap/#windows) and [development setup](docs/development.md); Npcap is not bundled with EDITH.

#### Retry desktop startup

Once `cargo --version` works and the platform dependencies are installed, run from the repository root on any of the three operating systems:

```sh
npm ci
npm run dev --workspace appsdesktop
```

If you only need the web UI, use the [browser preview](#quick-start-browser-preview) without installing Rust, Cargo, or native capture dependencies. These setup instructions do not imply that Windows and Linux native builds have already been verified.

## Checks

```sh
npm run typecheck --workspace appsdesktop
npm run test --workspace appsdesktop
npm run build:web --workspace appsdesktop
```

## Repository

| Path                                     | Purpose                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `apps/desktop`                           | Active Tauri + Vite/TypeScript network explorer                                |
| `docs`                                   | Product direction, architecture, setup, limitations                            |
| `apps/web`, `apps/api`, `packages/types` | Existing media-platform packages; retained, not needed by the network explorer |

The previous media-storage implementation is retained while the desktop app changes direction. Root-wide build/dev commands may still start those legacy packages; use the desktop-specific commands above.

## License

EDITH is MIT licensed. Third-party dependencies retain their own licenses. In particular, Windows Npcap distribution requires a separate review; no driver is bundled by this project.
