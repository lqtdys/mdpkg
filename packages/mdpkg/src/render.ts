// 渲染管线（M3）：解析 → 符号转换 → HTML → 消毒 → 资源内联
// 管线顺序（规范 §8.1 固定）：解包 → 校验 → include 展开 → 解析 → 符号转换 → 渲染（消毒）
// 消毒放在内联之前：这样 sanitize 不必为 data: 开白名单（hast-util-sanitize 默认 src 只允许 http/https）
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { symbolsPlugin, guardEscapes } from './symbols.ts';
import { expand } from './include.ts';
import { mediaType, assertSupported, DEFAULT_ENTRYPOINT } from './manifest.ts';
import { MdeError, E } from './errors.ts';

export const DEFAULT_MAX_INLINE_BYTES = 50 * 1024 * 1024;

interface RenderOptions {
  inline?: boolean;
  dir?: boolean;
  maxInlineBytes?: number;
  symbols?: boolean;
}

export interface RenderResult {
  html: string;
  mode: 'inline' | 'dir';
  totalBytes: number;
  degraded: boolean; // 因超阈值自动降级
}

const isExternal = (src: string) => /^(https?:)?\/\//i.test(src);

/** 把包内相对路径资源替换为 data URI；外链图片补 referrerpolicy */
function assetsPlugin(files: Map<string, Uint8Array>, inline: boolean) {
  return (tree: unknown) => {
    visit(tree as never, 'element', (node: { tagName: string; properties?: Record<string, unknown> }) => {
      if (node.tagName !== 'img' || !node.properties) return;
      const src = String(node.properties.src ?? '');
      if (!src) return;
      if (isExternal(src)) {
        node.properties.referrerpolicy = 'no-referrer'; // 防 referrer / IP 泄露
        return;
      }
      if (!inline) return; // --dir：保留相对路径，资源单独输出到旁边目录
      const data = files.get(src);
      if (!data) return; // 缺失资源已在 validate 阶段报错，此处不阻断渲染
      // SVG 也走 img+data URI：img 中的 SVG 不执行脚本，安全（规范 §8.2）
      node.properties.src = `data:${mediaType(src)};base64,${Buffer.from(data).toString('base64')}`;
    });
  };
}

export function render(files: Map<string, Uint8Array>, opts: RenderOptions = {}): RenderResult {
  const manifestRaw = files.get('manifest.json');
  const manifest = manifestRaw ? JSON.parse(new TextDecoder().decode(manifestRaw)) : {};
  const entry: string = manifest.entrypoint ?? DEFAULT_ENTRYPOINT;
  assertSupported(manifest as never); // 版本协商：主版本不符报 E701，必需扩展不支持报 E702
  const body = files.get(entry);
  if (!body) throw new MdeError(E.E303, `entrypoint 不存在: ${entry}`);

  const totalBytes = [...files.entries()].reduce((n, [p, d]) => (p === 'manifest.json' ? n : n + d.length), 0);
  const max = opts.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES;
  let mode: 'inline' | 'dir';
  let degraded = false;
  if (opts.dir) mode = 'dir';
  else if (opts.inline) mode = 'inline';
  else { mode = totalBytes > max ? 'dir' : 'inline'; degraded = mode === 'dir'; }

  // 管线顺序：include 展开（解析前）→ 哨兵保护 → 解析 → 符号转换 → HTML → 消毒 → 内联
  const raw = new TextDecoder().decode(body);
  let expanded = manifest.extensions?.include === false ? raw : expand(files, entry).text;
  // 未被展开的指令（缩进的、或 include 关闭时）必须作为可见文本降级：
  // 否则行首的 <<< 会被 remark 当作 HTML 标签，再被 rehype-sanitize 清除，原文凭空消失（违反规范 §9）
  expanded = expanded.replace(/^(\s*)<<</gm, '$1&lt;&lt;&lt;');

  const html = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(symbolsPlugin, { enabled: opts.symbols !== false && manifest.extensions?.symbols !== 'off' })
    .use(remarkRehype)
    .use(rehypeSanitize) // 清 script / on* / javascript: 等
    .use(assetsPlugin, files, mode === 'inline')
    .use(rehypeStringify)
    .processSync(guardEscapes(expanded))
    .toString();

  return { html, mode, totalBytes, degraded };
}

/** 给 HTML 套一层最小文档壳（单文件自包含时内联 CSS 足够） */
export function wrapDocument(title: string, bodyHtml: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="data:,">
<style>
:root{color-scheme:light}
body{max-width:980px;margin:2rem auto;padding:0 1.25rem;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:#1f2328}
h1,h2,h3,h4{margin:1.6em 0 .6em;line-height:1.3;font-weight:600}
h1{padding-bottom:.3em;border-bottom:1px solid #d0d7de}
h2{padding-bottom:.3em;border-bottom:1px solid #d8dee4}
code{background:#f6f8fa;padding:.15em .35em;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.92em}
p{margin:.7em 0}
pre{overflow-x:auto;padding:1rem 1.2rem;margin:1.2em 0;background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;line-height:1.6}
pre code{background:none;padding:0;font-size:.9em}
table{border-collapse:collapse;width:100%;margin:1.5em 0;font-size:.95em;table-layout:auto;display:block;overflow-x:auto}
th,td{border:1px solid #d0d7de;padding:.6rem .9rem;text-align:left;vertical-align:top;overflow-wrap:break-word;word-break:normal}
th{background:#f6f8fa;font-weight:600}
tbody tr:nth-child(2n){background:#fafbfc}
blockquote{margin:1.2em 0;padding:.25rem 1rem;border-left:4px solid #d0d7de;color:#57606a;background:#f6f8fa;border-radius:0 6px 6px 0}
img{max-width:100%}
a{color:#0969da;text-decoration:none}
a:hover{text-decoration:underline}
hr{border:none;border-top:1px solid #d0d7de;margin:1.6rem 0}
ul,ol{padding-left:1.6em}
li{margin:.3em 0}
</style>
${bodyHtml}
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
