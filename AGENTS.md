# PROJECT KNOWLEDGE BASE — MDE (Markdown Enhanced)

**Generated:** 2026-08-30
**Commit:** 0b1140b
**Branch:** main

## OVERVIEW

MDE 标准（`.mde` 格式）的设计规划仓库。核心目标：让 Markdown 支持图片自动打包、符号扩展、文件包含，并可用单文件传输。当前阶段为纯规划（无任何实现代码），技术路线未最终拍板。

## 用户约定（MANDATORY）

- **对用户的一切反馈使用中文**。所有文档均为中文撰写，交流语言保持一致。

## STRUCTURE

```
mde/
├── PLAN_MERGED.md       # 【现行立场】合并规划：PLAN 需求 + Codex 方案 + 双方审查（唯一现行来源）
├── PLAN.md              # 历史输入：原始需求与主计划（立场已被 PLAN_MERGED 取代）
├── PROPOSAL_COD.md      # 历史输入：MDE-DC 双层容器二进制方案（非 v1 范围，候选设计记录）
├── comparison.md        # 历史输入：ZIP vs MDE-DC 对比矩阵（已降级为 ADR 素材）
├── spec/                # 【现行规范】mde-format-spec.md（正文 + 错误码 + fixtures 定义 + Schema）
├── packages/mde/        # 【参考实现】Node/TS CLI：errors/container/cli + test
├── memoryos_data/       # MemoryOS 存储骨架（空占位，勿写入业务内容）
├── .pi-glla/            # 代理会话元数据（运行时噪音，勿编辑）
├── .omo/                # OMO 会话延续状态（运行时噪音，勿编辑）
└── .codegraph/          # 代码图谱索引缓存（自动生成；source.json 指向兄弟仓库 ~/mde）
```

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| 项目背景/路线图（历史） | PLAN.md | 三阶段 MVP 计划（立场已被 PLAN_MERGED 取代） |
| 二进制格式备选方案（历史） | PROPOSAL_COD.md | 字节级布局、威胁模型（非 v1 范围） |
| 方案取舍决策依据（历史） | comparison.md | ZIP vs MDE-DC 逐维度对比（ADR 素材） |
| 现行立场与已拍板决策 | PLAN_MERGED.md §13/§14 | 已拍板 6 项见 §13，治理与下一步见 §14 |
| v1 格式规范（现行） | spec/mde-format-spec.md | MUST/SHOULD/MAY 正文；附录 A 错误码 / B fixtures / C Schema |
| 实现代码 | packages/mde/src/ | container.ts（ZIP 安全/可重复构建）、errors.ts、cli.ts |
| 落地计划与探针结论 | plans/mde-review-round2.md | 可行性分析 + M0 探针结果 + M1 结果 |
| 真实代码（如有） | ~/mde | .codegraph/source.json 指向的兄弟仓库（已不存在，实现改在本仓库 packages/）|

## CONVENTIONS

- 全部文档使用中文，术语保留英文缩写（MDE, MVP, ZIP）。
- 文档结构：上下文 → 方案 → 对比 → 阶段计划 → 验证 → 风险。新文档沿用此骨架。
- 已拍板：实现语言 Node.js/TypeScript（Python 次选）、符号集先 core 后 extended（PyMdown SmartSymbols 为来源，许可证 MIT 声明）。

## ANTI-PATTERNS (THIS PROJECT)

- 不写入来源不明的方案结论：所有技术选型必须有对比依据（参照 comparison.md 的矩阵格式）。
- 不创建**规划文档以外**的多余文件。实现代码放 `packages/mde/`（原「实现应放 `~/mde`」已失效——`~/mde` 就是本仓库，与「不创建实现代码」自相矛盾）。
- 实现用 Node 22.18+ 的**内置类型剥离**直接跑 `.ts`，不加构建配置；因此只能用 erasable syntax（禁用构造函数参数属性、enum、namespace）。
- 不动工具目录（.pi-glla/, .omo/, .codegraph/, memoryos_data/）内容。

