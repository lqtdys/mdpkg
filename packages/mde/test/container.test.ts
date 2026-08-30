// M1 容器层测试（node:test，无第三方测试框架）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { pack, unpack, list, collectFiles, normalizePath } from '../src/container.ts';
import { MdeError } from '../src/errors.ts';

// 真实尺寸的伪 PNG：8 字节的极小文件在 Store/DEFLATE 边界上不稳定，测不出策略差异
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Uint8Array(2000).fill(7)]);

function fixture(): string {
  const d = mkdtempSync(join(tmpdir(), 'mde-'));
  // 文本要足够长：几十字节的文档经 DEFLATE 反而会膨胀（实测 43B → 46B），测不出压缩策略
  writeFileSync(join(d, 'document.md'), '# 标题 (tm)\n\n![图](assets/images/a.png)\n\n' + '这是一段用于验证 DEFLATE 压缩生效的重复文本。\n'.repeat(20));
  mkdirSync(join(d, 'assets/images'), { recursive: true });
  writeFileSync(join(d, 'assets/images/a.png'), PNG);
  mkdirSync(join(d, 'includes'), { recursive: true });
  writeFileSync(join(d, 'includes/ch1.md'), '第一章\n');
  return d;
}
const packDir = (d: string) => pack(collectFiles(d));

test('可重复构建: 同输入两次打包字节相同', () => {
  const d = fixture();
  assert.equal(Buffer.from(packDir(d)).toString('hex'), Buffer.from(packDir(d)).toString('hex'));
});

test('条目顺序: manifest.json 最前，其余按路径码位升序', async () => {
  const items = await list(packDir(fixture()));
  assert.equal(items[0].path, 'manifest.json');
  const rest = items.slice(1).map((i) => i.path);
  assert.deepEqual(rest, [...rest].sort());
});

test('路径规范化: 拒绝 ../ 与绝对路径与盘符', () => {
  assert.throws(() => normalizePath('../etc/passwd'), (e: unknown) => e instanceof MdeError && e.code === 'MDE-E202');
  assert.throws(() => normalizePath('/etc/passwd'), (e: unknown) => e instanceof MdeError && e.code === 'MDE-E202');
  assert.throws(() => normalizePath('C:\\Windows'), (e: unknown) => e instanceof MdeError && e.code === 'MDE-E202');
  assert.equal(normalizePath('a//b/./c.md'), 'a/b/c.md');
});

test('NFC 归一化: NFD 输入归一为 NFC（跨平台 sha256 一致的前提）', () => {
  const d = mkdtempSync(join(tmpdir(), 'mde-nfc-'));
  writeFileSync(join(d, 'cafe\u0301.md'), 'x'); // NFD（macOS APFS 的存法）
  const paths = [...collectFiles(d).keys()];
  assert.ok(paths.every((p) => p === p.normalize('NFC')), `未归一化: ${JSON.stringify(paths)}`);
});

test('拒绝符号链接', () => {
  const d = mkdtempSync(join(tmpdir(), 'mde-link-'));
  writeFileSync(join(d, 'a.md'), 'x');
  symlinkSync(join(d, 'a.md'), join(d, 'link.md'));
  assert.throws(() => collectFiles(d), (e: unknown) => e instanceof MdeError && e.code === 'MDE-E601');
});

test('路径冲突: 仅大小写不同则拒绝', () => {
  const files = new Map<string, Uint8Array>([['A.md', new Uint8Array([1])], ['a.md', new Uint8Array([2])]]);
  assert.throws(() => pack(files), (e: unknown) => e instanceof MdeError && e.code === 'MDE-E201');
});

test('压缩策略: 媒体 Store、文本 DEFLATE', async () => {
  const items = await list(packDir(fixture()));
  const png = items.find((i) => i.path.endsWith('.png'))!;
  const md = items.find((i) => i.path.endsWith('.md'))!;
  assert.equal(png.size, png.compressed, 'PNG 应 Store（压缩后大小不变）');
  assert.ok(md.compressed < md.size, 'Markdown 应 DEFLATE');
});

test('ZIP 炸弹: 超高压缩比在读 header 阶段即被拒绝，不解压', async () => {
  const bomb = zipSync({ 'bomb.bin': new Uint8Array(12 * 1024 * 1024) }, { level: 9 });
  assert.ok(bomb.length < 20 * 1024, `炸弹压缩包应远小于原始，实际 ${bomb.length} B`);
  await assert.rejects(() => unpack(new Uint8Array(bomb)), (e: unknown) => e instanceof MdeError && e.code === 'MDE-E605');
});

test('往返: pack → unpack 内容一致', async () => {
  const d = fixture();
  const out = await unpack(packDir(d));
  const md = new TextDecoder().decode(out.get('document.md')!); // Uint8Array.toString() 会给逗号串，不是文本
  assert.ok(md.startsWith('# 标题 (tm)\n\n![图](assets/images/a.png)\n'));
  assert.equal(Buffer.from(out.get('assets/images/a.png')!).toString('hex'), Buffer.from(PNG).toString('hex'));
  assert.ok(out.has('manifest.json'));
});
