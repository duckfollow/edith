# HTTPS inspection (development)

Step-by-step Thai guide: [Proxy setup and usage](proxy-user-guide.md), including macOS Keychain errors and media troubleshooting.

EDITH can inspect HTTPS for selected DNS hostnames or, when explicitly enabled, all DNS hostnames passing through its proxy. This is opt-in TLS interception in the local forward proxy, not packet decryption or automatic system-wide capture. Default behavior remains opaque CONNECT tunneling.

## Setup

1. Start EDITH with `npm run dev` or `npm run dev:team`. In Team mode sign in as Admin for CA creation.
2. Open **Network → Live local proxy → Proxy settings → HTTPS inspection**. Stop the proxy before editing its settings.
3. If no CA exists, click **Create local CA**, or run `npm run ca:create` from the repository root. Requires OpenSSL/LibreSSL. Existing CA directories are never overwritten automatically.
4. Download **public CA** and verify the displayed SHA-256 fingerprint. No private key is available through the API.
5. Configure trust manually on the client. On macOS, import the certificate using Keychain Access, open its Trust settings and explicitly trust it for SSL if needed. EDITH does not modify Keychain or claim to detect whether the OS trusts the CA. Other browsers/apps/devices may use separate stores. Remove trust when finished.
6. Enable **HTTPS inspection**. For selected-host mode, enter up to 32 exact DNS hostnames. Alternatively enable **Inspect all hostnames** to inspect every valid DNS host on port 443 without an allowlist. Optional **Excluded hostnames** accepts up to 32 exact DNS hosts that must remain opaque. No scheme, port, path, wildcard or IP entries.
7. Click **Start proxy**, then configure the test application's HTTP/HTTPS proxy as `127.0.0.1:8899`.
8. Send a request to an allowlisted domain. Completed requests appear with their real method, URL path/query, headers, response status, timings and bounded body previews. Change settings with Stop/Start.

Test only destinations you intend to inspect. Request bodies may contain credentials and personal data. Existing role-based filtering and preview/export rules apply.

## Test without installing system trust

For curl, you can trust the CA only for a single invocation rather than modifying system trust:

```sh
curl --noproxy '' -x http://127.0.0.1:8899 \
  --cacert .local/ca/edith-debug-ca.cert.pem \
  https://YOUR-ALLOWLISTED-HOST/health
```

Replace the hostname with a real test endpoint you control and explicitly add it to the allowlist. Do not use `-k`; the test should validate the certificate. Proxy requests to HTTPS ports other than 443 are still rejected.

## How it works

```text
Client → CONNECT selected-host:443 → EDITH TLS server → verified TLS → Backend
                                     ↓
                           HTTP/1.1 capture and forwarding
```

- For hosts selected by the configured mode, EDITH creates an RSA-2048, SHA-256 leaf certificate with a DNS SAN, serverAuth, CA:FALSE, and random serial, signed by the existing machine-local CA.
- Leaf certificates last one day. In-memory reuse is bounded to 32 certificates and ends before the leaf/CA expiry. Signing is serialized, duplicate pending requests share work, and at most four hostname generations are pending.
- Intermediate signing files live under ignored `.local/ca/leaves/` in private temporary directories and are removed after issuance. Cached leaf keys remain only in process memory. CA private material remains local.
- Client TLS is limited to TLS 1.2+ and advertises HTTP/1.1. CONNECT authority, SNI (when provided), and HTTP Host are bound to the selected host. A client cannot change Host to turn one inspected connection into access to another destination.
- Upstream TLS uses normal certificate verification. There is no insecure-upstream toggle or pinning bypass. This prototype does not add support for private upstream trust roots; environment-specific Node trust setup may be needed separately.
- Nonselected or explicitly excluded hostnames and IP addresses continue as opaque tunnels; their CONNECT 200 reports tunnel establishment only.
- Failed leaf preparation or client TLS is reported as an inspection error, not silently retried as uninspected traffic. Upstream certificate errors appear as failed captured requests/502.
- Captured request/response previews remain capped at 32 KiB each without truncating forwarded data. Binary/compressed payloads remain base64. Completed decrypted requests use `captureKind: "https"` and do not also create a successful CONNECT record.
- Stop closes active TCP and wrapped TLS sockets. Settings and CA trust are never enabled automatically on startup. Inspection settings are process/session configuration, not stored in SQLite.

## Permissions and endpoints

Existing same-origin Host/Origin validation, control token, and workspace/session role checks apply:

- Admin: POST `/__edith_proxy/ca/create` to create a CA while stopped.
- Signed-in Team users or the local workspace: GET `/__edith_proxy/ca` downloads the public PEM certificate only.
- Developer/Admin: POST `/__edith_proxy/start` with `inspection: {enabled:true, domains:[...]}`. Viewer cannot start or reconfigure inspection.
- GET status includes CA readiness, fingerprint and expiry, without exposing private keys or claiming system trust.

OpenSSL is required on the machine running the development server. CA directory/file permissions are POSIX protections; Windows ACL validation has not been completed. Do not expose the proxy listener or development server to untrusted networks.

## Limits

- HTTP/1.1 only; no HTTP/2, HTTP/3/QUIC or WebSocket inspection.
- DNS hostnames only, no wildcards/IP SAN or arbitrary destination ports. All-host mode is explicit and off by default; exclusions are exact matches, not suffix rules.
- Applications that pin certificates or use their own trust stores may reject interception. EDITH does not bypass these checks.
- Mutual TLS/client-certificate forwarding is not implemented.
- There is no automatic system proxy, CA installation, trust removal, CA rotation, or persistent request history.
- Development runtime only; not packaged with desktop releases. Browser UI testing and Windows/Linux TLS validation remain outstanding.

## Verification

Integration tests use temporary CAs and real loopback TLS servers. They verify decrypted POST/body capture, excluded hosts staying opaque, untrusted client CA failure, authority mismatch rejection, upstream certificate verification failure, stop cleanup, missing-CA failure and concurrent starts. Existing HTTP/tunnel tests continue to run. No tests contact third-party sites or install certificates/proxy settings.

## Inspect all hostnames

Stop the proxy, enable HTTPS inspection and **Inspect all hostnames**, optionally enter exclusions, then Start. This applies to every valid DNS hostname whose HTTPS CONNECT traffic actually reaches EDITH on port 443, including background apps. It does not capture apps ignoring the proxy, IP-based destinations, other ports or QUIC. It can expose credentials/private traffic, so keep it limited to deliberate debugging sessions. CA trust and upstream verification requirements remain unchanged. Tests cover all-host routing, exact exclusions, explicit opt-in and IP passthrough; desktop test suite passes 52 tests.

## Settings layout

Proxy settings groups Connection, HTTPS inspection and Local certificate in one expandable panel. Connection shows listen address, live status and an optional example request. Inspection groups enable/all-host switches and selected/excluded hostnames. The certificate card separates readiness, fingerprint, expiry, public download and manual trust instructions. Start/Stop and the running badge stay visible when settings are collapsed. Narrow screens stack the sections vertically.
