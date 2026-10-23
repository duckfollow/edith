import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDevelopment } from './dev-process.mjs';
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('@tauri-apps/cli/package.json')), 'tauri.js');
runDevelopment(process.execPath, [cli, 'dev', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../apps/desktop/', import.meta.url)),
});
