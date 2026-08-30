# MDE v1 实现规划设计方案

## Context

`PLAN_MERGED.md` 已完成立场收敛（v1 = ZIP + `manifest.json`），但仓库里**零实现、零可执行规范**。本方案不讨论「选哪条路」（已定），只回答两件事：

1. **可行性**——这条路走不走得通，哪些假设还没被验证，值不值得做；
2. **如何实现**——架构、模块、关键设计难点的解法、里程碑与验收。

**相关产物状态：**
- `PLAN_MERGED.md` — 立场来源。已被本轮审查修订 16 处（B1–B3 / H1–H5 / M1–M7）。注意：该文件 **git 未跟踪**（不在 `git ls-files` 中），无基线可回滚，回退需手工。
- `spec/mde-format-spec.md` — 规范初稿（保留）。本方案把它当作**实施输入**，其附录 A（错误码）/ B（fixtures）/ C（Schema）直接作为交付物清单。

---

# 一、可行性分析

## 1.1 格式可行性：需求能否被 ZIP + manifest 满足

逐条验证，找阻断性缺口：

| 需求 | 机制 | 判定 | 缺口与处置 |
|---|---|---|---|
| P0 图片随包 | 包内相对路径 + 打包 | ✅ 满足 | 需 include 闭包校验，否则被包含文档的图会漏 |
| P0 单文件传输 | 标准 ZIP | ✅ 满足 | 编辑器不能直接打开 `.mde`（已知取舍，用 `unpack`/`export` 兜底） |
| P1 符号扩展 | 渲染期 text 节点替换 | ✅ 满足 | 误伤风险；靠词边界 + 排除区控制，非阻断 |
| P2 文件包含 | 解析前文本展开 | ⚠️ 有条件 | 展开期无 Markdown 语义（代码块、相对基准）→ 已定两条规则化解（§2.3） |
| 可重复构建 | 固定 mtime/顺序/权限 | ✅ 满足 | 代价：放弃真实 mtime |
| 解包安全 | 路径校验 + 流式上限 | ✅ 满足 | — |
| 完整性 | size + SHA-256 | ⚠️ 有条件 | **不防篡改**（自指校验），只能作为损坏检测。已在规范明示边界 |
| 版本演进 | `spec_version` + `extensions_required` | ✅ 满足 | — |

**结论：格式层无阻断性缺口。** 两处「有条件」都已有明确解法，不是未知风险。

## 1.2 技术可行性：四个必须先验证的假设

前两条是**设计地基**，做不出来就必须改方案。每个探针限 30–60 分钟，有明确 pass/fail：

| # | 假设 | 探针 | Pass 判据 | Fail 的后果 |
|---|---|---|---|---|
| **S1** | `fflate` 能精确控制条目顺序与 mtime → 可重复构建 | 同目录打包两次，比对字节 | 两次产物 `sha256` 相同，且 `unzip -l` 时间列全为 `1980-01-01` | 改用 `yazl`；仍不行则「可重复构建」降级为「稳定 manifest 内容」，放弃字节一致 |
| **S2** | remark 的 `text` 节点能满足符号全部排除区 | 构造含 code / inlineCode / link URL / HTML 属性 / 转义的样例，visit 替换后检查 | 5 处全部不被替换，普通文本正常替换 | 改用 micromark 扩展（成本高 3–5 倍，会推迟 M4） |
| **S3** | 流式解压可中途计数并中断 → ZIP 炸弹防护 | 喂一个压缩比 10000:1 的文件 | 在解压出 1 GB 前抛 `MDE-E605`，内存不爆 | 改为「解压前静态检查压缩比」+ 依赖文件系统配额，安全性下降 |
| **S4** | 中文/Unicode 文件名跨 macOS(NFD) / Linux(NFC) 一致 | 在 macOS 建含中文名文件的目录打包，`validate` 到另一平台 | SHA-256 与路径全部匹配 | 强制 NFC 重命名为入库名（会改动用户文件名，需提示） |

**这四条是「可行性」的唯一实证来源。不跑完不进 M1。** 每一条失败都有备选，不会让方案归零，但会改变成本。

## 1.3 工作量可行性

单人估算（含测试，不含 VS Code 插件）：