## COMMANDS

```bash
# 实现（packages/mde/）
cd packages/mde && npm test                      # node --test test/container.test.ts
node src/cli.ts pack <dir> -o out.mde            # 打包
node src/cli.ts list out.mde                     # 列条目（只读 header，不解压）
node src/cli.ts unpack out.mde -o dir            # 解包
node src/cli.ts validate out.mde                 # 校验（Schema + size/sha256 + 引用闭包）
node src/cli.ts render out.mde -o out.html       # 渲染（默认 inline 单文件；>50MB 自动降级 --dir）
node src/cli.ts export --raw out.mde -o dir      # 导出：结构保持、文本未改
node src/cli.ts export --expanded out.mde -o dir # 导出：include 已展开、相对路径已按包根重写
node src/cli.ts diff a.mde b.mde                 # 对比两包（解包后 diff -ruN）
unzip -l out.mde                                 # 互操作验证：通用 ZIP 工具可读

# 仓库
git log --oneline          # 变更历史
git status                 # 工作区状态（注意 PLAN_MERGED.md / spec/ / packages/ 均未跟踪）
```

## NOTES

- 立场已收敛：v1 = ZIP + manifest.json 容器（见 PLAN_MERGED.md）。PLAN.md / PROPOSAL_COD.md / comparison.md 均为历史输入，**写作时引用 PLAN_MERGED.md，避免三者混用**。
- 安全风险已在 PLAN_MERGED.md §8/§9 记录：ZIP 解包需防目录遍历、炸弹、符号链接与 include 放大。
- **`PLAN_MERGED.md` / `spec/` / `packages/` / `plans/` 均为 git 未跟踪文件**（只有一个 init commit），改动无法回滚，编辑前先确认。
- M0 可行性探针（S1–S4）已全部 PASS，结论见 `plans/mde-review-round2.md` §2.4.1。两个实测陷阱：fflate 的 `size` 是压缩后大小（`originalSize` 才是原始，用错会让炸弹防护失效）；符号转义必须用哨兵法（Markdown 解析会先消费反斜杠）。
- 规范测试集（conformance fixtures）定义在 `spec/mde-format-spec.md` 附录 B，**尚未落盘**。

## CURRENT STATE（2026-08-30）

- 立场：`PLAN_MERGED.md`；规范：`spec/mde-format-spec.md`；计划：`plans/mde-review-round2.md`。
- 已完成：M0 可行性探针（4/4 PASS）、M1 容器骨架（9/9 + `unzip -l` 互操作 + diff 往返）、M2 manifest + `validate`（16/16 + E401 负向）、M3 `render` + core 符号（25/25 + 自包含 HTML）、M4 `include`（35/35 + 多级 include 端到端）。**v1 三项能力（资源随包 / 符号扩展 / 文件包含）至此全部实现。**
- 已完成 M5：conformance fixtures **40 个用例**（`spec/fixtures/<id>/{case.json,input/}`，驱动 `packages/mde/test/fixtures.test.ts`）。**全量测试 75/75**（35 单测 + 40 fixture）。
- 已完成 M6：规范与实现逐条对齐，补齐 5 处「规范承诺但实现缺失」（E701/E702 版本协商、`--referenced-only`、`export --raw/--expanded`、`mde diff`），`--fetch` 显式标注为 v1 不提供。
- **M0–M6 全部完成**（M7 为延后项）。测试入口：`cd packages/mde && node --test test/*.test.ts`，**78/78**（36 单测 + 42 conformance fixture）。
- 已知缺口：`--fetch` 未提供（规范已标注为参考实现 v1 不提供）；`unpack-roundtrip` fixture 未落盘（已由单测 diff 往返覆盖）；M7（VS Code 插件）在采用可行性验证前不启动。
- 定位：先自用后标准化，3 个月止损判据；VS Code 插件（M7）在采用可行性验证前不启动。