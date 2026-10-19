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