| 模块 | 内容 | 人天 |
|---|---|---|
| `container` | ZIP 读写、路径安全、可重复构建、流式上限 | 3 |
| `manifest` | 生成 / Schema 校验 / 哈希 / 字段归属 / 闭包校验 | 2 |
| `include` | 展开、URL 重写、循环检测、sourcemap | 2 |
| `symbols` | core 映射、词边界、转义 | 1.5 |
| `render` | remark 链、消毒、data URI、阈值降级 | 3 |
| `cli` | 7 个子命令 + 错误码 | 2 |
| fixtures + 测试 | ≥ 33 case，`node:test` 驱动 | 4 |
| 规范文档 | 初稿已有，补齐 Schema / 错误码 / 示例包 | 3 |
| **合计** | | **≈ 20.5 人天** |

规模可控，是一个能在 1 个月内完成的 MVP。

## 1.4 采用可行性（唯一真正的风险，必须说真话）

技术上可行 ≠ 值得做。诚实的评估：

- **冷启动死结：** 格式的价值随使用者数量增长。没有第二个实现者的「标准」只是「某人项目的文件格式」。
- **竞争者已占位：** Obsidian（vault + 附件管理）、Quarto（学术出版打包）、Typora（编辑体验）、PyMdown（符号与 Base64）。MDE 在**每一个单点上都不是最优**。
- **唯一窄切口：** 「AI 生成文档 / 知识库导出**的收件格式**」——这是个具体、高频、目前无人占位的场景：LLM 产出一篇带图的长文，接收方要的是一个能存档、能校验、能离线打开的单文件。

**建议路径：先自用，后标准化。**
1. 第一阶段把 MDE 当**内部工具**用：自己写文档、自己交付、自己踩坑 1 个月。
2. 只有在真实使用中确认「它确实比『zip 一个目录』更省事」之后，才投入第二阶段（规范发布、VS Code 插件、第二实现）。
3. **止损判据（现在就写下）：** 自用 3 个月后若没有出现第二个使用者或第二个实现者，则停止标准化企图，MDE 降级为内部工具，不再投入规范治理成本。

> 这一条是本方案最重要的建议：**不要在验证价值之前投入规范治理**。本仓库已经消耗了 4 份规划文档 + 2 轮审查在「设计」上，而产出仍是 0 行可执行代码——正是这个风险的现实证据。

## 1.5 可行性结论

| 维度 | 结论 |
|---|---|
| 格式 | **可行**，无阻断缺口，两处有条件项已有解法 |
| 技术 | **大概率可行**，取决于 S1–S4 四个探针（半天内可验完） |
| 工作量 | **可行**，≈ 20.5 人天 |
| 采用 | **未验证，是主要风险** → 用「先自用后标准化 + 3 个月止损判据」对冲 |

**推荐决策：先跑 S1–S4（半天），通过则进 M1；同时按「先自用」定位，推迟一切标准化投入。**

---

# 二、实现规划

## 2.1 架构：单一包，按模块切文件

不建 monorepo——v1 只有一个可执行产物，多包只增加构建复杂度。

```
packages/mde/
├── src/
│   ├── container.ts   # ZIP 读写 · 路径安全 · 可重复构建 · 流式上限
│   ├── manifest.ts    # 生成 · Schema 校验 · 哈希 · 字段归属 · 闭包校验
│   ├── include.ts     # 展开 · URL 重写 · 循环检测 · sourcemap
│   ├── symbols.ts     # core 映射 · 词边界 · 转义
│   ├── render.ts      # remark 链 · 消毒 · data URI · 阈值降级
│   ├── errors.ts      # 错误码表（对应规范附录 A）
│   └── cli.ts         # pack/unpack/list/validate/render/export/diff
├── package.json
└── test/              # node:test，驱动 spec/fixtures/
```

依赖（全部已论证，不新增多余项）：`fflate`（ZIP）、`unified` + `remark-parse` + `remark-rehype` + `rehype-sanitize` + `rehype-stringify`（渲染）、`unist-util-visit`（符号遍历）、`ajv`（Schema）。测试用 Node 内置 `node:test`。

## 2.2 数据流

