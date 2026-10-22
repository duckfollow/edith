# Gateway Security rules

Request protection applies only to matched HTTP routes passing through EDITH Gateway. It does not configure the operating-system firewall, protect direct access to a backend, or add authentication to application routes.

## Configure

1. Select a Gateway in the shared map or instance cards.
2. Expand **Security rules** below the listener settings.
3. Enable request protection, choose allowed methods, maximum body size (KiB), and requests per IP/minute.
4. Click **Save setup** to persist to SQLite.
5. Stop and Start this Gateway to activate edited rules. Other Gateways are unaffected.

Rules are **off by default**, including for older configurations without a security field. The initial form suggests GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS, 1024 KiB, and 120 requests/minute. These become enforced only after enabling and starting the Gateway with this setup. TRACE is available as an explicit option. Gateway still rejects CONNECT and WebSocket upgrades separately.

Viewer cannot save/change server rules or start a listener. Developer/Admin use existing Gateway permissions and control tokens. The UI preview represents the draft, which can differ from a running listener until restart.

## Rules

| Rule | Response | Behavior |
| --- | --- | --- |
| Method not in allow list | 405 | Includes Allow header |
| Body over configured size | 413 | Checks Content-Length and actual streamed bytes |
| Per-peer rate exceeded | 429 | Includes Retry-After: 60 |

Blocked responses include `X-Edith-Blocked: true` and JSON with the reason. No request is sent to the backend when blocked.

When enabled, EDITH reads the complete bounded request body before opening its upstream connection. This ensures chunked requests cannot partially reach the backend before a size violation is detected. It changes request-upload streaming behavior; responses still stream normally. The size counts incoming bytes, without decompression. Valid range is 0–16384 KiB (16 MiB); zero permits empty bodies only.

Rate limits use a fixed 60-second window starting with the first request from a socket peer IP, per Gateway. The key uses `req.socket.remoteAddress`, not client-supplied X-Forwarded-For. Changing a forwarding header does not bypass it. All matched requests count, including those subsequently rejected by method/body rules. Valid range is 1–100000 per minute. At most 1024 peer entries are tracked per listener; unknown peers are rejected when the map is full until an entry expires. Restarting the listener resets its rate state.

The listener remains loopback-only, so browser, curl and other apps on the same machine generally share an IP bucket. Different Gateway listeners have independent buckets. Requests without a matching route return the existing 404 before these rules; CONNECT/upgrades are also handled separately.

## Inspection

Blocked matched requests enter the bounded Gateway request buffer with status, `blockedReason`, route, and preview of the JSON rejection response. **Network → Gateway** displays them; request details include a **Blocked** reason. **Logs → Gateway errors / blocked** shows WARN events for policy blocks, while backend failures remain ERROR.

Capture and logs remain temporary bounded buffers. Rejected bodies are never kept in full: existing preview limits still apply. Credential/body access policy also applies to viewing these records.

## Storage and compatibility

The optional `security` object is stored inside existing Gateway configuration JSON in SQLite. No schema migration is needed. Export JSON includes rules. Saving validates the configuration again on the server, including when the request is sent outside the UI.

```json
{
  "security": {
    "enabled": true,
    "allowedMethods": ["GET", "POST"],
    "maxBodyBytes": 1048576,
    "requestsPerMinute": 120
  }
}
```

The example is only the Security part; a full Gateway configuration also requires a port and routes. Invalid limits or an empty method list are rejected rather than silently allowing all traffic.

## Scope and verification

IP allow/deny lists, CIDR rules, distributed/persistent rate limits, WAF signatures, TLS termination, and system firewall changes are not included. Rules run only in the existing development Gateway service.

Tests cover method blocking, declared and chunked body size checks, accepted bodies reaching the backend, rejected bodies never reaching it, captured reasons/WARN logs, per-peer rate limits, window reset, forwarding-header spoofing, and invalid configuration. Database tests also reopen saved Security configuration.
