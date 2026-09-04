// mdpkg 浏览器端打开器（嵌入 md-bundle 网页工具用）
// 零 Node 依赖：unpack/validate/expand/render/pack 全链路在浏览器可跑（fflate + unified 生态均为纯 JS）。
// 管线与 CLI 一致（规范 §8.1）：解包 → 校验 → include 展开 → 解析 → 符号转换 → 渲染（消毒）→ 内联。
// 编辑闭环：
//   const r = await openMdpkg(bytes);
//   // 修改 r.files 中对应 Uint8Array（不要直接改 manifest.json 文本）
//   const out = packMdpkg(r.files, r.manifest ?? undefined);
//   // out 即为新的 .mdpkg 字节流，可交给浏览器下载
import { unpack, toBase64, pack } from '../src/zip-core.ts';
import { validatePackage, buildManifest, type Manifest, type ValidationResult, DEFAULT_ENTRYPOINT } from '../src/manifest.ts';
import { render as renderMarkup, wrapDocument } from '../src/render.ts';
import { expand } from '../src/include.ts';
import { MdeError, E } from '../src/errors.ts';

export interface OpenOptions {
  /** 符号扩展开关（默认 true，跟随 manifest.extensions.symbols） */
  symbols?: boolean;
}

export interface OpenResult {
  files: Map<string, Uint8Array>;
  manifest: Manifest | null;
  validation: ValidationResult;
  /** 完整自包含 HTML 文档（含 <!doctype> 与内联样式） */
  html: string | null;
  /** 渲染是否发生降级（包过大时 auto 降级 dir，浏览器端无文件系统，仅作提示） */
  degraded: boolean;
  /** 渲染阶段错误（校验错误见 validation.errors） */
  error: string | null;
}

/** 打开 .mdpkg：解包 → 校验 → 渲染。任何一步硬错误（非 ZIP 等）直接 throw MdeError */
export async function openMdpkg(bytes: Uint8Array, opts: OpenOptions = {}): Promise<OpenResult> {
  const files = await unpack(bytes);
  if (files.size === 0) throw new MdeError(E.E101, '不是有效的 ZIP 包（0 个条目）');

  let manifest: Manifest | null = null;
  const manifestRaw = files.get('manifest.json');
  if (manifestRaw) {
    try { manifest = JSON.parse(new TextDecoder().decode(manifestRaw)); } catch { manifest = null; }
  }

  const validation = validatePackage(files);

  try {
    const r = renderMarkup(files, { inline: true, symbols: opts.symbols });
    const entry = manifest?.entrypoint ?? DEFAULT_ENTRYPOINT;
    const title = entry.split('/').pop() ?? entry;
    return {
      files, manifest, validation,
      html: wrapDocument(title, r.html),
      degraded: r.degraded,
      error: null,
    };
  } catch (e) {
    return {
      files, manifest, validation,
      html: null,
      degraded: false,
      error: e instanceof MdeError ? e.message : String(e),
    };
  }
}

/** 读取入口 Markdown 原文（include 未展开）。预览源码用 */
export function readEntrySource(files: Map<string, Uint8Array>, entry = DEFAULT_ENTRYPOINT): string {
  const body = files.get(entry);
  if (!body) throw new MdeError(E.E303, `entrypoint 不存在: ${entry}`);
  return new TextDecoder().decode(body);
}

function readManifest(files: Map<string, Uint8Array>): Manifest | undefined {
  const raw = files.get('manifest.json');
  if (!raw) return undefined;
  try { return JSON.parse(new TextDecoder().decode(raw)); }
  catch { return undefined; }
}

/** 编辑后重新打包。files 中可包含旧的 manifest.json；本函数会将其删除并按规范 §4.2 重建。 */
export function packMdpkg(files: Map<string, Uint8Array>, prevManifest?: Manifest): Uint8Array {
  const work = new Map(files);
  const prev = prevManifest ?? readManifest(work);
  work.delete('manifest.json');
  const manifest = buildManifest(work, prev);
  return pack(work, manifest);
}

export { toBase64, expand, MdeError, buildManifest };
export type { Manifest, ValidationResult };