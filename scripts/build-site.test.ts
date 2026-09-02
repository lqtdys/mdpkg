// scripts/build-site.ts 的集成测试（node:test，子进程方式驱动真实构建）
// 运行：node --test scripts/build-site.test.ts（仓库根目录）
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const run = (): string =>
  execFileSync(process.execPath, ["scripts/build-site.ts"], {
    cwd: ROOT,
    encoding: "utf8",
  });

test("build-site: 两页注入 lang/nav/title 且互链", () => {
  run();
  const en = readFileSync(resolve(ROOT, "docs/spec.html"), "utf8");
  assert.match(en, /<html lang="en">/);
  assert.match(en, /<nav class="lang-switch">/);
  assert.match(en, /<a href="spec\.zh\.html">简体中文<\/a>/);
  assert.match(en, /<title>mdpkg Format Specification v1\.0<\/title>/);
  const zh = readFileSync(resolve(ROOT, "docs/spec.zh.html"), "utf8");
  assert.match(zh, /<html lang="zh-CN">/);
  assert.match(zh, /<a href="spec\.html">English<\/a>/);
  assert.match(zh, /<title>mdpkg 格式规范 v1\.0<\/title>/);
});

test("build-site: 缺源文件时报错并退出非零", () => {
  const src = resolve(ROOT, "spec/mdpkg-format-spec.en.md");
  assert.ok(existsSync(src), "测试前置条件失败: 英文规范源文件不存在");
  const bak = src + ".bak";
  renameSync(src, bak);
  try {
    assert.throws(() => run(), /缺少源文件/);
  } finally {
    renameSync(bak, src);
  }
});

test("build-site: 重复运行字节一致（确定性）", () => {
  run();
  const a = readFileSync(resolve(ROOT, "docs/spec.html"));
  run();
  const b = readFileSync(resolve(ROOT, "docs/spec.html"));
  assert.deepEqual(a, b);
});
