import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { startDesktopRuntime } from './desktop-runtime.mjs';
const secret = randomBytes(32).toString('hex');
async function request(runtime, path, body, extra = {}) {
  const response = await fetch(runtime.origin + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Edith-Runtime-Secret': secret, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, value: await response.json() };
}
test('desktop runtime protects controls, runs real proxy/Gateway/SDK, persists configuration and stops listeners', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'edith-desktop-'));
  const runtime = await startDesktopRuntime({ directory, secret, createScript: fileURLToPath(new URL('../../../scripts/create-debug-ca.mjs', import.meta.url)) });
  t.after(async () => { await runtime.stop(); await rm(directory, { recursive: true, force: true }); });
  assert.equal((await fetch(runtime.origin + '/__edith_gateway/configs')).status, 403);
  assert.equal((await request(runtime, '/__edith_access/policy')).value.manageGateway, true);
  assert.equal((await request(runtime, '/__edith_auth/status')).value.mode, 'local');
  const upstream = http.createServer((_, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"desktop":true}'); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  t.after(() => upstream.close());
  const target = `http://127.0.0.1:${upstream.address().port}`;
  const status = (await request(runtime, '/__edith_proxy/status')).value;
  // The runtime service controls remain protected even with a valid proxy token.
  assert.equal((await fetch(runtime.origin + '/__edith_proxy/start', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Edith-Token': status.token }, body: '{}' })).status, 403);
  const proxy = await request(runtime, '/__edith_proxy/start', { port: 0 }, { 'X-Edith-Token': status.token });
  // Public start rejects port 0; obtain an available real port before starting.
  assert.equal(proxy.response.status, 400);
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  assert.equal((await request(runtime, '/__edith_proxy/start', { port }, { 'X-Edith-Token': status.token })).response.status, 200);
  const body = await new Promise((resolve, reject) => http.get({ hostname: '127.0.0.1', port, path: target }, res => { let data=''; res.on('data',chunk=>data+=chunk); res.on('end',()=>resolve(data)); }).on('error',reject));
  assert.deepEqual(JSON.parse(body), { desktop: true });
  const gatewayStatus = (await request(runtime, '/__edith_gateway/status')).value;
  const gatewayProbe = http.createServer();
  await new Promise(resolve => gatewayProbe.listen(0, '127.0.0.1', resolve));
  const gatewayPort = gatewayProbe.address().port;
  await new Promise(resolve => gatewayProbe.close(resolve));
  const config = { port: gatewayPort, routes: [{ id: 'api', path: '/api', target, enabled: true, strip: true, connected: true }] };
  const gatewayHeaders = { 'X-Edith-Token': gatewayStatus.token };
  assert.equal((await request(runtime, '/__edith_gateway/config', config, gatewayHeaders)).response.status, 200);
  assert.equal((await request(runtime, '/__edith_gateway/start', config, gatewayHeaders)).response.status, 200);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${gatewayPort}/api/users`)).json(), { desktop: true });
  const sdk = (await request(runtime, '/__edith_sdk/status')).value;
  assert.equal((await request(runtime, '/__edith_sdk/enable', {}, { 'X-Edith-Token': sdk.controlToken })).response.status, 200);
  const enabled = (await request(runtime, '/__edith_sdk/status')).value;
  assert.ok(enabled.pairingToken);
  assert.equal((await fetch(runtime.origin + '/__edith_sdk/events', { method: 'POST', headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' }, body:'{}' })).status, 403);
  assert.equal((await fetch(runtime.origin + '/__edith_sdk/events', {
    method: 'POST', headers: { Authorization: `Bearer ${enabled.pairingToken}`, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({ version: 1, appId: 'desktop-test', appName: 'Desktop', instanceId: 'one', events: [{ type: 'log', data: { level: 'INFO', message: 'standalone SDK' } }] }),
  })).status, 202);
  await request(runtime, '/__edith_proxy/stop', {}, { 'X-Edith-Token': status.token });
  assert.equal((await request(runtime, '/__edith_proxy/ca/create', {}, { 'X-Edith-Token': status.token })).response.status, 200);
  const ca = await fetch(runtime.origin + '/__edith_proxy/ca', { headers: { 'X-Edith-Runtime-Secret': secret } });
  assert.match(await ca.text(), /BEGIN CERTIFICATE/);
  assert.match(await readFile(join(directory,'ca/edith-debug-ca.key.pem'),'utf8'), /PRIVATE KEY/);
  await runtime.stop();
  await assert.rejects(fetch(runtime.origin + '/__edith_proxy/status'));
  await assert.rejects(fetch(`http://127.0.0.1:${gatewayPort}/api/users`));
  const restarted = await startDesktopRuntime({ directory, secret });
  try {
    const saved = (await request(restarted, '/__edith_gateway/configs')).value.gateways;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].config.port, gatewayPort);
    assert.equal((await request(restarted, '/__edith_gateway/status')).value.running, false);
  } finally { await restarted.stop(); }
});
test('desktop Team mode enforces setup and session roles, with persistent accounts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'edith-desktop-team-'));
  const runtime = await startDesktopRuntime({ directory, secret, mode: 'team' });
  t.after(async () => { await runtime.stop(); await rm(directory, { recursive: true, force: true }); });
  assert.ok(runtime.setupToken);
  assert.equal((await request(runtime, '/__edith_access/policy')).response.status, 401);
  const setup = await request(runtime, '/__edith_auth/setup', { username: 'owner', password: 'desktop-preview-password', setupToken: runtime.setupToken });
  assert.equal(setup.response.status, 201);
  const cookie = setup.response.headers.get('set-cookie').split(';')[0];
  const policy = await request(runtime, '/__edith_access/policy', undefined, { Cookie: cookie });
  assert.equal(policy.value.role,'admin');
  await runtime.stop();
  const restarted = await startDesktopRuntime({ directory, secret, mode: 'team' });
  t.after(()=>restarted.stop());
  assert.equal(restarted.setupToken,null);
  assert.equal((await request(restarted,'/__edith_access/policy',undefined,{Cookie:cookie})).response.status,401);
});
