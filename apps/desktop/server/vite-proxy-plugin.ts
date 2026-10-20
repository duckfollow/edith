import { createSystemMonitor } from "./system-monitor.mjs";
import type { Plugin } from "vite";
import { createSdkBridge } from "./sdk-bridge.mjs";
import { createLocalProxy } from "./local-proxy.mjs";
export function localProxyPlugin(): Plugin {
  let proxy: ReturnType<typeof createLocalProxy>;
  return {
    name: "edith-local-debug-proxy",
    configureServer(server) {
      const port = server.config.server.port || 1420;
      proxy = createLocalProxy({ controlOrigin: `http://127.0.0.1:${port}` });
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
      });
    },
    async closeBundle() {
      await proxy?.stop();
    },
  };
}
