# MDE Format Specification v1.0（初稿）

> 状态：**Phase 0A 初稿**。本文件是 `PLAN_MERGED.md` 的可执行展开；凡本文与 `PLAN_MERGED.md` 冲突，以本文为准并回写 `PLAN_MERGED.md`。
> 关键字按 RFC 2119 解释：MUST / MUST NOT / SHOULD / SHOULD NOT / MAY。
> 规范文本 CC BY 4.0；测试向量（附录 B）CC0。

---

## 1. 范围与术语

**MDE**（Markdown Enhanced）是一种以标准 ZIP 为容器、以 `manifest.json` 为元数据源的 Markdown 文档包格式，用于**单文件交付**：一个 `.mde` 文件包含主文档、全部引用资源与可包含的子文档。

v1 提供三项能力：资源随包（P0）、符号扩展（P1）、包内文件包含（P2）。

| 术语 | 定义 |
|---|---|
| 包（package） | 一个 `.mde` 文件，即一个符合本规范的 ZIP 归档 |
| 包根（package root） | ZIP 内的逻辑根目录，所有包内路径相对它解析 |
| 入口（entrypoint） | 主 Markdown 文档的包内路径，`manifest.entrypoint` 为唯一真源 |
| 资源（resource） | 包内除 `manifest.json` 外的任何文件，含入口文档本身 |
| 引用闭包 | 从入口出发，经 include 展开后可达的全部本地引用集合 |
| 展开（expansion） | include 指令被替换为其目标文件内容后的文本状态 |

**「单文件」的精确含义：** 交付与传输只有一个文件。它**不**表示 Markdown 内容以 Base64 内嵌，也**不**表示普通文本编辑器打开 `.mde` 即可获得完整渲染。

---

## 2. 容器格式

### 2.1 基本约束

1. 包 MUST 是有效的 ZIP 归档（APPNOTE.TXT 6.3.x 兼容）。
2. 包根 MUST 直接包含 `manifest.json`。
3. 包 MUST NOT 包含目录条目以外的绝对路径、`..` 段、符号链接、硬链接条目。
4. 同一包内 MUST NOT 存在两个规范化后相同的路径。
5. 所有文本（Markdown / JSON / include 源文件 / 文本附件）MUST 为 UTF-8，MUST NOT 含 BOM，MUST NOT 含 U+0000。
6. 路径分隔符统一为 `/`。

### 2.2 识别

一个文件是 MDE 包，当且仅当全部成立：

- 扩展名为 `.mde`（不区分大小写）；且
- 是有效 ZIP；且
- 包根含 `manifest.json`；且
- `manifest.json` 可解析为 JSON 对象，且 `mde` 字段等于字符串 `"mde"`，且 `spec_version` 存在且主版本号为实现所支持。

任一条件不成立 → 实现 MUST 按「普通 ZIP」处理，**不得**强行当作 MDE，也**不得**猜测修复。

### 2.3 压缩策略

| 内容 | 方法 |
|---|---|
| Markdown / JSON / 纯文本 | DEFLATE（级别 9） |
| PNG / JPEG / GIF / WebP / 音视频 / PDF / 已压缩归档 | Store（不压缩） |
| 其他 | 实现 MAY 自行决定，SHOULD 默认 Store |

理由：已压缩媒体二次压缩无收益且浪费 CPU。

### 2.4 可重复构建（MUST）

同一输入目录两次打包 MUST 产生**字节相同**的包。为此：

1. ZIP 条目顺序 MUST 为包内路径的 **Unicode 码位升序**（`manifest.json` 排在最前）。
   - 实测（fflate）：条目顺序完全由调用方插入顺序决定，库不会自动排序；**打乱插入顺序即产生不同字节**。实现 MUST 自行排序后再插入。
2. 所有条目时间戳 MUST 为 `1980-01-01 00:00:00`（ZIP 可表示的最早时间）。实测 `unzip -l` 正确显示为 `01-01-1980`。
3. 普通文件权限位 MUST 为 `0644`，目录 MUST 为 `0755`。
4. MUST NOT 写入本机绝对路径、UID/GID、扩展属性、注释字段。
5. 生成时间 MUST NOT 进入 `manifest.json`。
6. 实现 MAY 提供 `--preserve-mtime`；启用时本条整体失效，实现 MUST 在输出中提示「已放弃可重复构建」。

