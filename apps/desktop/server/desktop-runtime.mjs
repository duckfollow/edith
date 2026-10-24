import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWorkspaceDatabase } from './database.mjs';
import { createAccounts } from './accounts.mjs';
import { createAccessMiddleware } from './access-policy.mjs';
import { createGatewayManager } from './gateway-manager.mjs';
import { createSystemMonitor } from './system-monitor.mjs';
import { createSdkBridge } from './sdk-bridge.mjs';
import { createLocalProxy } from './local-proxy.mjs';
import { createHttpsInspector } from './https-inspector.mjs';

export async function startDesktopRuntime({ directory, secret, mode = 'local', port = 0, createScript = fileURLToPath(new URL('../create-debug-ca.mjs', import.meta.url)) } = {}) {
  if (!directory || !/^[a-f0-9]{64}$/.test(secret || '')) throw Error('Missing desktop runtime configuration');
  if (!['local', 'team'].includes(mode)) throw Error('Invalid workspace mode');
  let dispatch;
  const server = http.createServer((req, res) => {
    if (!dispatch) { res.writeHead(503); res.end(); return; }
    void dispatch(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Desktop service request failed' }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  let database, gateway, proxy;
  try {
    database = await openWorkspaceDatabase({ file: join(directory, 'edith.sqlite') });
    const accounts = mode === 'team' ? await createAccounts({ store: database, controlOrigin: origin }) : null;
    const inspector = createHttpsInspector({ directory: join(directory, 'ca'), createScript });
    proxy = createLocalProxy({ controlOrigin: origin, inspector });
    gateway = createGatewayManager({ store: database, controlOrigin: origin });
    const sdk = createSdkBridge({ controlOrigin: origin });
    const monitor = createSystemMonitor({ controlOrigin: origin });
    const access = createAccessMiddleware({ controlOrigin: origin, identity: accounts?.identity });
    const localAccounts = (req, res, next) => {
      if (req.method === 'GET' && req.url === '/__edith_auth/status') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ mode: 'local', initialized: false, user: null }));
      } else return next();
    };
    const stack = [accounts?.middleware || localAccounts, access, gateway.middleware, monitor.middleware, sdk.middleware, proxy.middleware].filter(Boolean);
    dispatch = async (req, res) => {
      const url = new URL(req.url || '/', origin);
      const ingest = url.pathname === '/__edith_sdk/events' && ['POST', 'OPTIONS'].includes(req.method);
      const supplied = Buffer.from(String(req.headers['x-edith-runtime-secret'] || ''));
      const expected = Buffer.from(secret);
      if (!ingest && (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))) {
        res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Desktop session required' })); return;
      }
      let index = 0;
      const next = async () => {
        const middleware = stack[index++];
        if (middleware) await middleware(req, res, next);
        else { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unknown desktop endpoint' })); }
      };
      await next();
    };
    let closing;
    return {
      port: server.address().port, origin, mode,
      setupToken: accounts && !accounts.initialized() ? accounts.setupToken : null,
      stop() {
        return closing ||= (async () => {
          await proxy.stop(); await gateway.stop();
          server.closeAllConnections();
          await new Promise(resolve => server.close(resolve));
          database.close();
        })();
      },
    };
  } catch (error) {
    await proxy?.stop(); await gateway?.stop(); server.closeAllConnections(); server.close(); database?.close(); throw error;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const runtime = await startDesktopRuntime({ directory: process.env.EDITH_DATA_DIR, secret: process.env.EDITH_RUNTIME_SECRET, mode: process.env.EDITH_MODE || 'local' });
  console.log(JSON.stringify({ port: runtime.port, mode: runtime.mode, setupToken: runtime.setupToken }));
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void runtime.stop().finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  // Pipe EOF also handles a crashed/killed parent, preventing orphan listeners.
  process.stdin.resume();
  process.stdin.on('end', shutdown);
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
