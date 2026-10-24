# EDITH

A local-first, open-source desktop debugging workbench for **macOS, Windows, and Linux**.

EDITH brings local Gateway routing, HTTP inspection, logs, and CPU/RAM monitoring into one workbench. Local mode requires no account; optional Team mode adds login and account management in the development runtime. OS packet capture is still in development.

## Screenshots

Development screenshots; newer Network, per-core CPU cards, account management, and top-bar layouts may differ.

### Overview

Request activity, response times, and HTTP status/method breakdowns.

![EDITH Overview dashboard with request metrics, activity calendar, and response-time graphs](screenshot/Opera%20Snapshot_2026-10-21_000914_127.0.0.1.png)

<details>
<summary>Gateway — visual routing and listener controls</summary>

Configure routes and backends, start or stop listeners, and inspect forwarded requests.

![EDITH Gateway showing the routing canvas, listener controls, and route configuration](screenshot/Opera%20Snapshot_2026-10-21_000954_127.0.0.1.png)

</details>

<details>
<summary>System Monitor — CPU and RAM</summary>

Machine-wide CPU/RAM graphs and per-core usage.

![EDITH System Monitor with CPU and RAM graphs and logical CPU core usage](screenshot/Opera%20Snapshot_2026-10-21_001019_127.0.0.1.png)

</details>

<details>
<summary>Network Inspector — requests and responses</summary>

Filter captured requests by Gateway, route, status, and method.

![EDITH Network Inspector showing a captured Gateway request and traffic filters](screenshot/Opera%20Snapshot_2026-10-21_001038_127.0.0.1.png)

</details>

## Current status

Access control supports a [local workspace policy](docs/access-control.md) and optional [Team accounts with session-based roles](docs/accounts.md). Both currently apply to the development runtime.

Latest: [Management, Proxy settings, and app icons — 24 October 2026](docs/updates-2026-10-24.md).

Appearance: choose **System**, **Light**, or **Dark** from the top bar. Your preference is remembered on this device. See [Appearance](docs/appearance.md).

Previous: [HTTPS inspection — 23 October 2026](docs/updates-2026-10-23.md).

Earlier development notes: [20–21 October 2026 updates](docs/updates-2026-10-21.md).

**Early development — file-based debugging tools with a sample packet explorer. A live local HTTP proxy is available in the development runtime. A JavaScript SDK connects fetch, logs, and errors in development. OS packet capture is not implemented.**

Implemented:

- Per-Gateway [Security rules](docs/gateway-security.md): method allow list, bounded request bodies, and per-IP rate limiting, with blocked requests in Network/Logs. Opt-in and saved in SQLite.

- SQLite persistence for accounts and saved Gateway configurations, with transactional legacy-account migration. See [database storage and migration](docs/database.md).

- Optional Team mode with first-Admin setup, Login/Logout, account creation, role changes, account deactivation, and session revocation.
- Account management with account totals, active/Admin counts, username search, role filters, and an Add account panel. A unified top bar shows the workspace and a single account identity; click it to open Management.

- Local-mode Management with **Workspace & access**, a Local owner card, Network shortcut, and expandable Team setup instructions with a copyable command. See [Accounts and Management](docs/accounts.md).

- Proxy settings grouped into Connection, HTTPS inspection, and Certificate tabs. macOS desktop development supports an optional System Proxy switch, saved-setting recovery, and automatic enabling after Start. HTTPS inspection preferences are remembered locally; certificate trust remains manual. See [the proxy guide](docs/proxy-user-guide.md).

- Gateway setup editor with a custom HTML/SVG canvas: route/backend connections, local save, and JSON export. Run up to 8 loopback HTTP Gateways with independent routes and Start/Stop in development; inspect traffic by Gateway and route.

- System Monitor with real machine-wide CPU/RAM, per-core usage, live graphs, pause, and bounded history.

- Overview with request activity/latency graphs, HTTP status/method breakdowns, and log error totals.

- Opt-in JavaScript SDK with pairing, app selection, fetch instrumentation, and live logs/errors.

- Flipper-inspired workbench with Network, Logs, Storage, and Packets tools.
- Live local HTTP proxy with request/response inspection, plus opt-in HTTPS inspection for selected/all DNS hosts with exact exclusions, plus opaque CONNECT metadata for uninspected hosts (development runtime).
- HAR import with HTTP status/method filters, request/response inspection, and timing details.
- Text/JSONL log import with severity filters and raw-event inspection.
- JSON storage snapshot inspection, validated edits in memory, and export.

- Searchable packet table with protocol/direction filters and selected-packet metadata.
- Explicit sample start/stop, independent display pause, bounded retention, and JSON sample export.
- Native interface discovery command using Rust `pcap` (requires native build and dependencies).
- Browser preview that clearly labels all generated traffic as sample data.

Next: package the local proxy for desktop releases, a restricted platform capture helper, real packet parsing, robust capture lifecycle, PCAP files, and platform release validation. Encrypted traffic will not automatically expose HTTPS content. Per-app attribution is a later platform-specific feature.