> 本条保证的是「同一输入 → 同一字节」，用于缓存、签名与误改动检测。它**不**使 ZIP 在 Git 中产生可读 diff；版本间差异请用 `mde diff`（§8.7）。

---

## 3. 目录结构

```text
example.mde
├── manifest.json        # 必需
├── document.md          # 入口，缺省名；实际路径以 manifest.entrypoint 为准
├── assets/              # 惯例，非强制
│   ├── images/
│   └── files/
└── includes/            # 惯例，非强制
```

规范只强制 `manifest.json` 的存在与位置。其余目录布局是惯例；实现 MUST NOT 依赖惯例布局做判断，一律以 `manifest.entrypoint` 与实际路径为准。

---

## 4. `manifest.json`

### 4.1 字段

```json
{
  "mde": "mde",
  "spec_version": "1.0",
  "entrypoint": "document.md",
  "encoding": "utf-8",
  "extensions": {
    "symbols": "core",
    "include": true
  },
  "extensions_required": ["include"],
  "resources": [
    {
      "path": "document.md",
      "media_type": "text/markdown",
      "size": 4096,
      "sha256": "e3b0c44298fc1c14..."
    },
    {
      "path": "assets/images/product.png",
      "media_type": "image/png",
      "size": 84123,
      "sha256": "9f86d081884c7d65...",
      "source_url": "https://example.com/origin.png"
    }
  ]
}
```

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `mde` | string | ✅ | 格式标识，恒为 `"mde"` |
| `spec_version` | string | ✅ | `"<major>.<minor>"`，本规范为 `"1.0"` |
| `entrypoint` | string | ❌ | 入口文档包内路径；省略时取 `"document.md"` |
| `encoding` | string | ❌ | 恒为 `"utf-8"`；省略时同 |
| `extensions` | object | ❌ | 作者意图：`symbols` ∈ `off\|core\|extended`（默认 `core`）、`include` ∈ `true\|false`（默认 `true`） |
| `extensions_required` | string[] | ❌ | 硬依赖列表；渲染器不支持其中任何一项 MUST 报错退出，不得静默降级 |
| `resources` | array | ✅ | 资源索引，见下 |
| `resources[].path` | string | ✅ | 包内相对路径，已 NFC 归一化 |
| `resources[].media_type` | string | ✅ | IANA 媒体类型；未知用 `application/octet-stream` |
| `resources[].size` | integer | ✅ | 未压缩字节数 |
| `resources[].sha256` | string | ✅ | 小写 64 位十六进制 |
| `resources[].source_url` | string | ❌ | 仅当该资源由外链下载得到时存在 |

`resources` MUST 覆盖包内除 `manifest.json` 外的**全部**文件，**包含入口文档自身**。
`resources` 顺序 MUST 按 `path` 码位升序。

### 4.2 字段归属（编辑-重打包周期的关键规则）

用户解包 → 编辑 → 重打包时，`mde pack` MUST 按下表处理：

| 字段 | 归属 | 重打包行为 |
|---|---|---|
| `resources[]`、`size`、`sha256`、`media_type` | 机器事实 | **每次重算**，覆盖原值 |
| `entrypoint`、`extensions`、`extensions_required`、`encoding` | 作者意图 | **存在则保留**，缺失才取默认值 |
| `spec_version` | 工具版本 | 由工具决定，**不继承** |
| `resources[].source_url` | 历史来源 | 保留 |

理由：把两类字段混为一谈，会在重打包时把作者配置冲掉，或让过期哈希永久驻留。

---

## 5. 路径与编码规则

1. 路径 MUST NOT 以 `/` 开头，MUST NOT 含 `.` 或 `..` 段，MUST NOT 含空段（`//`），MUST NOT 含 U+0000，MUST NOT 含 Windows 盘符或保留设备名。
2. 路径与文件名在入库前 MUST 统一 **Unicode NFC** 归一化。
3. 归一化后相同的两个路径（含仅大小写不同者）MUST 在打包阶段被拒绝（错误码 `MDE-E201`）。
   - 理由：macOS(APFS, NFD) 与 Linux(NFC) 下同一逻辑文件名字节不同，不归一化会导致 manifest 的 SHA-256 跨平台失配、`validate` 全量误报。
4. 路径长度 MUST NOT 超过 1024 字节（UTF-8）。
5. 实现 MUST 拒绝符号链接与硬链接条目（`MDE-E601`）。