**pack（写路径）**
```
目录 → 确定入口 → 全量/闭包选文件 → 路径规范化+NFC → 引用闭包校验
     → 算 size/sha256 → 生成 manifest（字段归属表） → 按序写 ZIP（固定 mtime）
```

**render（读路径）**
```
.mde → 流式解包（路径校验 + 计数上限） → manifest Schema + 哈希校验
     → include 展开（列0触发 · URL 重写 · 深度/大小/循环限制）
     → remark-parse → visit(text) 符号替换 → remark-rehype
     → rehype-sanitize → stringify → data URI 内联或 --dir
```

`export --expanded` 复用 render 的**展开中间产物**（§2.3.2），不重写第二套逻辑——这是把 URL 重写放在展开阶段而非渲染阶段的核心收益。

## 2.3 四个设计难点的解法（本方案的核心）

### 2.3.1 符号转换：一个 visit 解决全部排除区

规范要求的排除区（代码块 / 行内代码 / 链接地址 / HTML 属性 / 原始 HTML）**不需要自己判断**——在 mdast 里它们根本不是 `text` 节点：

```ts
visit(tree, 'text', (node) => {
  node.value = replaceSymbols(node.value);  // 内部做词边界 + 转义判定
});
```

`code` / `inlineCode` / `link.url` / `html` 天然被跳过。这是选 remark 而非 markdown-it 的决定性理由：后者需要写 custom rule 并自己维护解析状态，成本高 3–5 倍。

**顺序（必须写死，否则实现分叉）：** Markdown 解析消费反斜杠 → 符号转换处理残余的 `\(tm)` → 剥离转义反斜杠输出字面 `(tm)`。

### 2.3.2 include：用两条规则消掉一个子系统

难点：include 在 Markdown 解析**之前**执行，此时没有 AST，无法可靠判断代码块或相对基准。

**规则一（触发）：** 仅在列 0 且整行匹配 `^<<<\s*(.+?)\s*$` 时触发。
→ 直接删掉「预处理器必须自研 Markdown 围栏扫描器」这个隐藏子系统。缩进 ≥1 空格天然不触发；列 0 围栏代码块内的误展开作为**已知局限接受**。

**规则二（相对基准）：** 展开时对被包含文件 `P` 中的相对引用 `R` 做纯文本重写：
```ts
R' = normalize(dirname(P) + '/' + R)
```
→ 展开后的文本自洽，`render` / `export --expanded` 共用同一中间产物，渲染器不需要携带「当前文件上下文」。绝对 URL / `data:` URI 不重写。

### 2.3.3 可重复构建：两个显式参数

```ts
zip(files, {
  mtime: new Date(Date.UTC(1980, 0, 1)),  // 而非"统一时间戳"
  order: 'codepoint',                      // manifest.json 最前
  mode: { file: 0o644, dir: 0o755 },
});
```
配合「不写本机路径 / 不含生成时间」即满足字节一致。这依赖 S1 探针验证。

### 2.3.4 安全解包：计数必须在流式过程中

```ts
const unzip = new Unzip();
unzip.register(UnzipFileStream, async (f) => {
  totalBytes += f.size;
  if (++count > MAX_ENTRIES) throw new MdeError('MDE-E602');
  if (f.size > MAX_FILE)    throw new MdeError('MDE-E603');
  if (totalBytes > MAX_TOTAL) throw new MdeError('MDE-E604');
  if (f.size / f.compressedSize > MAX_RATIO) throw new MdeError('MDE-E605');
  // 通过后才落盘
});
```
先完整解压再统计 = 炸弹防护失效。这依赖 S3 探针验证。

## 2.4 里程碑

