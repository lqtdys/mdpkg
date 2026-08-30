// manifest 生成与校验（M2）
// 字段归属表（规范 §4.2）：resources/size/sha256/media_type 每次重算；
// entrypoint/extensions/extensions_required/encoding 有则保留；spec_version 由工具决定，不继承。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js'; // ajv 8 默认只含 draft-07/2019-09；Schema 用 2020-12 必须走此入口（ESM 需带 .js）
import { MdeError, E } from './errors.ts';
import { normalizePath } from './container.ts';
import { expand } from './include.ts';

export const SPEC_VERSION = '1.0';
export const DEFAULT_ENTRYPOINT = 'document.md';

const MEDIA: Record<string, string> = {
  md: 'text/markdown', markdown: 'text/markdown', json: 'application/json',
  txt: 'text/plain', csv: 'text/csv',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
};

export function mediaType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA[ext] ?? 'application/octet-stream';
}

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export interface Manifest {
  mde: 'mde';
  spec_version: string;
  entrypoint?: string;
  encoding?: 'utf-8';
  extensions?: { symbols?: 'off' | 'core' | 'extended'; include?: boolean };
  extensions_required?: string[];
  resources: { path: string; media_type: string; size: number; sha256: string; source_url?: string }[];
}

/** 生成 manifest：机器事实重算，作者意图继承 */
export function buildManifest(files: Map<string, Uint8Array>, prev?: Manifest): Manifest {
  const inheritedUrls = new Map((prev?.resources ?? []).filter((r) => r.source_url).map((r) => [r.path, r.source_url!]));
  const resources = [...files.keys()]
    .map((p) => normalizePath(p))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((path) => {
      const data = files.get(path)!;
      const r: Manifest['resources'][number] = {
        path,
        media_type: mediaType(path),
        size: data.length,
        sha256: sha256(data),
      };
      const src = inheritedUrls.get(path);
      if (src) r.source_url = src;
      return r;
    });

  return {
    mde: 'mde',
    spec_version: SPEC_VERSION, // 不继承
    entrypoint: prev?.entrypoint ?? (files.has(DEFAULT_ENTRYPOINT) ? DEFAULT_ENTRYPOINT : undefined),
    encoding: prev?.encoding ?? 'utf-8',
    extensions: prev?.extensions,
    extensions_required: prev?.extensions_required,
    resources,
  };
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
let validator: ReturnType<typeof ajv.compile> | null = null;
function getValidator() {
  if (!validator) {
    const schema = JSON.parse(readFileSync(new URL('../../../spec/schema/manifest-1.0.json', import.meta.url), 'utf8'));
    validator = ajv.compile(schema);
  }
  return validator;
}

/** 扫描 Markdown 中的本地引用（M2 版：仅正则扫单文档；M4 起换 include 传递闭包） */
export function collectReferences(md: string, baseDir = ''): { local: string[]; external: number } {
  const local: string[] = [];
  let external = 0;
  const re = /!?\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  for (let m = re.exec(md); m; m = re.exec(md)) {
    const raw = m[1];
    if (/^(https?:)?\/\//i.test(raw) || /^(mailto|data|tel):/i.test(raw) || raw.startsWith('#') || raw.startsWith('<')) { external++; continue; }
    const p = decodeURIComponent(raw.split('#')[0].split('?')[0]);
    if (!p) continue;
    local.push(normalizePath(baseDir ? `${baseDir}/${p}` : p));
  }
  return { local, external };
}

/** 引用闭包校验：先展开 include 再收集引用，否则会漏掉被包含文档里的图片（规范 §6.2 第 4 条） */
export function checkClosure(files: Map<string, Uint8Array>, entrypoint: string): { orphans: string[] } {
  if (!files.has(entrypoint)) throw new MdeError(E.E303, `entrypoint 不存在: ${entrypoint}`);
  // expand 同时会校验 include 自身的错误（循环/深度/包外/…）
  const { text, sources } = expand(files, entrypoint);
  const { local } = collectReferences(text);
  const present = new Set([...files.keys()].map((p) => normalizePath(p)));

  for (const ref of new Set(local)) {
    const target = normalizePath(ref);
    if (!present.has(target)) throw new MdeError(E.E401, `引用的本地资源缺失: ${ref}（入口 ${entrypoint}）`);
  }
  const referenced = new Set(local.map((r) => normalizePath(r)));
  referenced.add(normalizePath(entrypoint));
  for (const s of sources) referenced.add(normalizePath(s.file)); // 被包含文件不算孤儿
  return { orphans: [...present].filter((p) => !referenced.has(p) && p !== 'manifest.json') };
}

/** 版本协商（规范 §8.5）：主版本不同必须拒绝；必需扩展不支持必须报错，不得静默降级 */
export const SUPPORTED_REQUIRED = new Set(['include', 'symbols', 'symbols:core']);
export function assertSupported(manifest: Manifest): void {
  const major = String(manifest.spec_version).split('.')[0];
  if (major !== '1') throw new MdeError(E.E701, `spec_version 主版本不支持: ${manifest.spec_version}（本实现支持 1.x）`);
  for (const r of manifest.extensions_required ?? []) {
    if (!SUPPORTED_REQUIRED.has(r)) throw new MdeError(E.E702, `extensions_required 含不支持项: ${r}`);
  }
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  externalCount: number;
}

/** 完整校验：Schema + 覆盖性 + size/sha256 + 路径 + entrypoint */
export function validatePackage(files: Map<string, Uint8Array>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = files.get('manifest.json');
  if (!raw) return { ok: false, errors: [`[${E.E102}] 缺少 manifest.json`], warnings, externalCount: 0 };

  let manifest: Manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(raw)); }
  catch (e) { return { ok: false, errors: [`[${E.E302}] manifest.json 不是合法 JSON: ${(e as Error).message}`], warnings, externalCount: 0 }; }
  try { assertSupported(manifest); }
  catch (e) { return { ok: false, errors: [e instanceof MdeError ? e.message : String(e)], warnings, externalCount: 0 }; }

  if (!getValidator()(manifest)) {
    for (const err of getValidator().errors ?? []) errors.push(`[${E.E302}] ${err.instancePath || '/'} ${err.message}`);
  }

  // 覆盖性：包内除 manifest.json 外全部文件都必须在 resources 中
  const actual = new Map([...files.keys()].filter((p) => p !== 'manifest.json').map((p) => [normalizePath(p), files.get(p)!]));
  const listed = new Map((manifest.resources ?? []).map((r) => [r.path, r]));
  for (const p of actual.keys()) if (!listed.has(p)) errors.push(`[${E.E304}] 包内文件未登记: ${p}`);
  for (const p of listed.keys()) if (!actual.has(p)) errors.push(`[${E.E304}] resources 登记了不存在的文件: ${p}`);

  for (const [p, data] of actual) {
    const r = listed.get(p);
    if (!r) continue;
    if (r.size !== data.length) errors.push(`[${E.E402}] size 不符: ${p}（manifest ${r.size} / 实际 ${data.length}）`);
    if (r.sha256 !== sha256(data)) errors.push(`[${E.E403}] sha256 不符: ${p}（完整性问题，非篡改证据）`);
  }

  const entry = manifest.entrypoint ?? DEFAULT_ENTRYPOINT;
  let externalCount = 0;
  try {
    if (!entry.toLowerCase().endsWith('.md')) throw new MdeError(E.E303, `entrypoint 非 Markdown: ${entry}`);
    const body = actual.get(normalizePath(entry));
    if (!body) throw new MdeError(E.E303, `entrypoint 不存在: ${entry}`);
    const { external } = collectReferences(new TextDecoder().decode(body));
    externalCount = external;
    const { orphans } = checkClosure(actual, normalizePath(entry));
    for (const o of orphans) warnings.push(`[${E.E404}] 孤儿资源（未被引用）: ${o}`);
  } catch (e) {
    errors.push(e instanceof MdeError ? e.message : String(e));
  }

  return { ok: errors.length === 0, errors, warnings, externalCount };
}