---

## 6. 资源引用与打包

### 6.1 文档内引用

文档 MUST 使用**包内相对路径**引用资源：

```markdown
![产品截图](assets/images/product.png)
```

实现 MUST NOT 要求或生成 `mde://` 协议。理由：解压/导出后必须仍是标准 Markdown，`mde://` 会破坏降级路径。

外部 URL（`http://`、`https://`、协议相对 `//`）默认**保留为外链**，不下载。

### 6.2 `mde pack` 行为

```
mde pack <dir> [-o out.mde] [--entry <path>] [--referenced-only] [--fetch] [--preserve-mtime]
```

1. 入口：`--entry` 指定；否则 `dir/document.md`；否则若 `dir/manifest.json` 存在则继承其 `entrypoint`。三者皆无 → `MDE-E301`。
2. **默认行为：打包 `dir` 内全部文件**（排除输出文件自身）。
   - 理由：全量打包的代码量比「精准扫描」少一个数量级，且不会漏图；孤儿资源只是体积代价，缺图是正确性缺陷，两者风险不对称。
3. `--referenced-only`：仅打包引用闭包（入口 + include 传递展开后可达的全部本地引用）+ 入口 + `manifest.json`。
4. **引用校验（两种模式下都执行）**：从入口出发遍历 include 闭包，收集全部本地引用。任何被引用的本地文件不存在于待打包集合 → **报错退出**（`MDE-E401`），不静默跳过。
   - **什么算「引用」**：图片与嵌入附件（pdf / zip 等）是必须随包的资源；**到本地 Markdown 的链接属于文档间导航，不算附件，不强制打包**——否则打包一篇 README 会连带要求整个仓库。
   - **收集必须基于 Markdown AST，不得用正则扫全文**：文档中常出现含 Markdown 语法的**示例代码块**（如教程里的 `![图](assets/a.png)`），正则会把示例当作真实引用并误报 `MDE-E401`。用 AST 时只有 `image` / `link` 节点的 URL 算引用，代码块与行内代码天然被排除——这与符号扩展共用同一套「排除区」判断。
   - 实测（dogfood）：打包项目自身 README 时，正则实现两次误报（先报示例里的 `assets/a.png`，再报真实链接 `spec/mde-format-spec.md`），改 AST 后一次通过。
   - 这一步 MUST 走 include 传递闭包；只扫入口文档会漏掉被包含子文档里的图片，直接违反 P0「附件不丢失」。
5. **孤儿资源**（在包内但未被任何文档引用）→ warning，不报错。
6. `--fetch`：显式下载外链并改写为包内相对路径，在 `resources[].source_url` 记录来源。默认关闭。
   - **参考实现 v1 未提供此开关**：下载外链要引入网络依赖、超时/重试与 SSRF 面（内网地址、重定向到 `169.254.169.254` 等），与 v1「不下载、可预测」的立场冲突。外链一律保留原样，由 `validate` 统计数量并提示「本包含 N 个外部引用，不可完全离线」。若将来提供，必须带协议白名单（仅 http/https）、重定向上限、大小上限与内网地址拒绝。

---

## 7. 扩展语法

### 7.1 符号扩展

**定位：** 渲染期转换，作用于普通文本节点，**不修改包内原始 Markdown**。可配置，默认 `core`。

**Core profile 映射表（v1 唯一强制集）：**

| 输入 | 输出 | 输入 | 输出 |
|---|---|---|---|
| `(tm)` | ™ | `-->` | → |
| `(c)` | © | `<--` | ← |
| `(r)` | ® | `<-->` | ↔ |
| `+/-` | ± | `<=` | ≤ |
| `=/=` | ≠ | `>=` | ≥ |

**Extended profile：** 不在 v1 实现范围。含 `...`→`…`、`1/2`→`½` 等分数/排版符号——它们对路径、命令、版本号、省略号误伤风险高，需更充分的边界数据后再定。映射表参考 PyMdown Extensions（MIT），采用时 MUST 保留其版权声明。

**排除区（MUST NOT 转换）**：代码块、行内代码、链接与图片的目标地址、HTML 属性、原始 HTML 块、自动链接。

实现提示：在 mdast 上遍历 `text` 节点即可天然满足上式——code / inlineCode / link.url / html 均不是 `text` 节点，无需自研 tokenizer。

