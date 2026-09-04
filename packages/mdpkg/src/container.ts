// ZIP 容器层（Node 侧）：目录收集 · 路径解析
// 纯 ZIP 逻辑（pack/unpack/list/normalizePath/LIMITS/toBase64）在 zip-core.ts（浏览器/Node 通用），
// 此处 re-export 保持既有 import 路径不变。
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { MdeError, E } from './errors.ts';
import { normalizePath, MDE_EPOCH, LIMITS, MAX_PATH_BYTES, unpack, list, toBase64, pack } from './zip-core.ts';

export { normalizePath, MDE_EPOCH, LIMITS, MAX_PATH_BYTES, unpack, list, toBase64, pack };

/** 递归收集目录内文件；拒绝符号链接与硬链接 */
export function collectFiles(dir: string, base = dir): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) throw new MdeError(E.E601, `拒绝符号链接: ${relative(base, abs)}`);
      if (st.isDirectory()) { walk(abs); continue; }
      if (st.nlink > 1) throw new MdeError(E.E601, `拒绝硬链接: ${relative(base, abs)}`);
      const rel = normalizePath(relative(base, abs));
      out.set(rel, new Uint8Array(readFileSync(abs)));
    }
  };
  walk(dir);
  return out;
}

/** 从目录解析出绝对路径（防目录遍历） */
export function resolveInside(base: string, target: string): string {
  const abs = resolve(base, target);
  const rel = relative(resolve(base), abs);
  if (rel.startsWith('..') || rel === '' || rel.startsWith(sep)) throw new MdeError(E.E202, `路径逃逸出基准目录: ${target}`);
  return abs;
}