# Markdown 扩展标准计划

## Context

Markdown 文档语法极简，但在实际使用中存在一些痛点：
- 图片显示不便（需要相对路径或外链，传输时附件丢失）
- 缺少丰富的符号扩展效果
- 单文件包传输困难（附件分散）
- 文件链接嵌入不便（视频、PDF、其他MD文件）

用户希望建立一套开源的 Markdown 扩展标准，解决这些问题。可能的实现方式：
- 新后缀名（如 `.mdx` 或 `.mde`）
- 扩展包形式（MD文件+资源文件夹）
- 打包成单个文件包传输

**MVP 范围**：图片嵌入、符号扩展、单文件包传输

## Research Goals

1. **调研现状** - 检索 Markdown 社区已讨论的痛点和改进方案
2. **收集需求** - 整理用户提出的具体功能需求
3. **可行性分析** - 评估不同技术方案的可行性
4. **设计标准** - 提出扩展语法规范和打包格式
5. **实现路线** - 规划最小可行产品（MVP）

## Proposed Approach

### 技术路线建议

**推荐方案：新后缀 `.mde` (Markdown Enhanced) + ZIP 打包**

#### 理由
1. **新后缀名**：明确标识扩展格式，避免与标准 MD 混淆
2. **ZIP 打包**：
   - 通用格式，所有操作系统原生支持
   - 可压缩图片体积
   - 易于解压查看源码
   - 支持嵌套文件夹结构
3. **向后兼容**：解压后的 `.md` 文件仍是标准 Markdown

#### 文件结构
```
example.mde (ZIP)
├── index.md          # 主文档
├── assets/           # 资源文件夹
│   ├── images/
│   ├── videos/
│   └── pdfs/
└── includes/         # 可包含的子文档
    ├── chapter1.md
    └── chapter2.md
```

#### 扩展语法

1. **图片嵌入**（自动解析）
   ```markdown
![图片](mde://assets/images/logo.png)  # 自动打包
```

2. **符号扩展**
   ```markdown
(tm) → ™    (c) → ©    (r) → ®
--> → →    <-- → ←    <--> → ↔
=/= → ≠    +/- → ±    1/2 → ½
```

3. **文件包含**
   ```markdown
<<< mde://includes/chapter1.md  # 在此位置嵌入内容
```

4. **Base64 可选模式**
   ```markdown
![图片](data:image/png;base64,......)  # 手动 base64
```

### 核心功能

#### MVP（第一阶段）
- [x] 图片自动打包和引用
- [x] 符号扩展（基础集合）
- [x] ZIP 打包工具
- [x] 简单渲染器（预览）

#### 第二阶段
- [ ] 文件包含指令
- [ ] 视频/PDF 嵌入
- [ ] 编辑器插件集成
- [ ] CLI 工具完善

#### 第三阶段
- [ ] 自定义符号定义
- [ ] 渲染主题系统
- [ ] 协作功能

### 兼容性策略

1. **渐进增强**：`.mde` 文件解压后是标准 `.md`，可用任何 MD 编辑器打开
2. **回退机制**：渲染器不支持扩展时，显示原始符号（如 `(tm)` 而非 ™）
3. **元数据标识**：在文档头部添加标识，告知渲染器启用扩展
   ```markdown
<!--
mde-version: 1.0
extensions: smartsymbols, image-bundle
-->
```

## Research Findings

### 现有解决方案对比

| 方案 | 图片处理 | 符号扩展 | 单文件 | 文件包含 | 备注 |
|------|---------|---------|--------|---------|------|
| **Markdown** | ❌ 仅链接 | ❌ | ❌ | ❌ | 基础格式 |
| **MDX** | ✅ React组件 | ⚠️ 需自定义 | ⚠️ 需打包 | ✅ JSX | 依赖React生态 |
| **AsciiDoc** | ⚠️ 标准 | ⚠️ 部分支持 | ⚠️ 需打包 | ✅ include指令 | 学习曲线陡 |
| **Obsidian** | ✅ 附件管理 | ⚠️ 插件 | ✅ Vault | ✅ Wiki链接 | 闭源生态 |
| **PyMdown Extensions** | ✅ B64 base64 | ✅ SmartSymbols | ✅ Base64嵌入 | ❌ | Python生态 |

### 技术方案发现

1. **图片嵌入方案**
   - **Base64 嵌入**（PyMdown B64）：将图片转为 data URI，单文件 HTML
   - 优点：真正的单文件，无附件丢失
   - 缺点：文件体积增大 30-40%，不适合大图片

