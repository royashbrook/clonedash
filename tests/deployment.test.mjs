import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('production accepts only successful trusted main pushes or manual main runs', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const expression = workflow.match(/    if: >-\n([\s\S]*?)    runs-on:/)[1];
  const accepts = new Function('github', `return (${expression});`);
  const github = {
    repository: 'owner/game', event_name: 'workflow_run', ref: 'refs/heads/main',
    event: { workflow_run: { conclusion: 'success', event: 'push', head_branch: 'main', head_repository: { full_name: 'owner/game' } } },
  };
  assert.equal(accepts(github), true);
  for (const [field, value] of [['conclusion', 'failure'], ['conclusion', 'cancelled'], ['event', 'pull_request'], ['head_branch', 'feature'], ['head_repository', { full_name: 'fork/game' }]]) {
    const rejected = structuredClone(github);
    rejected.event.workflow_run[field] = value;
    assert.equal(accepts(rejected), false, field);
  }
  assert.equal(accepts({ ...github, event_name: 'workflow_dispatch', event: {} }), true);
  assert.ok(!accepts({ ...github, event_name: 'workflow_dispatch', ref: 'refs/heads/feature', event: { workflow_run: {} } }));
  assert.ok(workflow.includes('ref: ${{ github.event.workflow_run.head_sha || github.sha }}'));
  assert.ok(workflow.includes('test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"'));
});

test('analytics CSP permits only the approved additions and retains object protection', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.ok(headers.includes("script-src 'self' https://static.cloudflareinsights.com;"));
  assert.ok(headers.includes("connect-src 'self' https://cloudflareinsights.com;"));
  assert.ok(headers.includes("object-src 'none'"));
  assert.ok(!headers.includes('unsafe-inline'));
});
