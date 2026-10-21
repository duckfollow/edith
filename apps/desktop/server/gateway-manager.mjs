import { createGateway, validateGateway } from "./gateway.mjs";
export function createGatewayManager({
  controlOrigin = "http://127.0.0.1:1420",
  store,
} = {}) {
  const instances = new Map(),
    records = [],
    logs = [];
  let sequence = 0,
    mutating = false;
  const origin = new URL(controlOrigin),
    hosts = new Set([
      origin.host,
      `127.0.0.1:${origin.port}`,
      `localhost:${origin.port}`,
    ]);
  function get(id) {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw Error("Invalid Gateway ID");
    if (!instances.has(id)) {
      if (instances.size >= 8)
        throw Error("Up to 8 Gateways per development session");
      instances.set(
        id,
        createGateway({
          controlOrigin,
          forbiddenPorts: () =>
            [...instances]
              .filter(([key]) => key !== id)
              .flatMap(([, g]) =>
                g.snapshot().config ? [g.snapshot().config.port] : [],
              ),
          forbiddenListenerPorts: () =>
            [...instances]
              .filter(([key]) => key !== id)
              .flatMap(
                ([, g]) =>
                  g
                    .snapshot()
                    .config?.routes.map((r) =>
                      Number(
                        new URL(r.target).port ||
                          (new URL(r.target).protocol === "https:" ? 443 : 80),
                      ),
                    ) || [],
              ),
          onCapture: (entry, log) => {
            const nextId = ++sequence;
            records.push({
              ...entry,
              id: nextId,
              gatewayId: id,
              gatewayPort: Number(new URL(entry.url).port),
            });
            if (records.length > 256) records.shift();
            if (log) {
              logs.push({
                ...log,
                id: nextId,
                source: `Gateway :${new URL(entry.url).port} ${entry.routePath}`,
              });
              if (logs.length > 256) logs.shift();
            }
          },
        }),
      );
    }
    return instances.get(id);
  }
  async function middleware(req, res, next) {
    const url = new URL(req.url, controlOrigin);
    if (!url.pathname.startsWith("/__edith_gateway/")) return next();
    if (
      !hosts.has(req.headers.host) ||
      (req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (
      url.pathname === "/__edith_gateway/configs" ||
      url.pathname === "/__edith_gateway/config"
    ) {
      const send = (status, data) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify(data));
      };
      if (!store) return send(503, { error: "Database unavailable" });
      if (req.method === "GET" && url.pathname.endsWith("/configs"))
        return send(200, { gateways: store.loadGateways() });
      if (req.method !== "POST" || !url.pathname.endsWith("/config"))
        return send(405, { error: "Method not allowed" });
      try {
        const id = url.searchParams.get("gateway") || "default";
        if (req.headers["x-edith-token"] !== get(id).snapshot().token)
          return send(403, { error: "Invalid control token" });
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return send(415, { error: "JSON required" });
        let text = "";
        for await (const chunk of req) {
          text += chunk;
          if (Buffer.byteLength(text) > 32768)
            return send(413, { error: "Configuration too large" });
        }
        const input = JSON.parse(text);
        const validated = validateGateway(input, Number(origin.port));
        store.saveGateway(id, { version: 1, ...validated });
        return send(200, { ok: true });
      } catch (error) {
        return send(400, {
          error: error.code?.startsWith("ERR_SQLITE")
            ? "Unable to save Gateway. Check for a duplicate port."
            : error.message,
        });
      }
    }
    if (url.pathname === "/__edith_gateway/events" && req.method === "GET") {
      const after = Number(url.searchParams.get("after") || 0);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      if (!Number.isSafeInteger(after) || after < 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid cursor" }));
        return;
      }
      res.end(
        JSON.stringify({
          lastId: sequence,
          records: records.filter((r) => r.id > after),
          logs: logs.filter((r) => r.id > after),
        }),
      );
      return;
    }
    if (req.method === "POST" && mutating) {
      res.writeHead(409);
      res.end();
      return;
    }
    const mutation = req.method === "POST";
    if (mutation) mutating = true;
    try {
      await get(url.searchParams.get("gateway") || "default").middleware(
        req,
        res,
        next,
      );
    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message }));
    } finally {
      if (mutation) mutating = false;
    }
  }
  return {
    middleware,
    stop: async () => {
      await Promise.all([...instances.values()].map((g) => g.stop()));
    },
  };
}