2. **符号扩展方案**
   - **SmartSymbols**（PyMdown）：`(tm)` → ™, `(c)` → ©, `-->` → →
   - 可配置开关：`trademark`, `copyright`, `arrows`, `fractions` 等
   - 易于实现，可作为解析插件

3. **文件包含方案**
   - **AsciiDoc include 指令**：`include::chapter01.adoc[]`
   - 支持相对路径、URL、标签筛选
   - 是预处理器指令，解析前展开

4. **打包格式选项**
   - **ZIP 归档**：通用，易解压
   - **Base64 HTML**：单文件，但体积大
   - **自定义二进制格式**：紧凑但需专用工具
   - **JSON 包装**：`{"content": "...", "assets": {...}}`

### 痛点总结

1. **图片丢失**：普通 Markdown 的图片是引用，传输时需附带文件夹
2. **符号贫乏**：无法表达数学符号、箭头、特殊标点
3. **碎片化**：多文件结构导致管理困难
4. **缺乏扩展性**：标准 Markdown 无法添加自定义语法

## Implementation Plan

### Phase 1: MVP（核心功能）

- [ ] **规范文档编写**
  - [ ] 定义 `.mde` 文件格式规范
  - [ ] 定义符号扩展语法
  - [ ] 定义资源引用规则

- [ ] **打包工具开发**
  - [ ] CLI 工具：`mde pack <folder> -o output.mde`
  - [ ] CLI 工具：`mde unpack <file.mde> -o output/`
  - [ ] 自动检测 assets/ 文件夹并打包
  - [ ] 解压时保持文件夹结构

- [ ] **基础渲染器**
  - [ ] 解析 `.mde` ZIP 结构
  - [ ] 实现符号替换（参考 PyMdown SmartSymbols）
  - [ ] 图片引用解析（相对路径转 data URI）
  - [ ] 生成 HTML 预览

### Phase 2: 扩展功能

- [ ] **文件包含系统**
  - [ ] 实现 `<<<` 指令解析
  - [ ] 支持嵌套包含检测（防止循环）
  - [ ] 支持标签筛选

- [ ] **多媒体嵌入**
  - [ ] 视频文件引用（HTML5 video 标签）
  - [ ] PDF 预览（iframe 或 PDF.js）
  - [ ] 资源自动打包检测

- [ ] **编辑器集成**
  - [ ] VS Code 插件
  - [ ] Typora 插件（如果可能）
  - [ ] Web 编辑器（基于 Monaco）

### Phase 3: 生态建设

- [ ] **标准化**
  - [ ] 发布规范文档到 GitHub
  - [ ] 提交到相关标准组织讨论

- [ ] **工具链**
  - [ ] Node.js SDK
  - [ ] Python SDK
  - [ ] Rust/Go 版本（性能优化）

- [ ] **社区**
  - [ ] 示例库
  - [ ] 模板集合
  - [ ] 插件系统

## Files to Modify / Create

### 新文件
- `spec/mde-format-spec.md` - 格式规范文档
- `spec/symbols-syntax.md` - 符号扩展语法
- `packages/cli/src/` - CLI 工具源码
- `packages/renderer/src/` - 渲染器源码
- `examples/` - 示例集合
- `tests/` - 测试用例

### 可复用工具和库
- **PyMdown Extensions**（参考实现）
  - 符号替换逻辑：`pymdownx/smartsymbols.py`
  - Base64 嵌入：`pymdownx/b64.py`
- **AsciiDoc Include**（参考实现）
  - 文件包含指令设计
- **remark/remark-embed-images**（参考实现）
  - Markdown 图片处理管道

## Reuse from Existing Codebase

N/A - 这是一个全新项目。

## Implementation Checklist

### Phase 1: MVP

- [ ] 创建项目仓库结构
- [ ] 编写 `.mde` 格式规范文档
- [ ] 编写符号扩展语法文档
- [ ] 实现 CLI 打包工具（Node.js）
- [ ] 实现 CLI 解包工具
- [ ] 实现基础渲染器（符号替换 + 图片引用）
- [ ] 编写单元测试
- [ ] 创建第一个示例文件

### Phase 2: 扩展功能

- [ ] 实现 `<<<` 文件包含指令
- [ ] 实现视频/PDF 嵌入支持
- [ ] 开发 VS Code 插件（语法高亮 + 预览）
- [ ] 开发 Web 编辑器
- [ ] 添加更多符号支持
- [ ] 编写集成测试

### Phase 3: 生态

