import { runDevelopment } from './dev-process.mjs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const args=process.argv.slice(2);
const team=args.includes('--team');
const mode=team?'team':'local';
const vite=join(dirname(require.resolve('vite/package.json')),'bin/vite.js');
console.log(`Starting EDITH in ${mode} mode`);
runDevelopment(process.execPath,[vite,'--host','127.0.0.1',...args.filter(arg=>arg!=='--team')],{
 cwd:fileURLToPath(new URL('../apps/desktop/',import.meta.url)),
 env:{...process.env,EDITH_MODE:mode},stdio:'inherit',
});