**词边界规则（MUST）：** 仅当匹配序列**前邻**为行首 / 空白 / 中文标点，且**后邻**为行尾 / 空白 / 中文标点时才转换，否则保留原文。
- 例：`a<=b` 不转换（前邻 `a`）；`步骤 1 --> 步骤 2` 转换。
- 中文标点集：`，。、；：！？（）【】《》「」『』—…·`

**转义（MUST，实现方法已由 M0 探针验证）：** `\` 前缀转义。`\(tm)` 表示字面 `(tm)`。

> **实现陷阱（实测）：** 不能按「Markdown 解析先消费反斜杠，符号转换再处理残余」的顺序实现。Markdown 解析阶段会把 `\(` 作为合法转义消费掉，text 节点中只剩 `(tm)`，**转换器无法区分「用户写了 `\(tm)` 想保留字面」与「用户写了 `(tm)` 想转换」**。实测该顺序下 `\(tm)` 被错误转换为 `™`。

**MUST 采用哨兵法**（实测可行）：
1. 解析**前**，把源码中 `\` + 符号 的序列替换为私有区哨兵（`U+E000`）+ 符号；
2. 正常解析与符号转换（哨兵是 Markdown 不解析的字符，且不满足词边界的前邻条件，故其后符号不被转换）；
3. 转换后**删除哨兵**，还原为字面符号。

成本约 3 行，无源码偏移映射，不受实体引用/多字节影响。可选替代（未采用）：取消 `\` 转义语法，改用行内代码 `` `(tm)` `` 作为保留字面的手段——零实现成本，但牺牲「在普通文本中保留字面且不显示为代码」的能力。

### 7.2 文件包含

**语法：**

```markdown
<<< includes/chapter-1.md
<<< "includes/a b.md"
```

**触发规则（MUST）：** 指令仅在**列 0**（行首无缩进）且整行匹配正则 `^<<<\s*(.+?)\s*$` 时触发。

> 规范**不**要求感知代码块上下文。理由：正确判断代码块需要预处理器自行实现围栏扫描（`` ``` ``/`~~~`/不等长围栏/4 空格缩进/列表内嵌套），这在「解析前展开」的阶段是不可能的，且必然导致实现分叉。
> **已知局限：** 列 0 的围栏代码块内若出现符合上式的行，会被展开。此为已知且可接受行为，规范不修复。缩进 ≥1 空格或写在代码块内容中的指令天然不触发。

**路径解析：** 路径相对**包根**解析，MUST 规范化后位于包根内。MUST NOT 访问包外文件、URL、其他 `.mde` 包（`MDE-E501` / `MDE-E502`）。

**目标类型：** 仅包内 Markdown 文件。非 Markdown 目标 → `MDE-E503`。

**相对基准与 URL 重写（MUST，消除实现分叉的关键规则）：**
被包含文件 `P`（包内路径）中的**相对**图片/资源引用 `R`，在展开时 MUST 以纯文本方式重写为 `normalize(dirname(P) + "/" + R)`。

- 例：`includes/chapter-1.md` 中的 `img/fig.png` → 展开后为 `includes/img/fig.png`。
- 绝对 URL、协议相对 URL、`data:` URI MUST NOT 被重写。
- **代码块与行内代码中的示例路径 MUST NOT 被重写**：代码围栏内常出现 Markdown 用法示例（如教程里的 `![图](img/demo.png)`），重写它会篡改用户可见内容。实现需跟踪围栏状态（`` ``` `` / `~~~`）以跳过代码块内的行——**此规则仅约束 URL 重写**，与上文「include 指令仅在列 0 触发、不感知代码块」是两件事，后者保持不变。
  - 与 §6.2 的引用收集共用同一原则：**凡对 Markdown 做文本级处理，都必须排除代码块与行内代码**（引用收集走 AST，重写走围栏跟踪）。实测二者各出过一次缺陷。
- 重写发生在**展开阶段**（文本层），使展开后的文本自洽；`render` 与 `export --expanded` 共用同一份中间产物，渲染器无需再携带「当前文件上下文」。

**嵌套：** 允许嵌套包含，逐层递归执行同一管线（展开 → 解析 → 符号转换），深度计入上限。

**硬限制（MUST，默认值必须存在）：**

| 限制 | 默认值 | 错误码 |
|---|---|---|
| 最大深度 | 32 | `MDE-E504` |
| 单文档展开后总字节 | 10 MB | `MDE-E505` |
| 单包内 include 指令总次数 | 1000 | `MDE-E506` |

**循环检测（MUST）：** 维护展开栈，同一文件在栈中重复出现即报 `MDE-E507`。

**错误定位（SHOULD）：** 实现 SHOULD 维护「展开后行号 → (源文件, 原始行号)」映射，使报错携带原始出处。

---

## 8. 处理管线与命令行

### 8.1 渲染管线（顺序固定，MUST）

```text
1. 读取并解包 ZIP
2. 校验 manifest（Schema + 资源 size/sha256）
3. 预处理：include 展开（循环/深度/大小限制 + 相对 URL 重写）
4. 解析：Markdown → AST
5. 符号转换：仅作用于 text 节点（词边界 + 转义）
6. 渲染：AST → HTML（安全清理）
7. 输出
```

### 8.2 HTML 安全（MUST）

1. 输出 MUST 经 HTML 消毒（清 `script` / `on*` 事件属性 / `javascript:` URL）。
2. **SVG MUST 以 `<img>` 引用方式渲染，不得插入 HTML DOM。**
   - 澄清：`<img src="data:image/svg+xml;base64,...">` **属于 `<img>` 引用**，其中的 SVG 不执行脚本，因此 `render --inline` 可安全地对 SVG 使用 data URI。
   - 「内联」专指把 SVG 节点插入 HTML DOM 树——该行为 v1 禁止，即使显式开关也不提供。
3. 外部 URL 图片 MUST 附 `referrerpolicy="no-referrer"`。
4. 文档内联的原始 HTML MUST 经消毒；消毒行为 MUST 可审计（记录被移除的节点类型数）。

### 8.3 完整性校验的边界（MUST 在规范中明示）

`manifest.json` 记录的 SHA-256 用于检测**非恶意的完整性问题**：传输损坏、误传、解包后被外部程序改写、跨平台 NFC/NFD 字节漂移。

**它不提供防篡改保证。** manifest 与被校验资源位于同一 ZIP 内，任何能重写包的人都可同步更新摘要，校验仍会通过。防篡改需要签名机制（签名或摘要锚点位于包外），**v1 不提供**。

实现 MUST NOT 在输出信息中把校验通过描述为「未被篡改 / 可信 / 已验证来源」。

### 8.4 解包安全（MUST）

实现 MUST 在解包/读取时强制下列上限，且默认值必须存在（可用参数覆盖）：

| 限制 | 默认值 | 错误码 |
|---|---|---|
| 资源总数 | 10 000 | `MDE-E602` |
| 单文件解压后字节 | 200 MB | `MDE-E603` |
| 总解压字节 | 1 GB | `MDE-E604` |
| 单条目压缩比 | 1000:1 | `MDE-E605` |

检测 MUST 在解压**过程中**流式计数，不得先完整解压再统计（否则 ZIP 炸弹防护失效）。判定只需读条目的 central directory header，**达到上限即不启动该条目的解压流**——实测 120 MB 炸弹（120 KB 压缩包）只读 header 拒绝耗时 0 ms，完整解压需 156 ms，且未落盘。

> **实现陷阱（实测，fflate）：** `Unzip` 回调暴露的 `size` 是**压缩后**大小，`originalSize` 才是解压后大小；`compressedSize` 为 `undefined`。误用 `size` 做上限判定会让炸弹防护**完全失效**。另：`Unzip` 的文件回调必须传给**构造函数** `new Unzip(cb)`，`register()` 只用于注册编解码器；否则抛 `no stream handler`。

### 8.5 版本协商

- 主版本不同 → MUST 拒绝处理并报错（`MDE-E701`）。
- 次版本更高 → 处理已知的 v1 字段，忽略未知字段（`MUST NOT` 因未知字段报错）。
- `extensions_required` 中存在实现不支持的项 → MUST 报错退出（`MDE-E702`），**不得**静默降级。

### 8.6 命令契约

| 命令 | 说明 |
|---|---|
| `mde pack <dir> -o out.mde` | §6.2 |
| `mde unpack <pkg> -o dir` | 还原为目录；强制 §8.4 上限 |
| `mde list <pkg>` | 列出 `resources[]`（path / media_type / size） |
| `mde validate <pkg>` | Schema + size + sha256 + 路径规则 + 限制项；统计外链数并提示「本包含 N 个外部引用，不可完全离线」 |
| `mde render <pkg>` | 见 §8.7 |
| `mde export --raw <pkg> -o dir` | 输出**目录**，保持包内结构，文本一字不改 |
| `mde export --expanded <pkg> -o dir` | 输出**目录**，含一份展开后的 Markdown（include 已展开、相对 URL 已按 §7.2 重写）+ 全部资源 |
| `mde diff <a> <b>` | 双方解包到临时目录后 `diff -ruN` |

> `--raw` MUST 输出目录而非单文件：未展开的文档其 include 指令与相对路径在其他层级下无意义，输出成单文件必然损坏。`--expanded` 的产出可被任何标准 Markdown 工具打开。

### 8.7 `mde render` 输出形态

```
mde render <pkg> [-o out.html] [--inline | --dir] [--max-inline-bytes N]
```

- **默认 `--inline`**：资源以 data URI 内联，产出**单个自包含 HTML 文件**，对应「AI 生成文档交付」定位。
- 资源总字节 > `--max-inline-bytes`（默认 50 MB）时，MUST 自动降级为 `--dir` 并在 stderr 打印提示。
- 显式指定 `--inline` 或 `--dir` 时忽略阈值。
- `--dir`：解包资源到输出 HTML 旁的同级目录，HTML 用相对路径引用。

---

## 9. 兼容性（三层）

| 层 | 承诺 |
|---|---|
| 容器兼容 | `.mde` 是标准 ZIP，`unzip -l` / `unzip -p` 可列可提 |
| 文档兼容 | 包内 Markdown 是标准 Markdown + 相对路径；符号保持源文本；`<<<` 降级为可见文本 |
| 导出兼容 | `export --raw` / `--expanded` 的产出可被任何标准 Markdown 工具打开 |

**不承诺：** 普通文本编辑器直接打开 `.mde` 即获得完整渲染。

---

## 附录 A：错误码表

| 码 | 含义 | 触发 |
|---|---|---|
| **1xx 容器** ||| 
| `MDE-E101` | 不是有效 ZIP | 打开阶段 |
| `MDE-E102` | 缺少 `manifest.json` | 识别阶段 |
| `MDE-E103` | 识别失败，按普通 ZIP 处理 | 非错误，仅提示 |
| **2xx 路径/编码** ||| 
| `MDE-E201` | 路径冲突（归一化或大小写后重复） | pack |
| `MDE-E202` | 非法路径（`..` / 绝对 / 空段 / NUL / 盘符） | pack / unpack |
| `MDE-E203` | 非 UTF-8 文本或含 BOM | pack |
| `MDE-E204` | 路径超长（> 1024 字节） | pack |
| **3xx manifest** ||| 
| `MDE-E301` | 无法确定入口文档 | pack |
| `MDE-E302` | manifest 不符合 Schema | validate |
| `MDE-E303` | `entrypoint` 指向不存在或非 Markdown | validate |
| `MDE-E304` | `resources` 未覆盖包内全部文件 | validate |
| **4xx 资源** ||| 
| `MDE-E401` | 引用的本地资源缺失 | pack |
| `MDE-E402` | 资源 size 不符 | validate |
| `MDE-E403` | 资源 sha256 不符（**完整性问题，非篡改证据**） | validate |
| `MDE-E404` | 孤儿资源（warning，非错误） | pack |
| **5xx include** ||| 
| `MDE-E501` | include 目标在包外 | render / export |
| `MDE-E502` | include 目标是 URL 或外部包 | render / export |
| `MDE-E503` | include 目标非 Markdown | render / export |
| `MDE-E504` | 深度超限（默认 32） | render / export |
| `MDE-E505` | 展开后字节超限（默认 10 MB） | render / export |
| `MDE-E506` | include 次数超限（默认 1000） | render / export |
| `MDE-E507` | 检测到循环包含 | render / export |
| `MDE-E508` | include 目标不存在 | render / export |
| **6xx 安全/限制** ||| 
| `MDE-E601` | 符号链接 / 硬链接条目 | pack / unpack |
| `MDE-E602` | 资源总数超限 | unpack |
| `MDE-E603` | 单文件解压字节超限 | unpack |
| `MDE-E604` | 总解压字节超限 | unpack |
| `MDE-E605` | 压缩比异常（疑似 ZIP 炸弹） | unpack |
| **7xx 扩展/版本** ||| 
| `MDE-E701` | spec_version 主版本不支持 | 任何读操作 |
| `MDE-E702` | `extensions_required` 含不支持项 | render |
| `MDE-E703` | 未知扩展字段（warning，忽略） | validate |

退出码：`0` 成功；`1` 校验/业务错误（伴随上表错误码）；`2` 用法错误；`3` 内部错误。

---

## 附录 B：一致性测试向量（Conformance Fixtures）

### B.1 为什么它是 Phase 0 的核心产物

「两个独立实现仅凭规范生成同等语义的包」无法靠读文档验证，只能靠一套可执行的、与实现无关的向量。fixtures 是规范的可执行形式，**先写 fixtures 再写规范，比反过来快得多**——fixture 会主动逼出规范的每一处含糊。

### B.2 目录与格式

```text
spec/fixtures/<case-id>/
├── case.json        # 用例定义
├── input/           # 输入目录，或 input.mde
└── expected/        # 期望产出（manifest / html / 解包树）
```

`case.json`：

```json
{
  "id": "pack-basic",
  "title": "最小包：1 图片 + 1 级 include + core 符号",
  "kind": "pack",
  "args": ["pack", "input/", "-o", "out.mde"],
  "expect": {
    "exitCode": 0,
    "errorCode": null,
    "manifest": "expected/manifest.json",
    "tree": "expected/tree.txt"
  }
}
```

| 字段 | 说明 |
|---|---|
| `kind` | `pack` / `unpack` / `list` / `validate` / `render` / `export` / `diff` |
| `expect.exitCode` | 期望退出码 |
| `expect.errorCode` | 期望错误码（负向用例必填） |
| `expect.manifest` | 期望 manifest 路径（逐字段比对，`resources[].sha256` 必比对） |
| `expect.tree` | 期望解包目录树（路径 + 大小） |
| `expect.html` | 期望 HTML 路径（`render` 用例，比对规范化后的 DOM） |
| `expect.stderrContains` | 期望 stderr 包含的子串 |

`pack` 用例 MUST 额外断言**可重复性**：以相同输入打包两次，两次产物字节相同。

### B.3 用例清单（Phase 0B 目标 ≥ 30）

> **落地状态（2026-08-30）：已实现 43 个用例**（下方目标清单已全覆盖），位于 `spec/fixtures/<id>/`，由 `packages/mde/test/fixtures.test.ts` 驱动，全部通过（**全量 79/79**，含 36 个实现单测）。
>
> 实际 `case.json` 字段（与 B.2 的差异：断言内联，只有大产物才放 `expected/` 目录）：
> `id` / `title` / `kind`（`pack`\|`validate`\|`render`\|`expand`\|`path`）/ `input`（默认 `input/`）/ `entry` / `args`（传给 `render`）/ `tamper`（篡改 manifest 以测完整性：`{ resource, sha256, size }`）/ `expect`（`errorCode`\|`tree`\|`manifest`\|`htmlContains`\|`htmlNotContains`\|`textContains`\|`pathInput`）。
>
> 与下方目标清单的差异及原因：
> - **不进 fixture 的用例**（受执行环境限制，改由实现单测覆盖）：① 大小写冲突、NFC/NFD 同名冲突——macOS APFS 对大小写与 Unicode 规范化均不敏感，这类输入在文件系统上会互相覆盖，根本建不出来，已由 `container.test.ts` 用内存 Map 覆盖；② ZIP 炸弹——需在用例内嵌入 12 MB 文件且需 unpack 通道，已由 `container.test.ts` 覆盖。
> - 驱动共六条通道：`pack` / `validate` / `render` / `expand` / `export` / `unpack`（外加不依赖文件树的 `path`）。`unpack-roundtrip` 断言 pack→unpack 后除 `manifest.json`（工具生成）外每个文件逐字节相同。
> - **可重复性不单独立用例**：驱动对所有 `pack` 类用例自动附加「两次打包字节相同」断言。

**正向（8）**
1. `pack-basic` — 1 图片 + 1 级 include + core 符号（最小示例包，也是文档示例）
2. `pack-reproducible` — 同输入两次打包字节一致
3. `pack-unicode-path` — 中文文件名、Unicode 文件名、NFD 输入
4. `unpack-roundtrip` — pack → unpack → 与原目录逐字节相同
5. `render-symbols` — 普通文本替换；代码/行内代码/URL/HTML 属性/转义不替换
6. `render-include-nested` — 多层 include 与嵌套文件内的相对图片路径重写
7. `export-raw` / `export-expanded` — 两种导出模式产出可被标准工具打开
8. `validate-clean` — 干净包全绿

**符号边界（4）**
9. `symbols-word-boundary` — `a<=b`、`v1.2-->v2`、`...`、中英文混排不误伤
10. `symbols-escape` — `\(tm)` 保留字面
11. `symbols-profile-off` — `extensions.symbols: "off"` 全不转换
12. `symbols-cjk-punct` — 中文标点前后正确转换

**include（7）**
13. `include-single` / `include-multi-level` / `include-cycle` / `include-duplicate`
14. `include-missing` / `include-outside-root` / `include-non-markdown`
15. `include-quoted-path` — 含空格路径 `"includes/a b.md"`
16. `include-indented-not-triggered` — 缩进 1 空格不触发
17. `include-depth-limit` / `include-size-limit` / `include-count-limit`
18. `include-url-rewrite` — 嵌套文件内相对图片路径重写正确（含同名不同目录）

**安全（8）**
19. `sec-path-traversal` / `sec-absolute-path` / `sec-windows-drive`
20. `sec-symlink` / `sec-duplicate-entry`
21. `sec-zip-bomb-ratio` / `sec-total-size-limit` / `sec-entry-count-limit`
22. `sec-malicious-svg` — SVG 不进 DOM
23. `sec-html-injection` — 内联 HTML 被消毒
24. `sec-sha-mismatch` — 摘要不符报 `MDE-E403` 且提示不含「篡改」
25. `sec-external-url` — 外链保留 + `referrerpolicy`

**路径/编码（3）**
26. `path-nfd-conflict` — NFD/NFC 同名冲突被拒
27. `path-case-conflict` — 仅大小写不同的路径被拒
28. `encoding-non-utf8` — 非 UTF-8 被拒

**版本/扩展（3）**
29. `version-major-mismatch` — 报 `MDE-E701`
30. `ext-required-unsupported` — 报 `MDE-E702`，不静默降级
31. `ext-unknown-ignored` — 未知字段忽略并 warning

**互操作（2）**
32. `interop-unzip` — `unzip -l` / `unzip -p` 可列可提
33. `interop-renderer` — 导出 Markdown 可被第三方渲染器打开

---

## 附录 C：JSON Schema（落盘为 `spec/schema/manifest-1.0.json`）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mde.spec/schema/manifest-1.0.json",
  "title": "MDE manifest v1.0",
  "type": "object",
  "required": ["mde", "spec_version", "resources"],
  "additionalProperties": false,
  "properties": {
    "mde": { "const": "mde" },
    "spec_version": { "type": "string", "pattern": "^1\\.\\d+$" },
    "entrypoint": { "type": "string", "minLength": 1, "maxLength": 1024 },
    "encoding": { "const": "utf-8" },
    "extensions": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "symbols": { "enum": ["off", "core", "extended"] },
        "include": { "type": "boolean" }
      }
    },
    "extensions_required": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "uniqueItems": true
    },
    "resources": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["path", "media_type", "size", "sha256"],
        "additionalProperties": false,
        "properties": {
          "path": { "type": "string", "minLength": 1, "maxLength": 1024 },
          "media_type": { "type": "string", "minLength": 1 },
          "size": { "type": "integer", "minimum": 0 },
          "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "source_url": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

> Schema **不**表达语义约束（路径合法性、NFC、引用闭包、顺序）。语义约束由 `validate` 按 §5–§7 实现，并对应附录 A 的错误码。
>
> 实现注记（M2 实测）：`source_url` **不使用** `"format": "uri"`——ajv 8 的 draft 2020-12 入口（`ajv/dist/2020.js`）不内置 format，会在 stderr 打印 `unknown format "uri" ignored`，需额外引入 `ajv-formats`。为一个可选的 URI 格式校验增加一个依赖不值得，故降为字符串约束。另注意：ajv 8 默认只含 draft-07/2019-09，用 2020-12 必须 `import Ajv2020 from 'ajv/dist/2020.js'`（ESM 需带 `.js` 扩展名，否则 `ERR_MODULE_NOT_FOUND`）。
