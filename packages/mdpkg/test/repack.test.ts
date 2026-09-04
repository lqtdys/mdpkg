// 编辑-重打包闭环测试：解包 → 修改 → 再次打包 → 再次打开
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from '../src/container.ts';
import { buildManifest, type Manifest, DEFAULT_ENTRYPOINT } from '../src/manifest.ts';
import { openMdpkg, packMdpkg, readEntrySource } from '../web/mdpkg-web.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

function makeFiles(): Map<string, Uint8Array> {
  return new Map<string, Uint8Array>([
    ['document.md', enc.encode('# 标题 (tm)\n\n![图](assets/a.png)\n\n<<< includes/ch1.md\n')],
    ['includes/ch1.md', enc.encode('第一章 (c) --> 结束\n')],
    ['assets/a.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])],
  ]);
}

function makePkg(files = makeFiles()): Uint8Array {
  return pack(files, buildManifest(files));
}

test('解包 → 编辑 → 重打包 → 再次解包，内容一致且校验通过', async () => {
  const first = await openMdpkg(makePkg());
  assert.equal(first.error, null);
  assert.equal(first.validation.ok, true);

  const edited = new TextEncoder().encode('# 已编辑标题\n\n![图](assets/a.png)\n\n<<< includes/ch1.md\n');
  first.files.set('document.md', edited);

  const repacked = packMdpkg(first.files, first.manifest ?? undefined);
  const second = await openMdpkg(repacked);
  assert.equal(second.error, null);
  assert.equal(second.validation.ok, true);
  assert.equal(readEntrySource(second.files), '# 已编辑标题\n\n![图](assets/a.png)\n\n<<< includes/ch1.md\n');
  assert.deepEqual(second.files.get('assets/a.png'), first.files.get('assets/a.png'));
});

test('重打包保留作者意图（entrypoint / extensions / source_url）并重算机器事实', async () => {
  const files = new Map<string, Uint8Array>([
    ['index.md', enc.encode('# Index\n')],
    ['assets/a.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 4, 5, 6])],
  ]);
  const manifest: Manifest = {
    format: 'mdpkg',
    spec_version: '1.0',
    entrypoint: 'index.md',
    encoding: 'utf-8',
    extensions: { symbols: 'off', include: false },
    extensions_required: ['include'],
    resources: [
      { path: 'index.md', media_type: 'text/markdown', size: 0, sha256: '' },
      { path: 'assets/a.png', media_type: 'image/png', size: 0, sha256: '', source_url: 'https://example.com/a.png' },
    ],
  };
  const first = await openMdpkg(pack(files, manifest));

  const edited = enc.encode('# Index 已编辑\n');
  first.files.set('index.md', edited);

  const repacked = packMdpkg(first.files, first.manifest ?? undefined);
  const second = await openMdpkg(repacked);
  assert.equal(second.manifest?.entrypoint, 'index.md');
  assert.deepEqual(second.manifest?.extensions, { symbols: 'off', include: false });
  assert.deepEqual(second.manifest?.extensions_required, ['include']);

  const png = second.manifest?.resources.find((r) => r.path === 'assets/a.png');
  assert.equal(png?.source_url, 'https://example.com/a.png');

  const idx = second.manifest?.resources.find((r) => r.path === 'index.md');
  assert.equal(idx?.size, edited.length);
  assert.notEqual(idx?.sha256, '');
});

test('packMdpkg 同输入两次产生字节相同的包（可重复构建）', async () => {
  const r = await openMdpkg(makePkg());
  const a = packMdpkg(r.files, r.manifest ?? undefined);
  const b = packMdpkg(r.files, r.manifest ?? undefined);
  assert.equal(Buffer.from(a).toString('hex'), Buffer.from(b).toString('hex'));
});

test('packMdpkg 与 CLI pack 对同一组文件产生相同字节', () => {
  const files = makeFiles();
  const prev = buildManifest(files);
  const viaCli = pack(files, prev);

  const viaWeb = packMdpkg(files, prev);
  assert.equal(Buffer.from(viaCli).toString('hex'), Buffer.from(viaWeb).toString('hex'));
});

test('重打包后的 manifest.resources 不包含 manifest.json', async () => {
  const r = await openMdpkg(makePkg());
  const repacked = packMdpkg(r.files, r.manifest ?? undefined);
  const again = await openMdpkg(repacked);
  const paths = again.manifest?.resources.map((r) => r.path) ?? [];
  assert.ok(!paths.includes('manifest.json'), 'manifest.json 不应出现在 resources 中');
});

test('不带 prevManifest 时，packMdpkg 会从 files 中的 manifest.json 继承作者意图', async () => {
  const files = new Map<string, Uint8Array>([
    ['document.md', enc.encode('# Hello\n')],
  ]);
  const manifest: Manifest = {
    format: 'mdpkg',
    spec_version: '1.0',
    entrypoint: 'document.md',
    extensions: { symbols: 'off' },
    resources: [],
  };
  const pkg = pack(files, manifest);
  const r = await openMdpkg(pkg);

  const edited = enc.encode('# Hello World\n');
  r.files.set('document.md', edited);

  const repacked = packMdpkg(r.files); // 不传入 prevManifest
  const again = await openMdpkg(repacked);
  assert.equal(again.manifest?.entrypoint, 'document.md');
  assert.deepEqual(again.manifest?.extensions, { symbols: 'off' });
});
