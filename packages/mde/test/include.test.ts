// M4 include 展开测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expand, INCLUDE_LIMITS } from '../src/include.ts';
import { buildManifest } from '../src/manifest.ts';
import { render } from '../src/render.ts';
import { MdeError } from '../src/errors.ts';

const enc = (s: string) => new TextEncoder().encode(s);
const throwsCode = (fn: () => unknown, code: string) =>
  assert.throws(fn as never, (e: unknown) => e instanceof MdeError && e.code === code);

function build(files: Record<string, string>) {
  const m = new Map(Object.entries(files).map(([k, v]) => [k, enc(v)]));
  return { files: m, packed: new Map([...m, ['manifest.json', enc(JSON.stringify(buildManifest(m)))]]) };
}

test('单层展开: 指令行被替换为被包含文件内容', () => {
  const { files } = build({ 'document.md': '# 开头\n\n<<< includes/ch1.md\n\n结尾\n', 'includes/ch1.md': '第一章内容\n' });
  const r = expand(files, 'document.md');
  assert.ok(r.text.includes('第一章内容'));
  assert.ok(!r.text.includes('<<<'), '指令行不应残留');
  assert.equal(r.count, 1);
});

test('列 0 才触发: 缩进 1 空格不展开', () => {
  const { files } = build({ 'document.md': ' <<< includes/ch1.md\n<code>块 <<< includes/ch1.md</code>\n', 'includes/ch1.md': 'X\n' });
  const r = expand(files, 'document.md');
  assert.ok(r.text.includes('<<<'), '缩进的指令不应被展开');
  assert.equal(r.count, 0);
});

test('URL 重写: 被包含文件内的相对图片路径按该文件目录解析', () => {
  const { files } = build({
    'document.md': '<<< includes/ch1.md\n',
    'includes/ch1.md': '![图](img/fig.png)\n\n![外](https://x.com/a.png)\n',
  });
  const r = expand(files, 'document.md');
  assert.ok(r.text.includes('](includes/img/fig.png)'), `相对路径应重写，实际: ${r.text}`);
  assert.ok(r.text.includes('](https://x.com/a.png)'), '外链不应被重写');
});

test('URL 重写不得改写代码块内的示例路径（与引用收集共用同一排除区原则）', () => {
  const NL = String.fromCharCode(10);
  const { files } = build({
    'document.md': '<<< includes/api.md' + NL,
    'includes/api.md': ['用法示例：', '', '```markdown', '![示例](img/demo.png)', '```', '', '真实引用：', '', '![真图](img/real.png)', ''].join(NL),
  });
  const r = expand(files, 'document.md');
  assert.ok(r.text.includes('![示例](img/demo.png)'), `代码块内示例不得被重写，实际: ${r.text}`);
  assert.ok(r.text.includes('![真图](includes/img/real.png)'), '代码块外的真实引用仍须重写');
});

test('嵌套与深度: 多层展开正常，超限报 E504', () => {
  const chain: Record<string, string> = { 'document.md': '<<< a1.md\n' };
  for (let i = 1; i < INCLUDE_LIMITS.depth + 3; i++) chain[`a${i}.md`] = `L${i}\n<<< a${i + 1}.md\n`;
  const { files } = build(chain);
  throwsCode(() => expand(files, 'document.md'), 'MDE-E504');
});

test('循环包含: 报 E507', () => {
  const { files } = build({ 'document.md': '<<< a.md\n', 'a.md': '<<< b.md\n', 'b.md': '<<< a.md\n' });
  throwsCode(() => expand(files, 'document.md'), 'MDE-E507');
});

test('目标异常: 包外 E501 / URL E502 / 非 Markdown E503 / 不存在 E508', () => {
  throwsCode(() => expand(build({ 'document.md': '<<< ../outside.md\n' }).files, 'document.md'), 'MDE-E501');
  throwsCode(() => expand(build({ 'document.md': '<<< https://x.com/a.md\n' }).files, 'document.md'), 'MDE-E502');
  throwsCode(() => expand(build({ 'document.md': '<<< a.png\n' }).files, 'document.md'), 'MDE-E503');
  throwsCode(() => expand(build({ 'document.md': '<<< nope.md\n' }).files, 'document.md'), 'MDE-E508');
});

test('sourcemap: 展开后可追溯到原始文件与行号', () => {
  const { files } = build({ 'document.md': 'A\n<<< includes/ch1.md\nB\n', 'includes/ch1.md': 'X\nY\n' });
  const r = expand(files, 'document.md');
  // 行序列：A | X | Y | (ch1 末尾空行) | B | (document 末尾空行)
  assert.deepEqual(r.sources[0], { file: 'document.md', line: 1 });
  assert.deepEqual(r.sources[1], { file: 'includes/ch1.md', line: 1 });
  assert.deepEqual(r.sources[4], { file: 'document.md', line: 3 });
});

test('render 集成: 被包含内容出现在 HTML，且其图片被正确内联', () => {
  const { packed } = build({
    'document.md': '# 主\n\n<<< includes/ch1.md\n',
    'includes/ch1.md': '第一章 (tm) ![图](img/fig.png)\n',
  });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  packed.set('includes/img/fig.png', png);
  const html = render(packed, { inline: true }).html;
  assert.ok(html.includes('第一章'), '被包含内容应渲染');
  assert.ok(html.includes('™'), '被包含内容中的符号也应转换');
  assert.ok(html.includes('src="data:image/png;base64,'), '重写后的图片路径应能命中并内联');
});

test('extensions.include=false 时不展开', () => {
  const { packed } = build({ 'document.md': '<<< includes/ch1.md\n', 'includes/ch1.md': 'X\n' });
  const m = JSON.parse(new TextDecoder().decode(packed.get('manifest.json')!));
  m.extensions = { include: false };
  packed.set('manifest.json', enc(JSON.stringify(m)));
  const html = render(packed).html;
  // 降级要求（规范 §9）：指令必须以可见文本出现，不能被当作 HTML 后被消毒清除。
  // 实体形式取决于序列化器（rehype-stringify 用数字实体 &#x3C; 而非 &lt;），两种都接受。
  assert.ok(/(&#x3C;|&lt;){3}/.test(html), `include=false 时指令应作为可见文本保留，实际: ${html}`);
  assert.ok(!html.includes('<p>X</p>'), '不应展开出被包含内容');
});
