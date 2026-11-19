import os from 'node:os';
import path from 'node:path';

// Groups sessions by the folder they ran in. Copilot worktrees live under
// copilot-worktrees/<repo>/<worktree>, so they are grouped with their repository.
export function projectOf(cwd: string | null, repository: string | null, home = os.homedir()): string {
  if (cwd === home) return '~';
  if (cwd) {
    const parts = cwd.split(path.sep).filter(Boolean);
    const worktrees = parts.indexOf('copilot-worktrees');
    if (worktrees >= 0 && parts[worktrees + 1]) return parts[worktrees + 1];
    if (parts.includes('session-state')) return 'copilot session files';
    if (parts.length > 0) return parts[parts.length - 1];
  }
  if (repository) return repository.split('/').pop() || repository;
  return '(unknown)';
}
