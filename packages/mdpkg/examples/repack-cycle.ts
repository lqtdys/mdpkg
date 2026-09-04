#!/usr/bin/env node
// 解包 → 编辑 → 重打包 示例脚本
// 无参数时：在内存中构造一个演示包，编辑后重新打包并验证。
// 有参数时：读取指定 .mdpkg 文件，给入口文档追加一行，输出到 <原文件名>-edited.mdpkg。
import { readFileSync, writeFileSync } from 'node:fs';
import { openMdpkg, packMdpkg } from '../web/mdpkg-web.ts';
import { pack } from '../src/container.ts';
import { buildManifest } from '../src/manifest.ts';

const enc = new TextEncoder();

function makeDemoPkg(): Uint8Array {
  const files = new Map<string, Uint8Array>([
    ['document.md', enc.encode('# 演示文档 (tm)\n\n这是一段会被编辑的文本。\n')],
    ['assets/logo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
  ]);
  return pack(files, buildManifest(files));
}

async function run() {
  const inputPath = process.argv[2];
  const inputBytes = inputPath ? new Uint8Array(readFileSync(inputPath)) : makeDemoPkg();
  const inputName = inputPath ?? 'demo.mdpkg';

  // 1. 打开
  const opened = await openMdpkg(inputBytes);
  if (opened.error) {
    process.stderr.write(`打开失败: ${opened.error}\n`);
    process.exit(1);
  }
  process.stdout.write(`打开 ${inputName}: ${opened.files.size} 个条目，校验 ${opened.validation.ok ? '通过' : '未通过'}\n`);

  // 2. 编辑入口文档
  const entry = opened.manifest?.entrypoint ?? 'document.md';
  const oldText = new TextDecoder().decode(opened.files.get(entry));
  const newText = `${oldText.trimEnd()}\n\n> 编辑于 ${new Date().toISOString()}\n`;
  opened.files.set(entry, enc.encode(newText));
  process.stdout.write(`编辑入口 ${entry}: 追加时间戳行\n`);

  // 3. 重打包
  const outBytes = packMdpkg(opened.files, opened.manifest ?? undefined);
  const outPath = inputPath ? inputPath.replace(/\.mdpkg$/i, '-edited.mdpkg') : 'demo-edited.mdpkg';
  writeFileSync(outPath, outBytes);
  process.stdout.write(`重打包 → ${outPath} (${outBytes.length} B)\n`);

  // 4. 再次打开验证
  const reopened = await openMdpkg(outBytes);
  if (reopened.error || reopened.validation.ok === false) {
    process.stderr.write(`验证失败: ${reopened.error ?? reopened.validation.errors.join('; ')}\n`);
    process.exit(1);
  }
  const reopenedText = new TextDecoder().decode(reopened.files.get(entry));
  if (!reopenedText.includes('编辑于')) {
    process.stderr.write('编辑内容在重打包后丢失\n');
    process.exit(1);
  }
  process.stdout.write(`闭环验证通过: 新包 ${reopened.files.size} 个条目，编辑内容已保留\n`);
}

run().catch((e: unknown) => {
  process.stderr.write(`错误: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
