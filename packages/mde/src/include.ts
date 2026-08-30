// 文件包含：解析前展开（规范 §7.2）
// 触发规则：仅在列 0 且整行匹配 INCLUDE_RE 时触发。不感知代码块——解析前无 AST，
// 判断围栏需自研 Markdown 扫描器，必然导致实现分叉（已知局限：列 0 围栏内的指令会被展开）。
// 相对基准：被包含文件 P 中的相对引用 R 重写为 normalize(dirname(P) + '/' + R)，
// 使展开后文本自洽，render 与 export --expanded 共用同一中间产物。
import { MdeError, E } from './errors.ts';
import { normalizePath } from './container.ts';

export const INCLUDE_RE = /^<<<\s*(.+?)\s*$/;
export const INCLUDE_LIMITS = { depth: 32, maxBytes: 10 * 1024 * 1024, maxCount: 1000 };

export interface ExpandResult {
  text: string;
  /** 展开后第 i 行 → 原始出处（SHOULD，用于错误定位） */
  sources: { file: string; line: number }[];
  count: number;
}

const isUrl = (p: string) => /^(https?:)?\/\//i.test(p) || /^(mailto|data|tel):/i.test(p);

/** 把一行内的相对资源引用按 baseDir 重写（只动 Markdown 的 ](...) 目标） */
function rewriteLine(line: string, baseDir: string): string {
  if (!baseDir) return line;
  return line.replace(/\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (whole, raw: string) => {
    if (isUrl(raw) || raw.startsWith('#') || raw.startsWith('/')) return whole;
    const [pathPart, ...rest] = raw.split(/(?=[?#])/);
    const rewritten = normalizePath(`${baseDir}/${pathPart}`);
    return `](${rewritten}${rest.join('')})`;
  });
}

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

interface State { count: number; bytes: number; sources: { file: string; line: number }[]; out: string[] }

function expandFile(files: Map<string, Uint8Array>, path: string, depth: number, stack: string[], st: State): void {
  if (depth > INCLUDE_LIMITS.depth) throw new MdeError(E.E504, `include 深度超过 ${INCLUDE_LIMITS.depth}（栈: ${stack.join(' → ')}）`);
  if (stack.includes(path)) throw new MdeError(E.E507, `检测到循环包含: ${[...stack, path].join(' → ')}`);
  const data = files.get(path);
  if (!data) throw new MdeError(E.E508, `include 目标不存在: ${path}`);
  stack.push(path);

  const base = dirname(path);
  const lines = new TextDecoder().decode(data).split('\n');
  lines.forEach((raw, idx) => {
    const m = INCLUDE_RE.exec(raw);
    if (m) {
      let target = m[1].trim();
      if (target.startsWith('"') && target.endsWith('"')) target = target.slice(1, -1);
      if (isUrl(target)) throw new MdeError(E.E502, `include 目标为 URL: ${target}（v1 禁止远程包含）`);
      let norm: string;
      try { norm = normalizePath(target); }
      catch { throw new MdeError(E.E501, `include 目标在包外: ${target}`); }
      if (!norm.toLowerCase().endsWith('.md')) throw new MdeError(E.E503, `include 目标非 Markdown: ${norm}`);
      if (++st.count > INCLUDE_LIMITS.maxCount) throw new MdeError(E.E506, `include 次数超过 ${INCLUDE_LIMITS.maxCount}`);
      expandFile(files, norm, depth + 1, stack, st);
      return;
    }
    st.out.push(rewriteLine(raw, base));
    st.sources.push({ file: path, line: idx + 1 });
    st.bytes += raw.length + 1;
    if (st.bytes > INCLUDE_LIMITS.maxBytes) throw new MdeError(E.E505, `展开后超过 ${INCLUDE_LIMITS.maxBytes / 1048576}MB`);
  });
  stack.pop();
}

export function expand(files: Map<string, Uint8Array>, entry: string): ExpandResult {
  const st: State = { count: 0, bytes: 0, sources: [], out: [] };
  expandFile(files, entry, 1, [], st);
  return { text: st.out.join('\n'), sources: st.sources, count: st.count };
}
