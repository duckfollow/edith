# EDITH JavaScript SDK (development preview)

`@edith/sdk` sends instrumented `fetch` calls, explicit logs, and error reports to the local EDITH development workspace. It requires no System Proxy, curl, or TLS interception. It sees data inside the instrumented application, not other applications or every network stack on the machine.

## Quick demo

1. Start EDITH with `npm run dev:web --workspace appsdesktop`.
2. Expand **SDK connection** above the tools and click **Enable SDK receiver**.
3. Copy the pairing token from the generated snippet. In another terminal, from the repository root:

```sh
EDITH_TOKEN='paste-the-pairing-token' npm run demo:sdk
```

The demo starts a disposable loopback HTTP fixture and instruments real fetch calls to it every five seconds. It reports an intentionally failing checkout and an explicit demonstration error. EDITH selects the first reporting app automatically; choose **EDITH demo app** in **DEBUG TARGET** to return to it. Network shows requests and Logs shows log/error events. Ctrl+C stops the demo; append `-- --once` to run a single cycle. Disable the receiver to revoke pairing and clear the receiver's in-memory records.

No token is committed. No system proxy settings, certificates, or third-party services are used by this demo.

## Integrate in your app

The package is a local workspace package, not published to npm. Another app in this monorepo can add `"@edith/sdk": "*"` to its dependencies and run npm install. For a separate project, use a local file dependency pointing at `packages/sdk`, or pack it locally with npm pack. Do not assume a public package exists.

```ts
import { createEdith } from "@edith/sdk";

const edith = createEdith({
  enabled: import.meta.env.DEV, // Vite example; use your framework's development flag
  appName: "Checkout app",
  appId: "checkout-web",
  endpoint: "http://127.0.0.1:1420/__edith_sdk/events",
  token: "copy-from-the-local-EDITH-setup-panel",
  captureBodies: false,
});

const uninstall = edith.install({ captureConsole: true });
// Existing global fetch calls now report to EDITH.

edith.log("INFO", "Checkout started");
try {
  // your application logic
} catch (error) {
  edith.captureError(error);
}

// On development teardown / hot reload:
// uninstall();      // restores global hooks, keeps the client available
// edith.dispose();  // restores hooks and stops delivery/heartbeats
```

Alternatively avoid global hooks and call `edith.fetch(url, options)` directly. Always dispose the old client during hot reload before creating/installing another one. Install once per app instance. Requests made through a previously cached fetch reference are not captured by a later global installation.

`enabled` defaults to **false**. Keep the initialization inside your application's development path. Never ship pairing tokens or debugging instrumentation enabled in a production build.

## Capabilities and limits

- Initial support targets modern browser JavaScript and Node.js 22+ with fetch, Web Streams, and related platform APIs. React Native, Android/iOS native network stacks, Axios/XHR, WebSockets, and SDKs using their own transport are not supported yet and have not been tested.
- A modern browser's own CORS/private-network restrictions still apply. The initial workflow is a local development app communicating with a loopback EDITH workspace. This SDK does not bypass browser security prompts or application CSP; your development app must allow the local endpoint.
- `fetch` duration measures the time until response headers arrive. It is not a full HTTP transfer or DNS/TLS phase measurement. Reported size uses Content-Length when available, otherwise zero (unknown); it is not measured wire bytes.
- Body previews are **off by default**. When enabled, the SDK captures up to 4 KB of text response bytes and up to 4,096 characters of a string `init.body`. It does not consume FormData, binary uploads, or Request-object bodies. Response previews read a clone; the caller receives its original response. At most 16 previews run concurrently and each preview has a 500 ms total read budget.
- Common authentication/cookie/API-key headers and common credential URL parameters are redacted by the SDK before delivery. Body previews, log messages, error messages, and stacks are not automatically scrubbed.
- Console instrumentation is opt-in. Browser error/unhandled-rejection reporting is installed with global hooks unless `captureErrors: false`. Node process errors are not intercepted; call `captureError` explicitly. SDK delivery does not swallow application fetch failures.
- Delivery is best-effort. A bounded queue retains at most 100 events; batches have at most 10 events. Delivery attempts time out after 3 seconds and failed batches are dropped, not retried indefinitely. Inspect `edith.status()` / `await edith.flush()` for sent/dropped counts and last error. The SDK never logs its own transport failures through captured console hooks.
- SDK transport uses the original fetch reference, avoiding self-report loops. `dispose` drops queued unsent events; flush first when you need a best-effort final delivery. An already in-flight delivery may complete after disposal.
- App identity/heartbeat is reported about every 10 seconds. The UI marks an instance inactive after 30 seconds without activity; this is last-seen information, not an authenticated device identity or a permanent socket connection.

## Receiver and UI

The Vite development plugin mounts `server/sdk-bridge.mjs` at `/__edith_sdk/*`. The receiver is disabled by default. Enabling rotates a random pairing token; disabling clears token, apps, and events. Workspace controls require same-origin/loopback validation and a separate local control token. Ingestion accepts authenticated protocol-v1 JSON requests with the pairing token; CORS is allowed for that opt-in SDK workflow without cookies.

Only a loopback endpoint is accepted by this SDK release. The dev server is bound to loopback. Do not expose it to the LAN or port-forward it. This integration is not a packaged desktop release backend.

The receiver validates an entire batch before adding records, limits JSON requests to 256 KB, supports at most 16 app instances, and retains at most 512 non-heartbeat events. Network and Logs are scoped to the selected instance; Network retains up to 256 records in its view and Logs up to 512. Filters and export continue to work. Selecting **Files / Local proxy** leaves the SDK view; use it before importing other data. Enabling the receiver alone does not connect an app or inspect its network activity.

App IDs and names are supplied by paired clients and are not a security boundary between mutually untrusted developers. Anyone holding the token can submit events. There are no remote code execution, request replay, application storage writes, or database commands in this protocol.

## Verification

SDK/bridge tests exercise real local fetch delivery, pairing rejection, protocol validation, console/fetch restoration, body-preview bounds without consuming the caller's response, error delivery, queue bounds, and receiver failures that leave successful application responses unchanged. They use disposable loopback fixtures. Browser visual behavior, React Native compatibility, and native release packaging remain unverified. The package includes TypeScript declarations, checked independently; the desktop UI passes its TypeScript production build.
