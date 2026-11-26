import { spawn } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
let port = process.env.PORT || '3000';

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--port' && args[i + 1]) {
    port = args[i + 1];
    i += 1;
  } else if (arg.startsWith('--port=')) {
    port = arg.slice('--port='.length);
  }
}

const wranglerBin = path.resolve(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'
);

const child = spawn(
  wranglerBin,
  ['dev', '--port', String(port), '--ip', '0.0.0.0', '--show-interactive-dev-session=false'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: 'false',
    },
  }
);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 0);
});
