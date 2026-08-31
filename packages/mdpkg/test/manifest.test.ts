// M2 manifest 与 validate 测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack } from '../src/container.ts';
import { buildManifest, validatePackage, checkClosure, collectReferences, assertSupported, sha256, mediaType, SPEC_VERSION, DEFAULT_ENTRYPOINT } from '../src/manifest.ts';
import { render } from '../src/render.ts';
import { MdeError } from '../src/errors.ts';

const enc = (s: string) => new TextEncoder().encode(s);

function baseFiles() {
  return new Map<string, Uint8Array>([
    ['document.md', enc('# 标题\n\n![图](assets/images/a.png)\n\n[外链](https://example.com/x)\n')],
    ['assets/images/a.png', new Uint8Array(3000).fill(7)],
    ['includes/ch1.md', enc('第一章\n')],
  ]);
}
const buildPack = (files: Map<string, Uint8Array>, prev?: never) => pack(files, buildManifest(files, prev));

test('manifest 覆盖包内全部文件（含入口文档自身）且按 path 升序', () => {
  const files = baseFiles();
  const m = buildManifest(files);
  assert.deepEqual(m.resources.map((r) => r.path), ['assets/images/a.png', 'document.md', 'includes/ch1.md']);
  assert.equal(m.resources.find((r) => r.path === 'document.md')!.sha256, sha256(files.get('document.md')!));
  assert.equal(m.resources.find((r) => r.path === 'assets/images/a.png')!.size, 3000);
});

test('media_type 推断', () => {
  assert.equal(mediaType('a/b.png'), 'image/png');
  assert.equal(mediaType('document.md'), 'text/markdown');
  assert.equal(mediaType('x/y.unknown'), 'application/octet-stream');
});

test('字段归属: 作者意图继承，机器事实重算，spec_version 不继承', () => {
  const files = baseFiles();
  const prev = {
    format: 'mdpkg' as const, spec_version: '0.9', entrypoint: 'main.md',
    extensions: { symbols: 'off' as const }, extensions_required: ['include'],
    resources: [{ path: 'document.md', media_type: 'text/markdown', size: 1, sha256: 'deadbeef', source_url: 'https://orig/x.md' }],
  };
  const m = buildManifest(files, prev);
  assert.equal(m.spec_version, SPEC_VERSION, 'spec_version 由工具决定，不继承 0.9');
  assert.equal(m.entrypoint, 'main.md', '作者意图应保留');
  assert.deepEqual(m.extensions, { symbols: 'off' });
  assert.deepEqual(m.extensions_required, ['include']);
  assert.equal(m.resources.find((r) => r.path === 'document.md')!.sha256, sha256(files.get('document.md')!), 'resources 必须重算');
  assert.equal(m.resources.find((r) => r.path === 'document.md')!.source_url, 'https://orig/x.md', 'source_url 应保留');
});

test('引用闭包: 缺失引用报错 E401，孤儿资源仅告警', () => {
  const files = baseFiles();
  assert.deepEqual(checkClosure(files, DEFAULT_ENTRYPOINT).orphans, ['includes/ch1.md']);

  const broken = new Map([['document.md', enc('![缺图](assets/images/nope.png)\n')]]);
  assert.throws(() => checkClosure(broken, DEFAULT_ENTRYPOINT), (e: unknown) => e instanceof MdeError && e.code === 'MDPKG-E401');
});

test('H1 回归: 被包含文档里的图片缺失也要报 E401（引用校验必须走 include 闭包）', () => {
  const files = new Map<string, Uint8Array>([
    ['document.md', enc('<<< includes/ch1.md\n')],
    ['includes/ch1.md', enc('![图](img/fig.png)\n')],
  ]);
  assert.throws(() => checkClosure(files, DEFAULT_ENTRYPOINT), (e: unknown) => e instanceof MdeError && e.code === 'MDPKG-E401');
  // 补上展开重写后的路径（includes/img/fig.png）即通过，且被包含文件不算孤儿
  files.set('includes/img/fig.png', new Uint8Array([1]));
  assert.deepEqual(checkClosure(files, DEFAULT_ENTRYPOINT).orphans, []);
});

