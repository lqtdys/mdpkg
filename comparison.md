# 方案碰撞与最优解

> ⚠️ **【历史输入 · 已降级为 ADR 素材】** 本文档立场已被 `PLAN_MERGED.md` 取代，仅作「为何弃用 MDE-DC」的推导记录。写作引用 `PLAN_MERGED.md`，勿以本文档结论为准。

## 方案对比矩阵

| 维度 | 方案一（ZIP） | 方案二（MDE-DC 自定义格式） | 推荐选择 |
|------|--------------|------------------------------|---------|
| **核心约束：无需解压直接查看** | ⚠️ 需 ZIP 流解析库 | ✅ 头部固定，可直接跳转读取 Markdown | **方案二** |
| **实现复杂度** | ✅ 低（现成 ZIP 库） | ⚠️ 中等（需实现二进制格式解析） | 方案一 |
| **性能** | ⚠️ 需遍历 ZIP 结构 | ✅ O(1) 随机访问资源 | **方案二** |
| **文件体积** | ✅ 有压缩但需 Central Directory | ✅ 紧凑，索引前置无冗余 | 方案二 |
| **兼容性** | ✅ 通用格式，所有语言都有库 | ⚠️ 需专用解析库 | 方案一 |
| **向后兼容性** | ✅ 解压后是标准 Markdown | ✅ 跳过 256 字节头部即可读 | 平手 |
| **可扩展性** | ⚠️ ZIP 扩展字段有限 | ✅ 自定义 Header，易于扩展 | **方案二** |
| **工具生态** | ✅ 可用通用 ZIP 工具 | ⚠️ 需 MDE 专用工具 | 方案一 |

---

## 关键争议点分析

### 争议 1：ZIP 解压是否算"直接查看"？

**方案一观点**：
- 可以实现 ZIP 流式解析（streaming unzip），无需完全解压到磁盘
- 可以在内存中读取，技术上满足"不解压到磁盘"

**方案二观点**：
- ZIP 流解析仍需完整扫描 ZIP 结构（local file headers + central directory）
- 无法像普通文本文件那样直接用任何工具打开
- 自定义格式只需跳过固定的 256 字节头部，即可用任何编辑器读取 Markdown 部分

**结论**：方案二在"直接查看"的语义上更符合用户预期。

---

### 争议 2：实现复杂度 vs 用户体验

**方案一优势**：
- Phase 1 MVP 可在 2-3 周完成（使用现成的 `archiver` / `unzipper` 库）
- 低风险，可快速验证需求

**方案二优势**：
- 一旦完成，用户体验远超 ZIP
- 性能更好（O(1) 随机访问 vs ZIP 的线性扫描）

**结论**：建议采用**渐进式方案**——Phase 1 用 ZIP 快速验证，Phase 2 迁移到自定义格式。

---

## 推荐最优解：混合渐进方案

### 设计理念

结合两方案优势，分阶段演进：
- **Phase 1**：使用 ZIP 实现快速 MVP（验证需求）
- **Phase 2**：迁移到自定义 MDE-DC 格式（优化体验）
- **向后兼容**：支持两种格式互相转换

---

### Phase 1：ZIP MVP（2-3 周）

#### 技术方案
```
example.mde (ZIP)
├── .mde-header        # 元数据（JSON 格式）
├── index.md          # 主文档
├── assets/           # 资源文件夹
│   ├── images/
│   ├── videos/
│   └── pdfs/
└── includes/         # 子文档
```

#### 扩展语法
```markdown
![logo](mde://assets/images/logo.png)  # 自动解析
(tm) → ™  (c) → ©  --> → →  # 符号扩展
<<< mde://includes/chapter1.md  # 文件包含
```

#### 核心工具
```bash
# 打包
mde pack project/ -o output.mde

# 查看流式解析（无需解压到磁盘）
mde view output.mde  # 内存中解析 ZIP，渲染 HTML

# 解压
mde unpack output.mde -o output/

# 转换到标准 Markdown
mde export output.mde -o standard.md
```

#### 验证清单
- [ ] 创建包含图片和符号的测试项目
- [ ] 打包为 .mde 文件
- [ ] `mde view` 正确渲染（无需解压到磁盘）
- [ ] 标准编辑器可读取解压后的 .md

---

### Phase 2：迁移到 MDE-DC 格式（4-6 周）

#### 技术方案（采用方案二的二进制格式）
```
[HEADER: 256 bytes]
  - Magic: "MDE\x01"
  - Version: 1.0
  - Flags, Index Offset, Markdown Offset, Assets Count

[METADATA SECTION]
  - JSON 格式的元数据

[ASSET INDEX TABLE]
  - 资源索引（前置，O(1) 访问）

[MARKDOWN CONTENT]
  - 原始 Markdown（可直接读取）

[ASSET DATA BLOCKS]
  - 压缩后的资源数据
```

