// 重建 docs/ 站点：spec.html（英文，默认）+ spec.zh.html（中文）
// 用法：node scripts/build-site.ts（仓库根目录执行；需先 npm install 于 packages/mdpkg）
// 产物：docs/spec.html（英文渲染，GitHub Pages 默认 URL）+ docs/spec.zh.html（中文渲染）
// 语言切换：两页顶部注入互链导航；<html lang> 与 <title> 一并修正
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PKG = join(ROOT, "packages", "mdpkg");
const SPEC = join(ROOT, "spec");
const DOCS = join(ROOT, "docs");

// 临时目录中的固定文件名（与 cli.ts 的默认入口约定一致）
const DEFAULT_ENTRY = "document.md";
const PKG_NAME = "out.mdpkg";
const HTML_NAME = "out.html";
const CLI_TIMEOUT_MS = 60_000; // execFileSync 兜底，防止 CLI 挂起阻塞构建

const NAV_CSS = `
<style>
.lang-switch{max-width:980px;margin:1.5rem auto 0;padding:0 1.25rem;text-align:right;font-size:.92em;color:#57606a}
.lang-switch a{color:#0969da;text-decoration:none}
.lang-switch a:hover{text-decoration:underline}
</style>`;

interface SiteVersion {
  source: string; // 源 markdown（相对 spec/）
  dest: string; // 输出文件名（相对 docs/）
  lang: string; // <html lang>
  title: string; // <title>
  nav: string; // 语言切换条 HTML
}

/** 语言切换条：当前语言加粗，另一语言为互链 */
function nav(active: string, otherLabel: string, otherHref: string): string {
  return `<nav class="lang-switch"><strong>${active}</strong> · <a href="${otherHref}">${otherLabel}</a></nav>`;
}

const VERSIONS: SiteVersion[] = [
  {
    source: "mdpkg-format-spec.en.md",
    dest: "spec.html",
    lang: "en",
    title: "mdpkg Format Specification v1.0",
    nav: nav("English", "简体中文", "spec.zh.html"),
  },
  {
    source: "mdpkg-format-spec.md",
    dest: "spec.zh.html",
    lang: "zh-CN",
    title: "mdpkg 格式规范 v1.0",
    nav: nav("简体中文", "English", "spec.html"),
  },
];

function runCli(args: string[]): void {
  try {
    execFileSync(process.execPath, args, { cwd: PKG, timeout: CLI_TIMEOUT_MS });
  } catch (e) {
    const hint =
      e instanceof Error && e.message.includes("ERR_MODULE_NOT_FOUND")
        ? "（请先执行 cd packages/mdpkg && npm install）"
        : "";
    throw new Error(
      `CLI 执行失败: ${args[1]}${hint}: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/** 断言渲染输出包含预期标记后替换；缺失即抛错，避免静默产出残缺页面 */
function inject(
  html: string,
  needle: string,
  replacer: (s: string) => string
): string {
  if (!html.includes(needle)) {
    throw new Error(
      `build-site: 渲染输出缺少预期标记 "${needle}"，无法注入，请检查 render 输出格式`
    );
  }
  return html.replace(needle, replacer);
}

function renderOne(v: SiteVersion): void {
  const src = join(SPEC, v.source);
  if (!existsSync(src)) throw new Error(`缺少源文件: ${src}`);
  const tmp = mkdtempSync(join(tmpdir(), "mdpkg-site-"));
  try {
    // 源文件重命名为默认入口，走真实 CLI：pack → render
    writeFileSync(join(tmp, DEFAULT_ENTRY), readFileSync(src));
    const pkg = join(tmp, PKG_NAME);
    runCli(["src/cli.ts", "pack", tmp, "-o", pkg]);
    const raw = join(tmp, HTML_NAME);
    runCli(["src/cli.ts", "render", pkg, "-o", raw]);
    // 注入：<html lang> + 语言切换条 + 修正 title，并补齐收尾 </html>
    let html = readFileSync(raw, "utf8");
    html = inject(
      html,
      "<!doctype html>",
      `<!doctype html>\n<html lang="${v.lang}">`
    );
    html = inject(html, "</style>", `</style>${NAV_CSS}${v.nav}`);
    const titleRe = /<title>[^<]*<\/title>/;
    if (!titleRe.test(html)) {
      throw new Error(
        `build-site: 渲染输出缺少预期标记 "<title>…</title>"，无法注入，请检查 render 输出格式`
      );
    }
    html = html.replace(titleRe, `<title>${v.title}</title>`);
    html = html.trimEnd();
    if (!html.endsWith("</html>")) html += "\n</html>\n";
    const dest = join(DOCS, v.dest);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, html);
    process.stdout.write(`build-site: ${v.source} → docs/${v.dest}\n`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 各版本独立构建：单个失败不阻断其余，全部完成后统一报错退出
const failures: string[] = [];
for (const v of VERSIONS) {
  try {
    renderOne(v);
  } catch (e) {
    failures.push(`${v.source}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
if (failures.length > 0) {
  process.stderr.write(failures.join("\n") + "\n");
  process.exit(1);
}
process.stdout.write(
  `build-site: done（${VERSIONS.map((v) => v.dest).join(" + ")}，互链切换）\n`
);
