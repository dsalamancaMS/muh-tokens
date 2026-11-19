import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isIdleRewrite, splitCost } from './cost.ts';
import { projectOf } from './project.ts';

const details = (entries: [string, number, number][]) =>
  JSON.stringify(entries.map(([tokenType, tokenCount, costPerBatch]) => ({ tokenType, tokenCount, costPerBatch, batchSize: 1000 })));

test('splitCost prices each token type and splits reasoning out of output by token share', () => {
  const cost = splitCost({
    input_tokens: 1300,
    output_tokens: 400,
    cache_read_tokens: 1000,
    cache_write_tokens: 200,
    reasoning_tokens: 100,
    total_nano_aiu: 100 + 500 + 750 + 6000,
    token_details_json: details([
      ['input', 100, 1000],
      ['cache_read', 1000, 500],
      ['cache_write', 200, 3750],
      ['output', 400, 15000],
    ]),
  });
  assert.deepEqual(cost.tokens, { input: 100, cacheRead: 1000, cacheWrite: 200, output: 300, reasoning: 100 });
  assert.deepEqual(cost.nano, { input: 100, cacheRead: 500, cacheWrite: 750, output: 4500, reasoning: 1500 });
  assert.equal(cost.nanoOther, 0);
  assert.equal(cost.contextTokens, 1300);
});

test('splitCost falls back to the token columns when the price details are missing', () => {
  const cost = splitCost({
    input_tokens: 1300,
    output_tokens: 50,
    cache_read_tokens: 1000,
    cache_write_tokens: 200,
    reasoning_tokens: null,
    total_nano_aiu: 999,
    token_details_json: 'not json',
  });
  assert.deepEqual(cost.tokens, { input: 100, cacheRead: 1000, cacheWrite: 200, output: 50, reasoning: 0 });
  assert.equal(cost.nanoOther, 999);
});

test('isIdleRewrite needs a long gap, a large context and a mostly rewritten cache', () => {
  assert.equal(isIdleRewrite(300, 20_000, 10_000), true);
  assert.equal(isIdleRewrite(299, 20_000, 10_000), false);
  assert.equal(isIdleRewrite(null, 20_000, 20_000), false);
  assert.equal(isIdleRewrite(600, 19_999, 19_999), false);
  assert.equal(isIdleRewrite(600, 20_000, 9_999), false);
});

test('projectOf groups worktrees with their repository and names the home folder', () => {
  const home = '/Users/me';
  assert.equal(projectOf('/Users/me', null, home), '~');
  assert.equal(projectOf('/Users/me/code/copilot-worktrees/AKSpider/me-fix-bug', null, home), 'AKSpider');
  assert.equal(projectOf('/Users/me/.copilot/session-state/abc/files', null, home), 'copilot session files');
  assert.equal(projectOf('/Users/me/code/muh-tokens', 'org/other', home), 'muh-tokens');
  assert.equal(projectOf(null, 'org/repo', home), 'repo');
  assert.equal(projectOf(null, null, home), '(unknown)');
});