#### 工具升级
```bash
# 从 ZIP 转换到 MDE-DC
mde convert old.mde -o new.mde  # 自动转换

# 向后兼容：支持读取 ZIP 格式
mde view old.mde  # 仍可读取

# 新功能：快速索引
mde ls assets.mde  # 列出所有资源
```

#### 性能对比

| 指标 | ZIP 方案 | MDE-DC 方案 | 提升 |
|------|---------|------------|------|
| **查看启动时间** | ~2-3 秒 | < 1 秒 | 3× |
| **随机访问资源** | ~200ms | ~5ms | 40× |
| **文件体积** | 100KB + overhead | 100KB | 10-20% ↓ |

---

### Phase 3：生态完善（8-12 周）

#### 功能清单
- [ ] VS Code 插件（语法高亮 + 实时预览）
- [ ] Web 查看器（WASM，拖拽预览）
- [ ] 多语言 SDK（Node.js, Python, Go）
- [ ] 插件系统（自定义符号、渲染钩子）

---

## 最终推荐技术方案

### 文件格式规范

#### v1.0（ZIP 基础版）
```
example.mde (ZIP archive)
├── .mde              # 元数据文件（JSON）
├── index.md          # 主文档
└── assets/           # 资源文件夹
    ├── images/
    ├── videos/
    └── pdfs/
```

#### v2.0（MDE-DC 优化版）
```
[BINARY HEADER: 256 bytes fixed]
[METADATA: JSON]
[ASSET INDEX TABLE]
[MARKDOWN CONTENT]
[ASSET DATA BLOCKS]
```

---

### 扩展语法规范

#### 符号扩展
| 输入 | 输出 | 类别 |
|------|------|------|
| `(tm)` | ™ | 商标符号 |
| `(c)` | © | 版权符号 |
| `(r)` | ® | 注册符号 |
| `-->` | → | 箭头 |
| `-->` | → | 箭头 |
| `=/=` | ≠ | 不等号 |
| `+/-` | ± | 加减号 |
| `1/2` | ½ | 分数 |
| `...` | … | 省略号 |

#### 资源引用
```markdown
![image](mde://assets/images/logo.png)  # ZIP 版本
![image](asset://1001)                    # MDE-DC 版本
```

#### 文件包含
```markdown
<<< mde://includes/chapter1.md  # ZIP 版本
<<< asset://2001                  # MDE-DC 版本
```

---

### 兼容性策略

#### 渐进增强三层
1. **标准 Markdown 编辑器**：
   - ZIP 版本：解压后读取 `.md`
   - MDE-DC 版本：跳过前 256 字节读取 Markdown

2. **MDE 感知编辑器**：
   - 解析元数据
   - 渲染符号和资源
   - 提供预览

3. **CLI 工具降级**：
   ```bash
   mde view doc.mde          # 完整渲染
   mde view doc.mde --plain  # 提取原始 Markdown
   mde export doc.mde -o md  # 导出为标准 MD + assets/
   ```

---

## 验证计划

### Phase 1 验证
```bash
# 创建测试项目
mkdir test && echo "# Test (tm) (c) -->" > test/index.md
mkdir -p test/assets/images && cp logo.png test/assets/images/

# 打包
mde pack test/ -o output.mde

# 验证流式解析（不解压到磁盘）
mde view output.mde > output.html
# 检查 output.html 是否包含 ™ © →

# 解压验证
mde unpack output.mde -o restored/
diff -r test/ restored/  # 应完全一致
```

### Phase 2 验证
```bash
# 格式转换
mde convert output.mde -o output-v2.mde

# 性能测试
time mde view output.mde       # ZIP 版本
time mde view output-v2.mde    # MDE-DC 版本（应更快）

# 随机访问测试
mde ls output-v2.mde           # 列出所有资源
mde extract output-v2.mde --asset 1001 -o logo.png  # 快速提取单个资源
```

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| **Phase 1 ZIP 无法满足"直接查看"** | 实现流式解析（in-memory unzip），技术上可行 |
| **Phase 2 迁移成本高** | 提供自动转换工具，向后兼容 ZIP 格式 |
| **生态采用率低** | 提供通用工具（VS Code 插件、Web 查看器），降低使用门槛 |
| **标准碎片化** | 开源规范，GitHub 讨论，避免闭源 |

---

## 最终建议

1. **立即启动 Phase 1**（ZIP MVP），2-3 周内完成基础工具
2. **收集用户反馈**，验证核心需求
3. **Phase 2 迁移到 MDE-DC**，优化性能和用户体验
4. **向后兼容**：支持两种格式互相转换

**核心原则**：渐进式演进，快速验证需求，逐步优化体验。

---

## 下一步行动

- [ ] 确认 Phase 1 MVP 功能范围
- [ ] 确认符号集合（是否包含所有 SmartSymbols）
- [ ] 选择实现语言（推荐 Rust 或 Go）
- [ ] 创建仓库结构
- [ ] 开始实现 Phase 1