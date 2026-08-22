import { spawnSync } from 'node:child_process';

const check = process.argv.includes('--check');
const agentOnly = process.argv.includes('--agent-only');

// Paths are relative to the repo root; when run with --agent-only (from
// chatdialect/package.json's own format script, cwd=chatdialect/), only
// the agent's own directory is in scope and the path is relative to that
// cwd instead.
const dirs = agentOnly
  ? ['apps/agent']
  : [
      'services/prompt-audio-service',
      'services/quality-gate-worker',
      'services/vosk-worker',
      'services/whisper-worker',
      'chatdialect/apps/agent',
    ];

let failed = false;

for (const dir of dirs) {
  const args = check ? ['-m', 'ruff', 'format', '--check', '.'] : ['-m', 'ruff', 'format', '.'];
  const result = spawnSync('python', args, { cwd: dir, stdio: 'inherit', shell: true });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
