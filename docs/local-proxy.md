# Live Network Inspector: local proxy

## What works

The Vite development workspace can start a real loopback HTTP forwarding proxy directly from Network Inspector. Requests routed through it appear automatically without importing a file. It captures HTTP request/response headers, body previews, status, and elapsed time. HTTPS CONNECT is forwarded as an opaque tunnel, with destination and connection setup status/timing only.

This is a **development-runtime feature**. It works with `npm run dev:web --workspace appsdesktop` and the Vite-backed Tauri development window. The helper is not yet packaged into desktop release installers. A standalone production web build has no proxy backend and reports that the local service is unavailable. Native release support needs a packaged runtime/sidecar or Rust implementation and platform validation.

## Use

1. Start the development workspace and open `http://127.0.0.1:1420/`.
2. Choose **Network** and click **Start proxy** (default port 8899).
3. Set your test application's HTTP and HTTPS proxy to `127.0.0.1:8899`, or send a test request:

```sh
curl --noproxy '' -x http://127.0.0.1:8899 http://example.com
```

4. Watch requests arrive. Select a row to inspect Request, Response, or Timing.
5. Click **Stop** when finished. Remove your test app's proxy setting before browsing normally; a stopped proxy cannot forward its traffic.

Only clients that honor the explicit proxy configuration appear. EDITH does not change system settings, install certificates, or intercept all machine traffic. Some applications ignore HTTP proxy settings. `--noproxy ''` ensures curl does not skip the proxy because of a `NO_PROXY` setting; adapt quoting for your shell.

## HTTP and HTTPS boundaries

- HTTP is forwarded upstream as a real request; requests are not mocked or replayed.
- HTTPS CONNECT supports destination port 443. Its status 200 means **tunnel established**, not HTTP 200 from the encrypted endpoint. Duration is connection setup only; size is zero because tunnel payload is not inspected.
- No TLS MITM, trust-store change, certificate bypass, HTTPS body capture, WebSocket inspection, or HTTP/2 decoding is implemented.
- Upgraded connections are rejected. The proxy handles HTTP/1.x forwarding through Node's HTTP library.
- HTTP bodies are streamed to the client unchanged. Capture previews retain only the first 32 KB for each body. Binary and compressed bodies are shown as base64 without decompression. Request encoding and truncation are labeled.
- Timings are measured locally: total elapsed HTTP forwarding or CONNECT setup. DNS/TLS phases are not inferred.

## Controls and retention

- Explicit Start/Stop; no listener starts on page load.
- The proxy binds only `127.0.0.1`, not a LAN interface.
- HTTP processing and TCP tunnels are closed when stopped. If an app keeps using that proxy address after stop, its requests fail until proxy configuration is removed or the proxy restarts.
- The development process owns the listener; reloading the page reconnects to the current session. Closing the development server stops it. Closing a browser tab alone does not stop the proxy.
- Capture stays in memory. The service retains at most 256 completed records, with monotonically increasing IDs and explicit eviction counts. The UI also retains at most 256 live records, newest first.
- Completed HTTP requests appear after their response completes; long-running streams may not appear until completion. HTTPS tunnels appear after setup. Events are polled once per second, up to 200 per poll; extreme rates may evict unseen records.
- Clear empties the current UI view and advances its cursor; it does not stop forwarding. Restarting the proxy creates a new session and clears server retention.
- HAR/demo loading is disabled while the proxy is running, to avoid mixing imported and live records.

## Local access and limits

Control routes use exact loopback Host/Origin validation, no cross-origin response sharing, and a random process-local token for Start/Stop. Changes use JSON POST requests with a custom token header. The forwarding listener is available to processes on the same machine and is not authenticated; do not expose it via port forwarding. Proxy/control destination ports are blocked as upstream targets to prevent self-target loops.

Connections and header sizes are bounded. HTTP upstream inactivity times out after 30 seconds; tunnels time out after 60 seconds idle. Proxy-authorization and hop-by-hop headers are not forwarded upstream. Other headers, including destination credentials, are forwarded normally. Captures can contain secrets: display masking is not redaction, and exports retain original values.

## Implementation and tests

`server/local-proxy.mjs` implements forwarding, CONNECT, bounded capture, lifecycle, and control middleware. `server/vite-proxy-plugin.ts` attaches it to the local development server. `src/live-proxy.ts` handles controls and event polling. There is no browser-to-arbitrary-target fetch: the forwarding happens in the explicitly started local Node helper.

Run `npm run test --workspace appsdesktop`. Integration tests create disposable loopback HTTP/TCP servers and verify actual POST forwarding, hop-header removal, response preview bounds without altering delivery, upstream errors, tunnel byte forwarding, lifecycle races, control access checks, loop rejection, bounded retention/pagination, and bind-failure recovery. Tests make no third-party network requests and change no system proxy settings.