See [Accounts and Team mode](docs/accounts.md), [Gateway](docs/gateway.md), [System Monitor](docs/system-monitor.md), [Overview and graphs](docs/overview.md), [SDK setup and demo](docs/sdk.md), [live proxy setup](docs/local-proxy.md), [debug tools and sample files](docs/debug-tools.md), [product scope and architecture](docs/network-monitor.md) and [development setup](docs/development.md).

## Running EDITH

**คู่มือตั้งค่าและใช้งาน Proxy (ภาษาไทย):** [macOS Wi-Fi proxy, CA trust, HTTPS inspection, exclusions, and troubleshooting](docs/proxy-user-guide.md).

Install dependencies once, then start from the repository root:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:1420/**. This starts the web app in Local mode without login or Rust. Keep the terminal running and stop with **Ctrl+C**.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Web app, Local mode |
| `npm run dev:team` | Web app, Team mode with accounts/login |
| `npm run dev:desktop` | Native Tauri app (Rust and platform dependencies required) |
| `npm run dev:api` | Example backend at `127.0.0.1:3000`, run in a second terminal |
| `npm run build:web` | Build frontend files |
| `npm run build:desktop` | Build native application |
| `npm run check` | TypeScript checks |
| `npm run test:desktop` | Desktop tests |

These shortcuts work on macOS, Windows, and Linux without shell-specific environment syntax. `dev` and `dev:team` select their mode explicitly; stop one before starting the other on port 1420. Team setup and account storage are described in [Accounts](docs/accounts.md) and [Database](docs/database.md).

The former root `npm run dev` command is retained as `npm run dev:legacy` for all legacy workspaces. Existing workspace commands below remain available; the default `dev` now starts EDITH only.

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
- **Live HTTP proxy:** in Network, click **Start proxy**, then [configure a test app to use it](docs/local-proxy.md). The default address is `127.0.0.1:8899`; requests are not routed there automatically. HTTPS is opaque by default. Optional [HTTPS inspection](docs/https-inspection.md) exposes selected domains after manually trusting the local CA.
- **SDK connection:** enable the receiver and connect a development app using the [SDK instructions](docs/sdk.md).
- **Packets:** **Start sample** generates sample packets. Live OS packet capture is not implemented.

The preview listens on loopback. If port `1420` is already in use, stop the existing EDITH preview before starting another one.

### Team mode: accounts and roles

Stop any existing EDITH development server before switching modes.

macOS/Linux:

```sh
EDITH_MODE=team npm run dev:web --workspace appsdesktop
```

Windows PowerShell:

```powershell
$env:EDITH_MODE = 'team'
npm run dev:web --workspace appsdesktop
```

Open `http://127.0.0.1:1420/`. On the first run, use the **EDITH first-owner setup token** printed in the server terminal to create an Admin. Usernames require 3–64 allowed characters and passwords require 12–256 characters. Once initialized, sign in with an existing account; public registration is not available.

In **Management**, Admins can search/filter accounts, add users, change roles, and disable accounts. **Apply** becomes available when a row changes. Role or Active-state updates revoke that account's sessions. The last active Admin cannot be disabled or demoted.

The top bar groups workspace context on the left and processing/account information on the right. The account control combines initials, username, and role without duplicate badges; click it to open Management. Local mode shows **Local owner** instead of a signed-in username.

Accounts and saved Gateway setups are stored in ignored `.local/edith.sqlite` (SQLite); legacy accounts.json is migrated without deleting its source; sessions expire after 8 hours and reset when the server restarts. Do not commit the account file or setup token. Team mode currently remains loopback-only development functionality, with no per-Gateway permissions, audit logs, or password recovery yet. See [the account guide](docs/accounts.md) for details and returning to Local mode.

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

A static web deployment supports the UI and file-based tools. The live proxy, Gateway, SDK receiver, and browser CPU/RAM monitor currently depend on the Vite development server and are **not included** in those static files. Use browser development mode above to run those features locally.

### Build the desktop app

With the native dependencies installed, run:

```sh
npm run build --workspace appsdesktop
```

Tauri builds for the current machine's platform. With the default target directory, application bundles/installers are written under `apps/desktop/src-tauri/target/release/bundle`. Building for each OS requires that platform's build environment; Windows and Linux native builds have not yet been verified.

The packaged desktop app includes native CPU/RAM monitoring and interface discovery. The live HTTP proxy, Gateway, and SDK receiver still require the development runtime and have not yet been packaged for desktop releases.

### Run the example API

```sh
npm run demo:api
```

Opens a local test backend at `http://127.0.0.1:3000` with GET/POST users, delayed responses, intentional errors, and JSONL request logs. See [example API instructions](examples/api/README.md) for requests and inspecting them through EDITH's HTTP proxy. Start Gateway with `/api` routed to this API to call `http://127.0.0.1:8080/api/users`.

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

The previous media-storage implementation is retained while the desktop app changes direction. Root-wide build/lint commands may still include legacy packages. The default dev command starts EDITH only; use dev:legacy explicitly for the old Turbo workflow.

## License

EDITH is MIT licensed. Third-party dependencies retain their own licenses. In particular, Windows Npcap distribution requires a separate review; no driver is bundled by this project.
