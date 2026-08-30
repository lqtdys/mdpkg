# MDE — Markdown Enhanced

把一篇带图、分章节的 Markdown 文档，打包成**一个可校验、可离线打开、可重复构建的 `.mde` 文件**。

```bash
mde pack   ./my-doc  -o doc.mde     # 打包（图片随包）
mde validate doc.mde                # 校验（结构 + 哈希 + 引用闭包）
mde render doc.mde   -o doc.html    # 渲染（单文件自包含 HTML，图片已内联）
```

## 它解决什么

普通 Markdown 的图片是引用，传一个文件就会丢附件。MDE 提供三项能力：

| 能力 | 说明 |
|---|---|
| 资源随包 | 用原生相对路径写 `![图](assets/a.png)`，打包时资源一起进包，缺失直接报错 |
| 符号扩展 | `(tm)` → `™`、`-->` → `→`，只在普通文本中、渲染期生效，不改动原文 |
| 文件包含 | `<<< includes/ch1.md`，解析前展开，支持嵌套与循环检测 |

**「单文件」的准确含义**：交付与传输只有一个文件。它不意味着用文本编辑器打开 `.mde` 就能看到完整渲染——那是 `unpack` / `export` / `render` 的职责。

## 快速开始

```bash
cd packages/mde && npm install

# 一个最小例子
mkdir -p demo/assets demo/includes
printf '# 标题 (tm)\n\n![图](assets/a.png)\n\n<<< includes/ch1.md\n' > demo/document.md
printf '第一章 (c) --> 结尾\n' > demo/includes/ch1.md
head -c 5000 /dev/urandom > demo/assets/a.png      # 任意图片

node src/cli.ts pack demo -o demo.mde
node src/cli.ts validate demo.mde
node src/cli.ts render demo.mde -o demo.html        # 打开 demo.html 即可看
```

要求 Node 22.18+（用内置类型剥离直接跑 `.ts`，无构建步骤）。

## 命令

| 命令 | 作用 |
|---|---|
| `pack <dir> -o out.mde` | 打包。默认打包目录内全部文件；`--referenced-only` 只打引用闭包 |
| `unpack <pkg> -o dir` | 解包，强制路径校验与解压上限 |
| `list <pkg>` | 列条目（只读 header，不解压） |
| `validate <pkg>` | Schema + size + sha256 + 引用闭包；统计外链数 |
| `render <pkg> -o out.html` | 默认内联为单文件 HTML；资源 > 50 MB 自动降级 `--dir` |
| `export --raw <pkg> -o dir` | 结构保持、文本一字不改 |
| `export --expanded <pkg> -o dir` | include 已展开、相对路径已按包根重写（可被任何 MD 工具打开） |
| `diff a.mde b.mde` | 解包双方后 `diff -ruN` |

## 格式

`.mde` 是**标准 ZIP**，根目录含 `manifest.json`（版本、入口、资源索引含 sha256）。

- 可重复构建：mtime 固定 `1980-01-01`、条目按路径升序、同输入必产同字节 → Git 友好、可缓存
- 完整性：size + sha256 用于检测**损坏/误传/跨平台字节漂移**；**不防篡改**（manifest 与资源同在包内，防篡改需签名，v1 不提供）
- 降级：解包即标准 Markdown；`<<<` 在不支持的渲染器里是可见文本

完整规范见 [`spec/mde-format-spec.md`](spec/mde-format-spec.md)。

## 测试

```bash
cd packages/mde && node --test test/*.test.ts
# 78 个用例：36 个实现单测 + 42 个 conformance fixture（spec/fixtures/）
```

fixture 是与实现无关的数据（`case.json` + `input/`），任何语言的实现跑通同一批用例即视为合规。

## 定位与已知缺口

**先自用，后标准化。** 这是一个正在被真实使用验证的格式，不是已确立的标准。若自用 3 个月后没有第二个使用者或实现者，它应降级为内部工具，不再投入规范治理成本。

已知缺口：
- `--fetch`（下载外链）未提供——会引入网络依赖与 SSRF 面，与「不下载、可预测」立场冲突
- `unpack-roundtrip` fixture 未落盘（已由单测的 diff 往返覆盖）
- 无 VS Code 插件（在采用可行性验证前不启动）

## 许可证

规范文本 CC BY 4.0；实现代码 MIT；测试向量（`spec/fixtures/`）CC0，可无摩擦复制。
符号映射表参考 PyMdown Extensions（MIT）。