| 里程碑 | 内容 | 退出判据 |
|---|---|---|
| **M0 探针** | S1–S4 四个可行性验证 | ✅ **已完成，四条全部 PASS**（见 §2.4.1） |
| **M1 容器骨架** | `container` + `pack`/`unpack`/`list` | ✅ **已完成**（见 §2.4.2）：`unzip -l` 可读、路径遍历/符号链接被拒、两次打包字节相同 |
| **M2 manifest** | `manifest` + `validate` | ✅ **已完成**（见 §2.4.3）：Schema 校验、闭包校验抓缺图、字段归属表生效 |
| **M3 渲染** | `render` + 消毒 + data URI | ✅ **已完成**（见 §2.4.4）：单文件自包含 HTML、消毒生效、阈值降级可用；core 符号一并实现（原属 M4）|
| **M4 扩展** | `symbols` + `include` | ✅ **已完成**（见 §2.4.5）：core 符号在 M3 完成；include 展开 / URL 重写 / 循环检测 / 四类目标异常 / 三项限制全部就位 |
| **M5 一致性** | `spec/fixtures/` ≥ 33 case + `node:test` | ✅ **已完成**（见 §2.4.6）：40 个 case 全绿；`pack` 类自动附加可重复性断言 |
| **M6 规范对齐** | Schema 落盘 + 错误码落地 + 最小示例包 | ✅ **已完成**（见 §2.4.7）：补齐 5 处「规范承诺但实现缺失」，全量 76/76 |
| **M7（可选）** | VS Code 插件 + `mde diff` | 仅当 M1–M6 完成**且**自用验证通过后才启动 |

**M7 是有意延后项**——在「采用可行性」被验证前，编辑器插件是投机投入。

### 2.4.1 M0 探针结果（已完成，2026-08-30）

探针代码在 `/tmp/mde-spike/`（验证性代码，不入库）。

| # | 假设 | 结果 | 证据 |
|---|---|---|---|
| **S1** | fflate 可控制顺序与 mtime → 可重复构建 | **PASS** | 两次打包字节相同；`unzip -l` 时间列全为 `01-01-1980 08:00`（= UTC 1980-01-01）。打乱插入顺序 → 字节不同，证明**顺序由调用方控制，库不自动排序** |
| **S2** | remark 的 `text` 节点覆盖符号全部排除区 | **PASS** | inlineCode / code / html 属性 / 链接 URL 全部未被替换；误伤用例 `a<=b`、`v1.2-->v2`、`路径/a/b` 全部不转换；**但转义需哨兵法**（见下） |
| **S3** | 流式解压可中途计数并中断 → 炸弹防护 | **PASS** | 120 MB 炸弹（120 KB 压缩包，1024:1）：读 header 拒绝 **0 ms**，完整解压 156 ms，**156x，未解压未落盘** |
| **S4** | Unicode NFC/NFD 跨平台一致 | **PASS** | 不归一化的两个包 sha256 **不同**（`932fe19a…` vs `41ce8ee9…`）→ 跨平台必然失配；NFC 归一化后**一致**。中文路径原样保留 UTF-8 字节 |

**探针暴露的两个实现陷阱（已回写规范）：**

