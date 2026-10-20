import { createGateway } from "./gateway.mjs";
export function createGatewayManager({
  controlOrigin = "http://127.0.0.1:1420",
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
