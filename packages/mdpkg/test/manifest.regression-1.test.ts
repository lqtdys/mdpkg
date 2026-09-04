// Regression: ISSUE-001 — pack 接受非 Markdown entrypoint，产出的包被 validate 拒绝
// Found by /qa on 2026-09-05
// Report: .gstack/qa-reports/qa-report-mdpkg-2026-09-05.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkClosure } from '../src/manifest.ts';

const enc = (s: string) => new TextEncoder().encode(s);

test('非 Markdown entrypoint 被拒绝', () => {
  const files = new Map<string, Uint8Array>([
    ['readme.txt', enc('hello')],
  ]);
  assert.throws(
    () => checkClosure(files, 'readme.txt'),
    (err: unknown) => err instanceof Error && err.message.includes('entrypoint 非 Markdown'),
  );
});

test('合法 .md entrypoint 正常通过', () => {
  const files = new Map<string, Uint8Array>([
    ['document.md', enc('# 标题\n\n正文\n')],
  ]);
  assert.doesNotThrow(() => checkClosure(files, 'document.md'));
});

test('不存在的 entrypoint 仍报不存在', () => {
  const files = new Map<string, Uint8Array>([
    ['other.md', enc('内容')],
  ]);
  assert.throws(
    () => checkClosure(files, 'missing.md'),
    (err: unknown) => err instanceof Error && err.message.includes('entrypoint 不存在'),
  );
});
