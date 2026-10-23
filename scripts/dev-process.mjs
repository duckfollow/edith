import { spawn } from 'node:child_process';

// Keep genuine startup failures visible; only an observed user interrupt is clean.
export function runDevelopment(command, args, options = {}) {
  let stopping = false;
  const child = spawn(command, args, { ...options, stdio: 'inherit' });
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      stopping = true;
      if (!child.killed) child.kill(process.platform === 'win32' ? 'SIGTERM' : signal);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  const cleanup = () => {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
  };
  child.on('error', error => {
    console.error(`Unable to start EDITH: ${error.message}`);
    process.exitCode = 1;
    cleanup();
  });
  child.on('exit', (code, signal) => {
    cleanup();
    const interrupted = signal === 'SIGINT' || signal === 'SIGTERM' || code === 130 || code === 143;
    process.exitCode = stopping && interrupted ? 0 : code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
    if (stopping && (interrupted || code === 0)) console.log('EDITH stopped.');
  });
  return child;
}