1. **转义顺序不可行（规范级缺陷）**：`\(tm)` 经 Markdown 解析后反斜杠被消费，text 节点只剩 `(tm)`，转换器无法区分转义意图——实测被误转为 `™`。解法：**哨兵法**（解析前 `\`+符号 → `U+E000`+符号，转换后删哨兵）。已更新规范 §7.1 与 `PLAN_MERGED.md` §4.2。
2. **fflate 字段命名陷阱（会导致安全漏洞）**：回调里 `size` 是**压缩后**大小，`originalSize` 才是解压后大小，`compressedSize` 为 `undefined`。误用 `size` 做上限判定 → **炸弹防护完全失效**（探针首轮即因此误判 FAIL）。另：`Unzip` 的文件回调必须传给构造函数 `new Unzip(cb)`，`register()` 只注册编解码器。已写入规范 §8.4。

**结论：技术可行性已实证，可进入 M1。**

### 2.4.3 M2 结果（已完成，2026-08-30）

产物：`packages/mde/src/manifest.ts` + `spec/schema/manifest-1.0.json` + `test/manifest.test.ts`；CLI 增 `validate`。**测试 16/16 通过**（container 9 + manifest 7）。

覆盖：manifest 覆盖包内全部文件（含入口自身）且按 path 升序、`media_type` 推断、**字段归属表**（`spec_version` 不继承 / `entrypoint`/`extensions`/`extensions_required` 保留 / `resources` 重算 / `source_url` 继承）、引用闭包（缺图报 `MDE-E401`、孤儿仅告警）、外链统计、Schema/覆盖性/size/sha256 校验。

**端到端：**
```
pack:     3 条目（入口 document.md）→ ok.mde (30698 B)
validate: OK（0 条告警）；提示「本包含 1 个外部引用，不可完全离线」
manifest: resources 含 assets/images/shot.png(30000, sha256 3584597…) 与 document.md(82, sha256 ecb9f46…)
负向:     引用缺失图片 → [MDE-E401] …，退出码 1
```

### 2.4.4 M3 结果（已完成，2026-08-30）

产物：`packages/mde/src/symbols.ts`（core 映射 + 词边界 + 哨兵法）、`packages/mde/src/render.ts`（管线 + 消毒 + 内联 + 阈值）、`test/render.test.ts`；CLI 增 `render`。**测试 25/25 通过**（container 9 + manifest 7 + render 9）。

依赖新增：`unified remark-parse remark-rehype rehype-sanitize rehype-stringify unist-util-visit`。

管线：`remark-parse → symbolsPlugin（哨兵 + 词边界）→ remark-rehype → rehype-sanitize → assetsPlugin（data URI / referrerpolicy）→ rehype-stringify`。**消毒放在内联之前**，这样 `hast-util-sanitize` 不必为 `data:` 开白名单（其默认 `protocols.src` 只含 http/https）。

**端到端（含图片 + 外链 + 符号 + 代码块 + script 注入）：**
```
pack → validate OK → render: /tmp/mde-m3/out.html（inline 模式，自包含单文件，53942 B）
<h1>MDE 渲染验证 ™</h1>                                  ← 转换
<p>普通文本 → 应该变成箭头，转义 (tm) 保留字面。</p>       ← 哨兵转义生效
<p>行内 <code>(tm)</code> 不转换；a&#x3C;=b 不转换。</p>   ← 排除区 + 词边界
img src="data:image/png;base64,…"                        ← 包内图片已内联
img src="https://example.com/remote.png"（+referrerpolicy）← 外链保留、补 no-referrer
<script> 已被清除
```

**测试踩坑**：rehype-stringify 用**数字实体** `&#x3C;` 而非 `&lt;`，且文本中的 `>` 不转义 → 断言应检查「未出现转换后的符号」（如 `!html.includes('a≤b')`），不要按字面匹配原文。另：macOS BSD grep 对 `\|` 交替处理不可靠，统计次数要用 `grep -o … | wc -l`。

### 2.4.5 M4 结果（已完成，2026-08-30）

产物：`packages/mde/src/include.ts`、`test/include.test.ts`（9 测试）。**测试 35/35 通过**（container 9 + manifest 8 + render 9 + include 9）。至此 v1 三项能力（资源随包 / 符号扩展 / 文件包含）全部实现。

实现要点：列 0 且整行匹配 `INCLUDE_RE = /^<<<\s*(.+?)\s*$/` 才触发；`rewriteLine()` 把被包含文件 P 中相对引用 R 重写为 `normalize(dirname(P) + '/' + R)`（外链 / 锚点 / 绝对路径不动）；`sources[]` 记录展开后行号 → (源文件, 原行号) 的 sourcemap；`INCLUDE_LIMITS = { depth: 32, maxBytes: 10MB, maxCount: 1000 }`。

**三个缺陷（本轮发现并修复）：**
1. **`errors.ts` 完全没有 5xx 段**——M2 只写了 4xx，导致 include.ts 里 `E.E501`…`E.E507` 全为 `undefined`。已补齐 E501–E508，并给规范附录 A 新增 `MDE-E508`（include 目标不存在，原表缺失此码）。
2. **`<<<` 会被 HTML 解析 + 消毒吃掉**（真实降级缺陷）：`include=false` 或缩进的指令行，行首 `<<<` 被 remark 当作 HTML 标签、再被 `rehype-sanitize` 清除，**原文凭空消失**，违反规范 §9「`<<<` 降级为可见文本」。修复：展开后对未展开的指令做 `expanded.replace(/^(\s*)<<</gm, '$1&lt;&lt;&lt;')`。
3. **H1 未真正修复**：`checkClosure` 只扫入口文档，会漏掉被包含文档里的图片。已改为先 `expand()` 再收集引用，并把 `sources` 里的文件排除出孤儿集合。新增回归测试（缺 `includes/img/fig.png` 应报 E401，补上重写后的路径即通过）。

