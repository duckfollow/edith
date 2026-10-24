import { readFile, writeFile, copyFile, mkdir, mkdtemp, rm, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, 'apps/desktop/package.json'));
const sharp = require('sharp');
const publicDir = join(root, 'apps/desktop/public');
const iconDir = join(root, 'apps/desktop/src-tauri/icons');
const temp = await mkdtemp(join(tmpdir(), 'edith-icons-'));
try {
  const source = join(publicDir, 'brand/edith-mark.svg');
  const png = join(temp, 'source.png');
  await sharp(source).resize(1024, 1024).png().toFile(png);
  const generated = join(temp, 'generated');
  execFileSync(process.execPath, [require.resolve('@tauri-apps/cli/tauri.js'), 'icon', png, '--output', generated], { stdio: 'pipe' });
  await mkdir(iconDir, { recursive: true });
  // Update the desktop asset set only; mobile icon projects are not part of EDITH.
  for (const file of await readdir(generated)) {
    if (/\.(png|ico|icns)$/.test(file)) await copyFile(join(generated, file), join(iconDir, file));
  }
  const favicon = join(publicDir, 'brand/edith-favicon.svg');
  await sharp(favicon).resize(32, 32).png().toFile(join(publicDir, 'favicon-32.png'));
  // ICO container with PNG frames, preserving alpha at common browser sizes.
  const sizes = [16, 32, 48, 64];
  const frames = await Promise.all(sizes.map(size => sharp(favicon).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index]; header[entry + 1] = sizes[index];
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await writeFile(join(publicDir, 'favicon.ico'), Buffer.concat([header, ...frames]));
  // Decode the native ICNS and PNG files so malformed output fails generation.
  await readFile(join(iconDir, 'icon.icns'));
  for (const size of ['32x32.png', '128x128.png', '128x128@2x.png']) await sharp(join(iconDir, size)).metadata();
  console.log('Generated EDITH smart-glasses icons for desktop and browser.');
} finally { await rm(temp, { recursive: true, force: true }); }
