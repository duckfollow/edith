# EDITH Debug Tools

EDITH now has a desktop workbench with Overview, Gateway, System Monitor, Network, Logs, Storage, and Packets tools. See [Overview graphs and metric definitions](overview.md). The interaction model is inspired by [Flipper](https://github.com/facebook/flipper): choose a tool, filter records, and inspect a selected item. EDITH is not a Flipper-compatible plugin host, and does not reuse its SDK or connect to devices yet.

## Capability matrix

| Tool    | Works now                                                                                                                                                   | Data connection                                                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Network | Live HTTP proxy in development; import HAR, filter method/status/text, inspect request and response headers/bodies, inspect timings, export normalized JSON | Explicitly started local proxy, user-selected HAR file, or explicit demo      |
| Logs    | Import text/JSONL, filter severity/text, inspect original event, export matching events as JSON                                                             | User-selected UTF-8 file or explicit demo                                     |
| Storage | Import a JSON object, search keys/values, validate and apply JSON edits to a snapshot, export the full snapshot                                             | In-memory copy of user-selected JSON or explicit demo                         |
| Packets | Start/stop generated packets, freeze display, filter/search, inspect metadata, export JSON; native read-only interface discovery                            | Explicit sample generator; native discovery still requires build verification |

The development runtime now supports [live HTTP proxy inspection](local-proxy.md). HTTPS CONNECT remains opaque by default; exact selected domains can use [opt-in HTTPS inspection](https-inspection.md) after manual CA trust. A local JavaScript [SDK](sdk.md) now reports fetch/log/error events for selected app instances. Database, layout, and mobile-device integrations are not implemented.

## Try it

Run the desktop frontend preview using the README instructions. Select Network, Logs, or Storage and click **Load demo**. Each source banner explicitly labels generated examples. To try file imports, use:

- `examples/debug-data/checkout.har`
- `examples/debug-data/checkout.jsonl`
- `examples/debug-data/storage.json`

These files contain synthetic data only. Nothing is sent to `example.test`, and importing a request never replays it.

In Network, select the 504 checkout request and switch between Overview, Request, Response, and Timing. In Logs, filter ERROR to locate the related payment timeout. In Storage, select a key, enter valid JSON, and apply it to the snapshot. Export saves a separate copy; it does not write back to the source file or connected application.

## Import and export contracts

- Inputs are limited to 10 MB and 5,000 HAR entries/log lines/storage keys. Tables render at most 500 matches.
- HAR requires `log.entries` with request URL and response objects. Missing header/body/timing data remains unavailable, not fabricated. Base64 bodies remain encoded. Binary response data may not have text.
- Logs accept plain text and JSONL. JSON keys `level`/`severity`, `message`/`msg`, `timestamp`/`time`, and `source`/`name` are recognized. Numeric Pino levels and epoch-millisecond timestamps are supported. Unrecognized lines remain available as plain-text events.
- Storage requires a top-level JSON object. JSON edits are parsed before application; malformed edits do not replace the previous value. Special property names remain data properties.
- Network export is **normalized EDITH inspection JSON**, not a HAR file and not importable as HAR. Logs export is a JSON document, not JSONL. Storage exports a plain JSON object that can be reimported.
- Network and Logs export matching records, up to the full imported set, even when the table only renders 500 rows. Storage exports the complete snapshot.
- Loaded data and snapshot edits are held in memory and are lost on page reload. Tools retain their state when switching between them. A started packet sample generator continues until stopped, including while another tool is visible.

## Sensitive data

Common authorization/cookie/API key headers and common credential URL parameters are masked initially. Reveal explicitly toggles their display; this does not mutate the original records. Bodies and log messages are not automatically redacted. Exports include original values, regardless of display masking. Imports are processed locally without upload, replay, or persistence. In live proxy mode, requests are deliberately forwarded to their requested upstream destinations.

## Implementation boundaries

`main.ts` owns the workbench and registered built-in tools; `debug-model.ts` handles import validation, filtering, and display masking; `packet-tool.ts` preserves the existing packet explorer. Untrusted file strings are inserted using DOM text content, not HTML. The built-in registry is not an arbitrary code loader or third-party plugin API.

A future live integration needs an explicit transport and protocol: app identity, authenticated local connection, bounded messages, version negotiation, disconnect handling, and opt-in event delivery. Per-app storage/database writes need separate permission and validation paths. OS packet capture remains a separate privilege boundary.

## Verification

Frontend TypeScript and production build pass. Model and loopback proxy integration tests cover retention, filters, HAR validation, credential masking, mixed log formats, JSON validation, and special storage keys. Browser visual/interaction verification remains unavailable after the previous browser permission rejection. Native build/interface discovery remain unverified because Rust/Cargo is absent. No native capture capability was added by this change.

## Network activity layout

Network Inspector places captured traffic first. A summary row shows retained HTTP requests, failed/4xx/5xx requests, average duration, and the selected source. CONNECT tunnels are excluded from these summary metrics. These values describe the retained source/route/instance selection before method, status, or text filters; they are not lifetime counters. Duration semantics depend on the source, including SDK fetch-to-headers timing.

The search field sits above the source and request filters. Gateway adds instance and route selectors. The table retains method, status, URL, duration, and size, with a source label on each request. The inspector sits alongside the table on wider screens and below it on narrower screens.

The HTTP proxy controls remain available. Port, setup guidance, and the sample curl command are inside **Connection settings & example request**. Expanding this section does not start the proxy; **Start proxy** is still an explicit action. This layout change does not alter forwarding, credential masking, import/export, or capture limits.

## Packet sources panel

Packets has a contextual **Packet sources** panel instead of another EDITH logo and Local Workspace header. The app's main sidebar remains the only application branding/navigation area.

The panel contains **All traffic**, interface discovery/refresh, and **Sample network**. Browser preview explains that native interface discovery requires the desktop app. Selecting an interface does not start real capture. The page title is **Packets**, with the **PACKET EXPLORER** label to distinguish sample transport data from Network Inspector's HTTP requests.

Sample start/stop, display pause, filters, JSON export, and interface discovery retain their existing behavior. The contextual panel remains hidden at the existing narrow-screen breakpoint.