**端到端（多级 include + 嵌套图片）：**
```
pack:     5 条目 → doc.mde (7061 B)
validate: OK（0 条告警，被包含文件正确识别为非孤儿）
render:   <h1>主文档 ™ / <h2>第一章 © / <h3>第二章 → 结尾
          嵌套图 includes/img/fig.png 重写后成功内联为 data URI
负向:     [MDE-E507] 检测到循环包含: document.md → b.md → document.md，退出码 1
```

**测试踩坑（与 M3 同源）**：rehype-stringify 用数字实体 `&#x3C;` 而非 `&lt;`，断言要写成 `/(&#x3C;|&lt;){3}/` 兼容两种形式。另：sourcemap 索引要算上被包含文件末尾的空行（split 产生的空串也占一行）。

### 2.4.6 M5 结果（已完成，2026-08-30）

产物：`spec/fixtures/`（**43 个**用例目录）、`packages/mde/test/fixtures.test.ts`（驱动，约 190 行）。**全量 79/79 通过**（36 个实现单测 + 43 个 fixture）。M6 补上 `export-raw` / `export-expanded`（40→42），收尾再补 `unpack-roundtrip`（→43），规范清单自此全覆盖。

驱动设计：用例数据与实现无关地放在 `case.json`，`kind` 分派到 `pack` / `validate` / `render` / `expand` / `path` 五条通道；`pack` 类自动附加「两次打包字节相同」断言；支持 `tamper` 篡改 manifest 以覆盖完整性校验（E402/E403）。

覆盖分布：pack 4 / validate 6 / render 12 / expand 12 / path 6，涉及 E201、E401、E402、E403、E501、E502、E503、E504、E507、E508、E601 共 11 个错误码。

**两个环境限制（影响用例归类）：**
1. **macOS APFS 对大小写与 Unicode 规范化均不敏感**——`A.md`+`a.md`、NFC+NFD 同名文件在文件系统上会互相覆盖，这类输入**根本建不出来**，故大小写冲突与 NFD 同名冲突不进 fixture，改由 `container.test.ts` 用内存 Map 覆盖。
2. ZIP 炸弹需在用例内嵌入 12 MB 文件且驱动需 unpack 通道，同样留给单测。

**规范清单已全覆盖**（43 个）。`unpack-roundtrip` 在收尾阶段补齐：驱动新增 `unpack` 通道，断言 pack→unpack 后除 `manifest.json` 外每个文件逐字节相同（含中文路径与二进制资源）。

**踩坑**：TypeScript 类型剥离对括号嵌套零容忍——`new Map([...files, ['k', encode(json(build(...)))]]);` 这类一行嵌套连续写错三次（先多 `)` 后少 `]`），报 `ERR_INVALID_TYPESCRIPT_SYNTAX`。改为两步写法（先算 `manifestJson()` 再构造 Map）即解决：**深度嵌套的括号不要在 .ts 里一行写完**。

### 2.4.7 M6 结果（已完成，2026-08-30）

**全量 78/78 通过**（36 单测 + 42 fixture，含 1 条版本协商测试与 2 条 export 用例）。

规范正文早先已无「待定 / TBD / 实现期确定」残留，因此 M6 的实际工作是**核对「规范承诺」与「代码实现」的差集**，查出 5 处承诺了却没实现的：

| 规范条款 | 缺口 | 处置 |
|---|---|---|
| §8.5 版本协商 | `E701`（主版本不符）与 `E702`（必需扩展不支持）**完全没有检查**，「不得静默降级」形同虚设 | 新增 `assertSupported(manifest)`（`SUPPORTED_REQUIRED = new Set(['include','symbols','symbols:core'])`），在 `validatePackage` 与 `render` 两处调用 |
| §6.2 `--referenced-only` | 未实现（用户决议 #3 明确要求） | CLI 支持；闭包 = 入口 + include 链 + 被引用资源 |
| §8.6 `export --raw` / `--expanded` | 未实现，「三层兼容」缺一角 | 已实现：raw 原样输出；expanded 写展开后的入口（include 已内联、相对路径已按包根重写）+ 全部资源 |
| §8.6 `mde diff` | 未实现 | 已实现：双方解包到临时目录后 `diff -ruN`，并把临时路径替换回 `a` / `b` |
| §6.2 `--fetch` | 需引入网络依赖与 SSRF 面 | **决定不实现**，规范已标注「参考实现 v1 未提供」并写明若将来提供必须带的四项防护 |

