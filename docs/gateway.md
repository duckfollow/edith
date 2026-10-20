# Gateway setup

Open **Gateway** in the sidebar. The custom HTML/SVG editor runs in both browser and desktop UI.

1. Choose a loopback listener port (default `8080`).
2. Select a route card or use the route selector.
3. Enter a path prefix and an HTTP/HTTPS backend URL.
4. Choose whether to strip the prefix: `/api/users` becomes `/users` when `/api` is stripped.
5. Use **Add route** for another backend. Drag cards to arrange them; disconnect/reconnect a route with its button or by dragging between the route and backend handles.
6. **Save setup** persists configuration in this browser/webview's local storage. **Export JSON** downloads a versioned configuration file. Node positions are session-only. No credentials should be put in backend URLs.

## Start and stop

Run `npm run demo:api` in a separate terminal. In EDITH development mode, click **Start Gateway** with the default setup, then open `http://127.0.0.1:8080/api/users`. `/api` is stripped and the request reaches `http://localhost:3000/users`.

The listener binds only to `127.0.0.1`. Stop/Start applies edited configuration; saving alone does not change active routes. Stopping closes active connections. Stopping the EDITH development server also stops Gateway. Saved configuration never automatically starts a listener.

Routes match complete path segments, with the longest prefix first. Query strings, HTTP methods and bodies are forwarded, with streaming responses. Hop-by-hop headers are removed. Backend Host is rewritten; X-Forwarded headers are generated locally. Network Inspector retains up to 256 completed Gateway requests. Request and response previews are capped at 32 KiB each; forwarding is not truncated. Binary/compressed previews are base64. Backend connection failures and responses with status 500+ produce up to 256 ERROR logs. Unmatched routes and rejected requests before route selection are not captured. Upstream errors return 502, unmatched paths return 404. Backend idle timeout is 30 seconds and the gateway limits connections to 64. Reserved EDITH ports and the listener port cannot be backend ports.

## Current boundary

Available only through the Vite development runtime, including desktop development. Static web builds and packaged desktop releases do not include this service. The listener is HTTP; HTTPS backend connections validate certificates normally. WebSocket upgrades return 501. TLS termination, health checks, and JSON import are not implemented. The existing forward HTTP proxy in **Network** remains separate.

The Gateway UI is mounted only when opening its menu. The diagram is implemented locally with HTML cards, SVG curves, and Pointer Events; no React Flow dependency is used. React renders this page, while the rest of the workbench remains vanilla TypeScript.

Drag the background to pan. Use +/− to zoom and Fit to show all cards. Cards support arrow-key movement. To connect using a keyboard, activate a route output and then its matching backend input; Escape cancels a pending connection. Card positions are session-only.

## Inspect traffic

Click **View requests** on a selected route to open Network with Gateway and that route selected. Network also has a traffic-source selector and Gateway route filter. SDK and HTTP Proxy/file views keep separate buffers. In Logs choose **Gateway errors** for backend failures. Existing common-credential masking applies in the inspector; bodies and exported records can contain sensitive data. Clear clears the current UI buffer only. Server capture is bounded in memory and resets with the development server.

## Multiple listeners

Use **Add Gateway** and the instance selector to create up to 8 independent Gateways. Each instance has its own port, routes, Save setup, and Start/Stop. For example, Gateway 1 can listen on 8080 and Gateway 2 on 8081. Both can forward to the same backend. Choose unique listener ports; forwarding between running Gateway listeners is rejected to avoid cycles. Stopping one listener leaves the others running.

Instance lists and explicitly saved setups are retained in local storage. Existing single-Gateway setup is retained as Gateway 1. Switching instances keeps unsaved drafts during the current page session; save each setup before reloading. Active listeners continue when switching pages. Restarting EDITH stops all listeners and requires explicit Start again.

Network offers an instance filter as well as route filter; **View requests** selects both. Logs identify the listener port in each Gateway error's source. The shared request/error buffers retain up to 256 records each across all instances.

## Shared routing map

All Gateway instances appear together in one canvas, grouped vertically. Click a listener, route, or backend card to select that Gateway; the setup controls below the map switch to that instance and selected route. The instance selector remains available for keyboard access. Drag cards to arrange them, pan the background, and use Fit to show the full map. Card positions remain session-only. Connections are restricted to a route and its matching backend within the same instance. Running and preview animations are independent for each instance.

Listener cards contain Start/Stop and Preview flow controls with their own running/stopped state. These controls do not start dragging a card; drag the card heading instead. Route/backend cards and connector ports have self-contained styles in the shared canvas. Listener cards are taller to fit controls, and connection paths use their actual center.
