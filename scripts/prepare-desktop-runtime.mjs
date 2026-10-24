import { mkdir, readFile, writeFile, copyFile, readdir, chmod, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = 'v24.22.1';
if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) throw Error('Packaged runtime is currently supported on macOS arm64/x64 only');
const name = `node-${version}-darwin-${process.arch}`;
const archive = `${name}.tar.gz`;
const cache = join(root, 'node_modules/.cache/edith-runtime');
const output = join(root, 'apps/desktop/src-tauri/runtime');
await mkdir(cache, { recursive: true });
async function download(url) { const response = await fetch(url); if (!response.ok) throw Error(`Download failed: ${response.status} ${url}`); return Buffer.from(await response.arrayBuffer()); }
const sums = (await download(`https://nodejs.org/dist/${version}/SHASUMS256.txt`)).toString();
const expected = sums.split('\n').find(line => line.trim().endsWith(`  ${archive}`))?.split(/\s+/)[0];
if (!expected || !/^[a-f0-9]{64}$/.test(expected)) throw Error('Official Node checksum missing');
const archivePath = join(cache, archive);
let data;
try { data = await readFile(archivePath); } catch { data = await download(`https://nodejs.org/dist/${version}/${archive}`); await writeFile(archivePath, data); }
if (createHash('sha256').update(data).digest('hex') !== expected) throw Error('Node binary archive checksum mismatch');
await rm(output, { recursive: true, force: true });
await mkdir(join(output, 'server'), { recursive: true });
execFileSync('/usr/bin/tar', ['-xzf', archivePath, '-C', cache, `${name}/bin/node`, `${name}/LICENSE`]);
await copyFile(join(cache, name, 'bin/node'), join(output, 'node'));
await chmod(join(output, 'node'), 0o755);
await copyFile(join(cache, name, 'LICENSE'), join(output, 'NODE-LICENSE.txt'));
for (const file of await readdir(join(root, 'apps/desktop/server'))) {
  if (file.endsWith('.mjs') && !file.endsWith('.test.mjs')) await copyFile(join(root, 'apps/desktop/server', file), join(output, 'server', file));
}
await copyFile(join(root, 'scripts/create-debug-ca.mjs'), join(output, 'create-debug-ca.mjs'));
await writeFile(join(output, 'runtime-version.json'), JSON.stringify({ node: version, architecture: process.arch, archiveSha256: expected }, null, 2));
console.log(`Prepared official Node ${version} (${process.arch}), verified SHA-256, and EDITH services.`);
