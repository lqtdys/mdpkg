// M3 渲染管线测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, wrapDocument, DEFAULT_MAX_INLINE_BYTES } from '../src/render.ts';
import { buildManifest } from '../src/manifest.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Uint8Array(500).fill(7)]);

function pkg(body: string, extra: Record<string, Uint8Array> = {}) {
  const files = new Map<string, Uint8Array>([['document.md', enc(body)], ...Object.entries(extra)]);
  return { files, withManifest: () => new Map([...files, ['manifest.json', enc(JSON.stringify(buildManifest(files)))]]) };
}

test('符号转换: 普通文本转换，代码与行内代码不转换', () => {
  const html = render(pkg('# 标题 (tm) 与 -->\n\n行内 `(tm)` 不转\n\n```\n代码块 (tm) 不转\n```\n').withManifest()).html;
  assert.ok(html.includes('™'), '普通文本应转换');
  assert.ok(html.includes('→'), '箭头应转换');
  assert.ok(html.includes('<code>(tm)</code>'), '行内代码不应转换');
  assert.ok(/<pre><code>[\s\S]*\(tm\)/.test(html), '代码块不应转换');
});

test('哨兵法转义: \\(tm) 保留字面，普通 (tm) 正常转换', () => {
  const html = render(pkg('字面 \\(tm) 与 转换 (tm)\n').withManifest()).html;
  assert.ok(html.includes('(tm)'), '转义应保留字面 (tm)');
  assert.ok(html.includes('™'), '未转义的应转换');
});

test('词边界: a<=b 与 v1.2-->v2 与路径不误伤', () => {
  // 断言「未出现转换后的符号」而非匹配原文：rehype-stringify 用数字实体（< → &#x3C;）
  // 且文本中的 > 不转义，按字面匹配会与序列化细节耦合
  const html = render(pkg('a<=b 与 v1.2-->v2 与 路径/a/b 与 结尾 (tm)\n').withManifest()).html;
  assert.ok(!html.includes('a≤b'), 'a<=b 不应转换为 a≤b');
  assert.ok(!html.includes('v1.2→v2'), '版本号中的箭头不应转换');
  assert.ok(html.includes('™'), '行尾的 (tm) 仍应正常转换');
});

test('消毒: script 与 on* 事件属性被清除', () => {
  const html = render(pkg('<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(1)">\n\n[链接](javascript:alert(1))\n').withManifest()).html;
  assert.ok(!html.includes('<script'), 'script 应被清除');
  assert.ok(!html.includes('onerror'), 'on* 属性应被清除');
  assert.ok(!html.includes('javascript:'), 'javascript: URL 应被清除');
});

test('inline 模式: 包内图片转 data URI，外链补 referrerpolicy', () => {
  const files = pkg('![a](assets/a.png)\n\n![外](https://example.com/x.png)\n', { 'assets/a.png': PNG }).withManifest();
  const html = render(files, { inline: true }).html;
  assert.ok(html.includes('src="data:image/png;base64,'), '包内图片应内联为 data URI');
  assert.ok(html.includes('referrerpolicy="no-referrer"'), '外链图片应补 referrerpolicy');
  // 外链保留原 URL 是正确的（只是补 referrerpolicy），要断言的是它没被 base64 化
  assert.ok(!/src="data:[^"]*example\.com/.test(html), '外链不应被内联为 data URI');
  assert.ok(html.includes('src="https://example.com/x.png"'), '外链 URL 应原样保留');
});

test('dir 模式: 图片保留相对路径', () => {
  const files = pkg('![a](assets/a.png)\n', { 'assets/a.png': PNG }).withManifest();
  const html = render(files, { dir: true }).html;
  assert.ok(html.includes('src="assets/a.png"'), 'dir 模式应保留相对路径');
  assert.equal(render(files, { dir: true }).mode, 'dir');
});

test('阈值降级: 资源总量超限时自动降为 dir 并标记 degraded', () => {
  const files = pkg('![a](assets/a.png)\n', { 'assets/a.png': PNG }).withManifest();
  const r = render(files, { maxInlineBytes: 10 }); // 10 字节阈值，包必然超限
  assert.equal(r.mode, 'dir');
  assert.equal(r.degraded, true);
  assert.equal(r.html.includes('data:image/png;base64,'), false, '降级后不应内联');
  assert.ok(r.totalBytes > 10);
  // 显式 --inline 时忽略阈值
  assert.equal(render(files, { inline: true, maxInlineBytes: 10 }).mode, 'inline');
  assert.equal(DEFAULT_MAX_INLINE_BYTES, 50 * 1024 * 1024);
});

test('extensions.symbols 为 off 时不转换', () => {
  const files = pkg('标题 (tm)\n').withManifest();
  const m = new Map(files);
  const man = JSON.parse(new TextDecoder().decode(m.get('manifest.json')!));
  man.extensions = { symbols: 'off' };
  m.set('manifest.json', enc(JSON.stringify(man)));
  assert.ok(!render(m).html.includes('™'), 'symbols=off 应完全不转换');
});

test('wrapDocument: 输出 HTML 壳并转义标题', () => {
  const doc = wrapDocument('<script>x</script>', '<p>正文</p>');
  assert.ok(doc.startsWith('<!doctype html>'));
  assert.ok(doc.includes('<p>正文</p>'));
  assert.ok(!doc.includes('<script>x</script>'), '标题应被转义');
});
