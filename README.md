# EDITH

A local-first, open-source desktop debugging workbench for **macOS, Windows, and Linux**.

EDITH aims to make the traffic entering and leaving your machine understandable: select an interface, start capture, search packets, and inspect endpoints. No account or central server required.

## Current status

**Early development — file-based debugging tools with a sample packet explorer. A live local HTTP proxy is available in the development runtime. A JavaScript SDK connects fetch, logs, and errors in development. OS packet capture is not implemented.**

Implemented:

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

See [Overview and graphs](docs/overview.md), [SDK setup and demo](docs/sdk.md), [live proxy setup](docs/local-proxy.md), [debug tools and sample files](docs/debug-tools.md), [product scope and architecture](docs/network-monitor.md) and [development setup](docs/development.md).

## Quick start: browser preview

From the repository root:

```sh
npm ci
npm run dev:web --workspace appsdesktop
```

Open `http://localhost:1420`. In Network, click **Start proxy** and [route a test app through it](docs/local-proxy.md) to see live requests. Alternatively, import a file or click **Load demo** to try synthetic data. The Packets tool has its own **Start sample** control. This preview does not capture network packets.

## Desktop development

Install the Rust toolchain, Tauri prerequisites, and the platform capture dependency first; see [setup](docs/development.md).

```sh
npm run dev --workspace appsdesktop
```

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
