const roles = {
  viewer: {
    manageGateway: false,
    manageConnections: false,
    viewBodies: false,
    revealCredentials: false,
    exportData: false,
  },
  developer: {
    manageGateway: true,
    manageConnections: true,
    viewBodies: true,
    revealCredentials: false,
    exportData: true,
  },
  admin: {
    manageGateway: true,
    manageConnections: true,
    viewBodies: true,
    revealCredentials: true,
    exportData: true,
  },
};
const secret =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|password|passwd|secret|client[-_]?secret)$/i;
export function accessPolicy(role = "admin") {
  if (!Object.hasOwn(roles, role))
    throw Error("EDITH_ACCESS_ROLE must be viewer, developer, or admin");
  return { role, ...roles[role], mode: "local-workspace" };
}
function maskUrl(value) {
  try {
    const u = new URL(value);
    if (u.username) u.username = "REDACTED";
    if (u.password) u.password = "REDACTED";
    for (const key of [...u.searchParams.keys()])
      if (secret.test(key)) u.searchParams.set(key, "[REDACTED]");
    return u.href;
  } catch {
    return value;
  }
}
export function protectData(value, policy, key = "") {
  if (!policy.manageConnections && /^(token|pairingToken)$/.test(key))
    return "[REDACTED]";
  if (!policy.viewBodies && /^(requestBody|responseBody)$/.test(key))
    return "[Body hidden by workspace policy]";
  if (!policy.revealCredentials && secret.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((v) => protectData(v, policy));
  if (value && typeof value === "object") {
    if (
      typeof value.name === "string" &&
      Object.hasOwn(value, "value") &&
      secret.test(value.name) &&
      !policy.revealCredentials
    )
      return { ...value, value: "[REDACTED]" };
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, protectData(v, policy, k)]),
    );
  }
  if (typeof value === "string" && !policy.revealCredentials) {
    if (/^(url|upstream|target|endpoint)$/i.test(key)) return maskUrl(value);
    if (["raw", "message", "requestBody", "responseBody"].includes(key)) {
      try {
        return JSON.stringify(protectData(JSON.parse(value), policy));
      } catch {
        return value.replace(
          /((?:authorization|cookie|x-api-key|password|access_token|refresh_token|client_secret)\s*[:=]\s*)([^\r\n,;]+)/gi,
          "$1[REDACTED]",
        );
      }
    }
  }
  return value;
}
export function createAccessMiddleware({
  role = process.env.EDITH_ACCESS_ROLE || "admin",
  controlOrigin = "http://127.0.0.1:1420",
  identity,
} = {}) {
  const localPolicy = accessPolicy(role),
    control = new URL(controlOrigin),
    hosts = new Set([
      control.host,
      `127.0.0.1:${control.port}`,
      `localhost:${control.port}`,
    ]);
  return function (req, res, next) {
    const path = req.url?.split("?")[0] || "";
    if (!/^\/__edith_/.test(path)) return next();
    const send = (code, value) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(value));
    };
    const ingestion =
      path === "/__edith_sdk/events" &&
      ["POST", "OPTIONS"].includes(req.method);
    if (ingestion) return next();
    if (
      !hosts.has(req.headers.host) ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return send(403, { error: "Local workspace only" });
    const user = identity?.(req);
    if (identity && !user)
      return send(401, { error: "Login required", code: "LOGIN_REQUIRED" });
    const policy = identity
      ? { ...accessPolicy(user.role), mode: "team", username: user.username }
      : localPolicy;
    if (path === "/__edith_access/policy")
      return req.method === "GET"
        ? send(200, policy)
        : send(405, { error: "Read-only policy" });
    // SDK ingestion keeps its own pairing-token validation. Viewing its records is filtered below.
    if (!ingestion && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const allowed = path.startsWith("/__edith_gateway/")
        ? policy.manageGateway
        : policy.manageConnections;
      if (!allowed)
        return send(403, {
          error: `${policy.role} cannot change this workspace`,
          code: "ACCESS_DENIED",
        });
    }
    if (!policy.revealCredentials || !policy.viewBodies) {
      const end = res.end;
      res.end = function (chunk, ...args) {
        if (
          chunk &&
          String(res.getHeader("Content-Type") || "").includes(
            "application/json",
          )
        ) {
          try {
            chunk = JSON.stringify(
              protectData(JSON.parse(String(chunk)), policy),
            );
            res.removeHeader("Content-Length");
          } catch {
            /* Preserve non-JSON error responses. */
          }
        }
        return end.call(this, chunk, ...args);
      };
    }
    next();
  };
}
