# EDITH — Local Network Monitor

## Product

An open-source desktop app that makes local network traffic understandable on macOS, Windows, and Linux. Install, grant capture permissions, select an interface, and explicitly start capture. No central server, account, or telemetry is required.

## Repository findings

The repository at `/Users/tankps/Documents/project-github/edith` is clean on `main` and already contains a Tauri 2 desktop scaffold with Vite and TypeScript, a Next.js web app, a NestJS API, and shared types. The README describes the previous media-storage product. The desktop configuration currently targets the web app at port 3000 and its exported output; the desktop's own frontend is still the starter template. Rust/Cargo was not found on PATH in this session.

Keep existing API/web code intact during the first milestone. Update the root README to describe the new direction and clearly label the older packages. Use the desktop Vite frontend directly, correcting Tauri development/build hooks and output paths. Retain TypeScript initially; introducing React is optional and should have a concrete UI benefit.

## First release scope

- Enumerate local network interfaces with capture availability and useful error messages.
- Explicit start/stop capture and a separate pause-display control.
- Packet table: timestamp, source/destination addresses and ports, protocol, captured length, and direction.
- Search and protocol/direction filters; selected-packet details.
- Bounded memory and batched UI updates, with visible buffer eviction and capture-drop counts where available.
- Clearly labeled sample mode for browser previews and development without capture permission.

Real capture is not complete until the privilege boundary and start/stop lifecycle have been tested. A sample interface must never claim to show live machine traffic.

## Architecture

```text
Tauri desktop UI (TypeScript, ordinary user permissions)
                  ↕ typed, bounded messages
Rust capture controller and packet parser
                  ↕ restricted local IPC
Platform capture helper
                  ↕
libpcap (macOS/Linux) / Npcap (Windows)
```

The privileged helper accepts a small validated command set: list interfaces, start a bounded capture, stop capture, and report status. Do not expose arbitrary shell commands, arbitrary file writes, or remotely accessible listeners. The helper's identity, installation, elevation, and IPC authentication need platform-specific implementation. Never elevate the entire webview application.

The controller owns lifecycle states `idle`, `starting`, `running`, `stopping`, and `error`. Serialize transitions and reject concurrent start requests. Tag sessions so late events from a previous capture cannot appear in the next session. Stop and release the interface on window shutdown. Pausing the display does not stop capture; show this distinction clearly.

Parse packets in Rust and send metadata batches, rather than one UI event for every raw frame. Begin with configurable fixed buffer limits and document them. Distinguish wire length from captured length. Derive rates from monotonic time and byte counters, not table row counts. Avoid retaining payload bytes by default.

## Packet model

```ts
interface PacketSummary {
  id: number;
  sessionId: string;
  timestamp: string;
  interfaceId: string;
  sourceAddress: string | null;
  destinationAddress: string | null;
  sourcePort: number | null;
  destinationPort: number | null;
  protocol: string;
  direction: "inbound" | "outbound" | "local" | "unknown";
  wireLength: number;
  capturedLength: number;
}
```

Do not assume every frame is Ethernet, IPv4, or TCP. Respect the capture link type, bounds-check truncated headers, and keep unsupported frames visible as unsupported instead of mislabeling them. Determine direction against selected-interface addresses, including IPv6. Unknown and local traffic remain valid states.

## Limits users must understand

- HTTPS and other encrypted protocols do not automatically expose URL paths, bodies, or messages.
- Process/app attribution requires separate operating-system integration; packet capture alone is insufficient.
- VPN, loopback, and physical interfaces can show different traffic or duplicate observations.
- This captures selected interfaces on the user's machine, not every device on the network.
- Cross-platform compatibility remains unverified until tested on each OS.

## Delivery plan and acceptance

### Milestone 1 — Desktop foundation

Replace the starter screen with interface selection, capture-state controls, packet table, search/filter, empty/error states, and selected-packet details. Sample mode is visibly labeled and independent from native capture. Fix desktop scripts and Tauri paths. Frontend type checking and production build must pass.

### Milestone 2 — Native read-only discovery

Add typed commands for interface enumeration and environment diagnostics. Surface missing library/driver and permission errors without suggesting the application is connected. Add a Rust toolchain setup guide.

### Milestone 3 — Real packet capture

Implement the platform helper, bounded capture pipeline, robust packet parsing, cancellation, session handling, and dropped-packet reporting. Verify against known local TCP/UDP traffic with explicit capture authorization.

### Milestone 4 — Files and release

Add PCAP import/export with explicit save actions, size limits, and malformed-file handling. Build on macOS, Windows, and Linux CI. Document platform permissions and dependencies, signing, supported architectures, and release limitations.

## Validation

Meaningful parser fixtures: truncated frames, Ethernet/VLAN where supported, IPv4/IPv6, TCP/UDP, non-IP and unsupported link types. Lifecycle tests: double start, stop during start, interface disconnect, permission denial, old-session events, and window shutdown. Buffer tests: bounded memory under sustained traffic and visible eviction accounting. UI checks: search/filter combinations, no results, packet selection after eviction, and pause semantics.

Never report a native build or real capture as passing when only sample data was tested.

## Dependencies and licensing

Use Tauri 2 and Rust with the `pcap` crate for the capture integration. macOS/Linux use libpcap; Windows commonly uses Npcap. Npcap has separate installation and redistribution terms: do not bundle its installer unless the applicable license permits it. Initially document separate Windows installation. Existing MIT licensing does not automatically cover third-party redistribution rights.

References:

- [Tauri architecture](https://tauri.app/concept/architecture/)
- [Rust pcap](https://docs.rs/pcap/latest/pcap/)
- [Capture privileges](https://wiki.wireshark.org/CaptureSetup/CapturePrivileges)
- [Npcap distribution](https://npcap.com/oem/redist)

## Implementation status

The desktop starter has been replaced with a functional sample-mode explorer. Search, protocol/direction filters, start/stop, display pause, bounded rows, packet selection, and JSON export work locally. Rust interface enumeration is implemented using pcap; live capture remains unavailable until the restricted helper and native lifecycle are implemented and verified. Sample mode is never labeled live capture. The native build requires a Rust toolchain and platform capture dependencies.

## Debug workbench expansion

The desktop now includes Network (HAR), Logs (text/JSONL), and Storage (JSON snapshot) tools alongside Packets. These are functional local file tools, not connected-app plugins or a claim of Flipper compatibility. See [tool capabilities and limitations](debug-tools.md). The capture-helper roadmap above remains pending.

## Live HTTP inspection

The development runtime now has an explicitly started loopback HTTP proxy with bounded body previews and HTTPS CONNECT destination metadata. This is application proxying, separate from OS packet capture. See [local proxy architecture, setup, and limits](local-proxy.md). Native release packaging for this runtime remains pending.