- [ ] 发布规范到 GitHub Pages
- [ ] 创建 CLI 的 npm 包
- [ ] 创建 Python 版本的打包工具
- [ ] 创建示例模板库
- [ ] 设计插件系统 API
- [ ] 编写开发者文档

## Verification Plan

### Phase 1 MVP 验证

1. **打包工具测试**
   ```bash
   # 创建测试文件结构
   mkdir test-project
   echo "# Test (tm) (c) -->" > test-project/index.md
   mkdir test-project/assets/images
   cp logo.png test-project/assets/images/
   
   # 打包
   mde pack test-project -o output.mde
   
   # 验证
   unzip -l output.mde  # 应显示 index.md 和 assets/
   ```

2. **解包工具测试**
   ```bash
   mde unpack output.mde -o restored/
   diff test-project/index.md restored/index.md  # 应相同
   ```

3. **渲染器测试**
   - 输入：包含 `(tm) --> 1/2` 的 Markdown
   - 输出：包含 `™ → ½` 的 HTML
   - 验证图片引用正确解析

4. **回归测试**
   - 打包→解包→渲染→再打包，内容应保持一致

### Phase 2 验证

1. **文件包含测试**
   ```bash
   # 创建包含链
   echo "Included content" > chapter1.md
   echo "<<< mde://chapter1.md" > index.md
   
   # 渲染应包含 "Included content"
   ```

2. **循环包含检测**
   - 文件A包含文件B，文件B包含文件A
   - 应检测并报错，不进入无限循环

3. **多媒体测试**
   - 视频文件应生成 `<video>` 标签
   - PDF 文件应可预览

4. **编辑器插件测试**
   - VS Code 插件应正确高亮语法
   - 预览面板应正确渲染

### Manual Testing Checklist

- [ ] 创建一个包含多种符号的测试文档
- [ ] 创建一个包含多张图片的文档并打包
- [ ] 将 `.mde` 文件发送给他人，验证是否能正常打开
- [ ] 在不同操作系统上测试解包（Windows/macOS/Linux）
- [ ] 测试大文件（>10MB）的打包/解包性能
- [ ] 测试中文文件名路径

## Open Questions

1. **符号集合选择**
   - 是否包含所有 PyMdown SmartSymbols 的符号？
   - 是否支持用户自定义符号映射？

2. **Base64 vs ZIP**
   - 是否提供两种模式供用户选择？
   - 还是固定使用 ZIP 模式？

3. **渲染器分发**
   - 是否需要独立的桌面应用？
   - 还是以 Web 渲染器和 CLI 工具为主？

4. **向后兼容性**
   - 标准 Markdown 编辑器打开 `.mde` 时，`mde://` 协议会失效
   - 如何优雅降级？

## Risks and Mitigation

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **采用率低** | 高 | 与现有工具集成（VS Code, Obsidian），提供迁移指南 |
| **标准碎片化** | 中 | 开源规范，欢迎社区贡献，避免闭源 |
| **性能问题** | 中 | 大文件异步处理，提供优化选项 |
| **安全问题** | 中 | ZIP 解包时限制路径，防止目录遍历攻击 |
| **编辑器支持** | 高 | 优先开发 VS Code 插件，提供 Web 编辑器作为备选 |

## Alternative Approaches Considered

### 方案 A：纯 Base64 嵌入
**优点**：真正的单文件，无需解压
**缺点**：文件体积增大 30-40%，大图片不适用，编辑困难
**结论**：作为可选特性，不作为主要方案

### 方案 B：JSON 包装格式
**优点**：结构清晰，易于编程处理
**缺点**：失去 Markdown 的文本可读性，标准编辑器无法直接打开
**结论**：不适合作为标准格式

### 方案 C：自定义二进制格式
**优点**：体积小，性能高
**缺点**：需要专用工具，社区采用门槛高
**结论**：不推荐

### 方案 D：扩展现有 MDX
**优点**：已有生态基础
**缺点**：强依赖 React，不满足"全部受众"目标
**结论**：作为可选渲染模式，不作为核心标准

## Recommended Next Steps

1. **确认技术路线** - 是否同意 `.mde + ZIP` 方案？
2. **确定符号集合** - 从 PyMdown SmartSymbols 开始，还是定义自己的符号集？
3. **确定 MVP 范围** - 是否需要文件包含功能在第一阶段？
4. **选择实现语言** - Node.js（生态好）vs Python（易迁移 PyMdown 代码）vs Rust（性能）？

确认以上后，可开始实现 Phase 1 MVP。