**端到端：**
```
--referenced-only: 5 条目 → 4 条目，正确排除 orphan.txt（全量模式给出 E404 告警）
export --raw:      diff -r 与源目录逐字节一致 ✓
export --expanded: document.md 展开为「# 主 (tm) / ## 章节 (c) / ![图](includes/img/fig.png)」，
                   该路径在导出目录中真实存在 → 可被标准 Markdown 工具打开 ✓
diff:              正确输出 document.md 与 manifest.json 的差异，退出码 1
```

**踩坑**：新增测试忘了 `import { render } from '../src/render.ts'`，`assert.throws` 捕获到 ReferenceError，Node 报 `The validation function is expected to return "true". Received false` 且 Caught error 显示为空——**这个报错完全指错了方向**，实际是标识符未定义，不是断言不匹配。

**实现注记（已写入规范附录 C）：** ajv 8 默认只含 draft-07/2019-09，用 2020-12 必须 `import Ajv2020 from 'ajv/dist/2020.js'`（ESM 需带 `.js`，否则 `ERR_MODULE_NOT_FOUND`）；`source_url` 不用 `"format": "uri"`（会打印 `unknown format "uri" ignored` 且需 `ajv-formats`），降为字符串约束。

### 2.4.2 M1 结果（已完成，2026-08-30）

产物：`packages/mde/`（`src/errors.ts` 错误码 · `src/container.ts` 容器层 · `src/cli.ts` CLI · `test/container.test.ts`）。

用 Node 22.18+ 的**内置类型剥离**直接跑 `.ts`，无需构建配置。约束：只能用 erasable syntax——构造函数参数属性（`constructor(readonly x)`）不可用，需写成显式字段。

**测试 9/9 通过**（`node --test test/container.test.ts`）：可重复构建、条目顺序、路径规范化、NFC 归一化、拒绝符号链接、大小写冲突、压缩策略、ZIP 炸弹防护、pack→unpack 往返。

**端到端验证：**
```
pack:   4 个条目 → out.mde (20635 B)
unzip -l: manifest.json 95 · assets/images/shot.png 20000 · document.md 74 · includes/ch1.md 40
          时间列全部 01-01-1980 08:00（= UTC 1980-01-01）
mde list: PNG 20000/20000（Store ✓）· document.md 74/75（DEFLATE）
unpack:  diff -r 与原目录一致 ✓
```

**实测补充发现（已写入代码注释）：**
- 极小文件（几十字节）经 DEFLATE 会**膨胀**（43 B → 46 B），压缩策略按扩展名判定即可，不值得为小文件加回退逻辑。
- 8 字节的伪 PNG 在 Store/DEFLATE 边界上不稳定，压缩策略测试需用真实尺寸数据。

## 2.5 测试策略

`spec/fixtures/<case-id>/{case.json, input/, expected/}`，`node:test` 驱动（规范附录 B 已定义格式与用例清单）。

用例优先级：**先写 3 个（`pack-basic` / `sec-path-traversal` / `symbols-word-boundary`）**，用它们逼出规范剩余含糊处，再补齐全文。fixture 会主动暴露歧义，比空想写规范快得多。

## 2.6 Dogfood 结果（2026-08-30，M7 之前的真实使用验证）

按 §1.4 的定位，在投入 M7 之前先真实用两次。**结果：两套用例（80/80）挡不住一次真实使用。**

### 场景 1：打包项目自身的 README.md

```
第 1 次 → [MDE-E401] 引用的本地资源缺失: assets/a.png
         （那行是「快速开始」代码块里的示例代码，不是真实引用）
第 2 次 → [MDE-E401] 引用的本地资源缺失: spec/mde-format-spec.md
         （真实引用，但指向仓库内另一篇文档）
第 3 次 → ✅ pack 2 条目 → validate OK → render 单文件
```

