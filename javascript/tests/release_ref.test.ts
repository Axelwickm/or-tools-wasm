import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const script = resolve(import.meta.dirname, '../../scripts/verify_release_ref.sh');

test('publishing requires a stable push with matching current branch and version tag', () => {
  const root = mkdtempSync(join(tmpdir(), 'ortools-release-'));
  const remote = join(root, 'remote.git');
  const cwd = join(root, 'checkout');
  const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const check = (ref = 'refs/heads/stable', event = 'push') => spawnSync('bash', [script], {
    cwd, encoding: 'utf8', env: { ...process.env, GITHUB_REF: ref, GITHUB_EVENT_NAME: event },
  }).status;
  try {
    mkdirSync(cwd);
    execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
    git('init');
    git('config', 'user.name', 'Release test');
    git('config', 'user.email', 'release@example.invalid');
    mkdirSync(join(cwd, 'javascript'));
    writeFileSync(join(cwd, 'javascript/package.json'), '{"version":"2.0.1"}');
    git('add', '.');
    git('commit', '-m', 'release');
    git('remote', 'add', 'origin', remote);
    git('push', 'origin', 'HEAD:refs/heads/stable');
    assert.notEqual(check(), 0, 'missing tag');
    git('tag', '-a', 'v2.0.1', '-m', 'release');
    git('push', 'origin', 'refs/tags/v2.0.1');
    assert.equal(check(), 0);
    assert.notEqual(check('refs/heads/main'), 0);
    assert.notEqual(check('refs/tags/v2.0.1'), 0);
    assert.notEqual(check('refs/heads/stable', 'workflow_dispatch'), 0);
    git('commit', '--allow-empty', '-m', 'new commit');
    assert.notEqual(check(), 0, 'tag does not match checkout');
    git('push', 'origin', 'HEAD:refs/heads/stable');
    git('checkout', 'v2.0.1');
    assert.notEqual(check(), 0, 'stable advanced after the run started');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