test('collectReferences: 区分本地引用与外链', () => {
  const md = '![a](assets/a.png) [b](./doc.pdf) [c](https://x.com) [d](//cdn.x/y) [e](mailto:a@b.c) [f](#anchor)';
  const { local, external } = collectReferences(md);
  assert.deepEqual(local, ['assets/a.png', 'doc.pdf']);
  assert.equal(external, 4, 'https / 协议相对 / mailto / 锚点 均计为外链');
});

test('validate: 干净包通过；篡改 size / sha 被检出；未登记文件被检出', async () => {
  const files = baseFiles();
  const clean = await unpack(buildPack(files));
  const r = validatePackage(clean);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('includes/ch1.md')), '孤儿资源应是 warning');
  assert.equal(r.externalCount, 1);

  const tampered = new Map(clean);
  const m = JSON.parse(new TextDecoder().decode(tampered.get('manifest.json')!));
  m.resources[0].size = 999;
  tampered.set('manifest.json', new TextEncoder().encode(JSON.stringify(m)));
  assert.ok(validatePackage(tampered).errors.some((e) => e.includes('MDPKG-E402')));

  const badSha = new Map(clean);
  const m2 = JSON.parse(new TextDecoder().decode(badSha.get('manifest.json')!));
  m2.resources[0].sha256 = 'f'.repeat(64);
  badSha.set('manifest.json', new TextEncoder().encode(JSON.stringify(m2)));
  assert.ok(validatePackage(badSha).errors.some((e) => e.includes('MDPKG-E403')));

  const unlisted = new Map(clean);
  unlisted.set('stray.txt', enc('x'));
  assert.ok(validatePackage(unlisted).errors.some((e) => e.includes('MDPKG-E304')));
});

test('版本协商: 主版本不符报 E701，必需扩展不支持报 E702（不得静默降级）', () => {
  assert.throws(() => assertSupported({ format: 'mdpkg', spec_version: '2.0', resources: [] }),
    (e: unknown) => e instanceof MdeError && e.code === 'MDPKG-E701');
  assert.throws(() => assertSupported({ format: 'mdpkg', spec_version: '1.0', extensions_required: ['hologram'], resources: [] }),
    (e: unknown) => e instanceof MdeError && e.code === 'MDPKG-E702');
  // 次版本更高不报错；支持的必需扩展不报错
  assertSupported({ format: 'mdpkg', spec_version: '1.9', extensions_required: ['include', 'symbols:core'], resources: [] });
  // render 也应因 E702 而失败，而非静默降级（render 直接吃 Map，无需打包）
  const files = baseFiles();
  const m = buildManifest(files);
  m.extensions_required = ['hologram'];
  const pkgFiles = new Map([...files, ['manifest.json', enc(JSON.stringify(m))]]);
  assert.throws(() => render(pkgFiles, {}), (e: unknown) => e instanceof MdeError && e.code === 'MDPKG-E702');
});

test('引用收集基于 AST：代码块内的示例不算引用，到本地 md 的链接不强制打包', () => {
  // dogfood 发现：打包项目自己的 README 时，快速开始代码块里的 ![图](assets/a.png)
  // 被当成真实引用导致 E401；且 README 对 spec/mdpkg-format-spec.md 的链接会要求连带整个仓库
  const md = [
    '真实图片：![a](assets/a.png)',
    '',
    '```',
    '![示例](assets/only-in-example.png)',
    '```',
    '',
    '文档链接：[规范](spec/x.md)',
    '',
    '附件：[pdf](files/a.pdf)',
  ].join('\n');
  const { local, docLinks } = collectReferences(md);
  assert.deepEqual(local, ['assets/a.png', 'files/a.pdf'], '代码块内的示例不得算作引用');
  assert.equal(docLinks, 1, '到本地 md 的链接应计为文档导航而非附件');
});

test('validate: 缺少 manifest.json 报 E102；非法 JSON 报 E302', () => {
  const r = validatePackage(new Map([['document.md', enc('# x')]]));
  assert.ok(r.errors.some((e) => e.includes('MDPKG-E102')));
  const r2 = validatePackage(new Map([['manifest.json', enc('{ not json')]]));
  assert.ok(r2.errors.some((e) => e.includes('MDPKG-E302')));
});