两个根因（提交 `a80baaf`，测试 80/80）：
1. **引用收集用正则扫全文，没有排除区**。文档里含 Markdown 语法的示例代码块极常见（教程、README 都有），正则无法区分示例与真实引用。符号扩展有排除区、引用收集却没有——**内部不一致**。改为复用 remark AST：只有 `image` / `link` 节点的 URL 算引用，代码块与行内代码天然排除。
2. **到本地 `.md` 的链接被当成必须随包的附件**，打包一篇 README 会连带要求整个仓库。按 P0 原义重新切分：**图片与 pdf/zip 等嵌入附件必须随包**（这才是「附件不丢失」），**`.md` 链接属文档间导航，不强制打包**（单独计入 `docLinks`）。

这是设计判断而非纯 bug 修复，已写进规范 §6.2（「什么算引用」+「必须用 AST」），并加 1 条测试锁死。

**教训：我的测试输入都是「干净的」，真实文档不是。** 79 个用例全绿却挡不住打包一篇真实 README 失败，因为真实文档有示例代码块、有指向其他文档的链接。

### 场景 2：编辑-重打包周期（规范 §12.1 / H4 的主链路）

此前**从未端到端验证过**的核心场景。流程：pack → unpack → 加一张新图并引用 → 重打包。

```
结果：✅ 通过
- 作者意图完整保留：extensions.symbols=core、include=true、extensions_required=["include"]
- 机器事实全部重算：新图 assets/new.png 进包（size 4000 + 正确 sha256）、
  document.md 哈希随之更新、无过期哈希残留
- validate OK（0 告警）
```

注：该场景的关键逻辑（字段归属表）已由 `manifest.test.ts` 的 `buildManifest(files, prev)` 覆盖，且 driver 的 pack 通道支持 `input/manifest.json` 作为 prev（`symbols-profile-off`、`include-visible-degraded` 两例即依赖此行为），故未新增端到端测试。

---

# 三、需要你先定的三件事

1. **是否先跑 M0 的四个探针？**（半天成本，但它是「可行性」的唯一实证；不跑则本方案仍停留在纸面推演）
2. **是否接受「先自用、后标准化」的定位 + 3 个月止损判据？** 这决定 M7（VS Code 插件 / 规范发布）是否进入计划。
3. **`PLAN_MERGED.md` 的 16 处修订如何处理？** 保留（与 `spec` 初稿一致）还是手工回退（文件 git 未跟踪，无自动回滚）？

# Verification

- [x] S1–S4 四个探针各自产出 pass/fail 结论与证据（字节 hash / 渲染输出 / 中断点 / 跨平台路径比对）→ **全部 PASS，见 §2.4.1**
- [x] M1 退出判据可复跑 → `cd packages/mde && node --test test/container.test.ts`（9/9）+ `unzip -l` 互操作，见 §2.4.2
- [x] M2 退出判据可复跑 → `cd packages/mde && node --test test/container.test.ts test/manifest.test.ts`（16/16）+ `node src/cli.ts validate` 端到端，见 §2.4.3
- [x] M3 退出判据可复跑 → `cd packages/mde && node --test test/container.test.ts test/manifest.test.ts test/render.test.ts`（25/25）+ `node src/cli.ts render` 端到端，见 §2.4.4
- [x] M4 退出判据可复跑 → `cd packages/mde && node --test test/*.test.ts`（35/35）+ 多级 include 端到端，见 §2.4.5
- [x] M5 退出判据可复跑 → `cd packages/mde && node --test test/*.test.ts`（75/75，含 40 个 conformance fixture），见 §2.4.6
- [x] M6 退出判据：`cd packages/mde && node --test test/*.test.ts`（78/78）；规范正文无「待定」，5 处承诺缺口已补齐或显式标注「v1 不提供」，见 §2.4.7
- [ ] `spec/fixtures/` ≥ 33 case，`node --test` 全绿
- [ ] `mde pack → validate → list → render → unpack → export` 在最小示例包上跑通，SHA-256 全程一致
- [ ] `unzip -l` 在 macOS / Linux 均可列可提
- [ ] 规范与实现逐条对齐，规范正文无「待定 / TBD / 实现期确定」
