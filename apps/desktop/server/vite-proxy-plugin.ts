import { createAccounts } from "./accounts.mjs";
import { fileURLToPath } from "node:url";
import { createAccessMiddleware } from "./access-policy.mjs";
import { createGatewayManager } from "./gateway-manager.mjs";
import { createSystemMonitor } from "./system-monitor.mjs";
import type { Plugin } from "vite";
import { createSdkBridge } from "./sdk-bridge.mjs";
import { createLocalProxy } from "./local-proxy.mjs";
export function localProxyPlugin(): Plugin {
  let gateway: ReturnType<typeof createGatewayManager>;
  let proxy: ReturnType<typeof createLocalProxy>;
  return {
    name: "edith-local-debug-proxy",
    async configureServer(server) {
      const port = server.config.server.port || 1420;
      // @ts-expect-error Node environment configuration
      const mode = process.env.EDITH_MODE || "local";
      if (!["local", "team"].includes(mode))
        throw Error("EDITH_MODE must be local or team");
      const accounts =
        mode === "team"
          ? await createAccounts({
              file: fileURLToPath(
                new URL("../../../.local/accounts.json", import.meta.url),
              ),
              controlOrigin: `http://127.0.0.1:${port}`,
              // @ts-expect-error Node environment configuration
              setupToken: process.env.EDITH_SETUP_TOKEN || undefined,
            })
          : null;
      if (accounts && !accounts.initialized())
        server.config.logger.info(
          `EDITH first-owner setup token: ${accounts.setupToken}`,
        );
      if (accounts)
        server.middlewares.use((req, res, next) => {
          void accounts.middleware(req, res, next).catch(() => {
            res.statusCode = 500;
            res.end("Account service unavailable");
          });
        });
      server.middlewares.use(
        createAccessMiddleware({
          controlOrigin: `http://127.0.0.1:${port}`,
          identity: accounts?.identity,
        }),
      );
      proxy = createLocalProxy({ controlOrigin: `http://127.0.0.1:${port}` });
      gateway = createGatewayManager({
        controlOrigin: `http://127.0.0.1:${port}`,
      });
      server.middlewares.use((req, res, next) => {
        void gateway.middleware(req, res, next).catch(() => {
          res.statusCode = 500;
          res.end("Gateway control failed");
        });
      });
      const bridge = createSdkBridge({
        controlOrigin: `http://127.0.0.1:${port}`,
      });
      const systemMonitor = createSystemMonitor({
        controlOrigin: `http://127.0.0.1:${port}`,
      });
      server.middlewares.use(systemMonitor.middleware);
      server.middlewares.use((req, res, next) => {
        void bridge.middleware(req, res, next).catch(() => {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end("SDK bridge failed");
          } else res.destroy();
        });
      });
      server.middlewares.use((req, res, next) => {
        void proxy.middleware(req, res, next).catch(() => {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end("Local proxy control failed");
          } else res.destroy();
        });
      });
      server.httpServer?.once("close", () => {
        void proxy.stop();
        void gateway.stop();
      });
    },
    async closeBundle() {
      await proxy?.stop();
      await gateway?.stop();
    },
  };
}
