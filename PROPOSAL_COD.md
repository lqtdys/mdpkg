# 方案二：双层容器格式（MDE-DC）- Codex 第二意见

> ⚠️ **【历史输入 · 非 v1 范围 · 候选设计】** 本文档为 MDE-DC 双层容器二进制方案的候选设计记录（v2 候选），立场已被 `PLAN_MERGED.md` 取代（v1 = ZIP + manifest）。写作引用 `PLAN_MERGED.md`。

## 核心设计理念

**解决 ZIP 方案的关键缺陷**：ZIP 格式需要解压或 ZIP 流解析，无法直接查看。方案二采用**双层容器格式**：

1. **外层容器**：单一二进制文件，可直接流式读取
2. **内层结构**：Markdown + 嵌入资源（直接寻址）

---

## 1. 技术方案设计

### 文件格式：`.mde` (MDE Dual-Container)

#### 文件结构（字节级布局）

```
[HEADER: 256 bytes]
  - Magic: "MDE\x01" (4 bytes)
  - Version: 2 bytes (uint16)
  - Flags: 4 bytes (bit flags for features)
  - Header Length: 4 bytes (uint32)
  - Index Offset: 8 bytes (uint64)
  - Markdown Offset: 8 bytes (uint64)
  - Assets Count: 4 bytes (uint32)
  - Reserved: 226 bytes (zero-padded)

[METADATA SECTION]
  - UTF-8 key-value pairs
  - mde-version, extensions, created-at, author, etc.

[ASSET INDEX TABLE]
  For each asset:
    - Asset Type: 1 byte (0=MD, 1=PNG, 2=JPEG, 3=GIF, 4=SVG, 5=PDF, 6=VIDEO)
    - Asset ID: 4 bytes (uint32)
    - Name Length: 2 bytes (uint16)
    - Asset Name: UTF-8 string (variable)
    - File Offset: 8 bytes (uint64)
    - File Size: 8 bytes (uint64)
    - Compressed Size: 8 bytes (uint64) (0 if uncompressed)
    - CRC32: 4 bytes
    - Reserved: 7 bytes

[MARKDOWN CONTENT]
  - Raw UTF-8 markdown text
  - 使用特殊语法引用资源：`asset://{id}` 或 `{ref:id}`

[ASSET DATA BLOCKS]
  For each asset:
    - Compressed data (DEFLATE or LZ4)
```

#### 关键设计决策

| 特性 | 决策 | 理由 |
|------|------|------|
| **容器格式** | 自定义二进制格式 | ZIP 需完整解析，自定义格式支持随机访问和流式读取 |
| **资源压缩** | DEFLATE（兼容 zlib） | 通用、高效、所有语言都有库 |
| **索引位置** | Header + 前置索引表 | 无需遍历整个文件即可查找资源 |
| **Markdown 位置** | 紧跟索引表 | 普通编辑器可直接跳过头部读取 Markdown |

---

### 扩展语法

#### 图片引用
```markdown
<!-- 传统方式（兼容）-->
![logo](images/logo.png)

<!-- MDE 扩展方式-->
![logo](asset://1001)  <!-- 按 ID 引用打包后的资源 -->
```

#### 符号扩展
```markdown
(tm) → ™    (c) → ©    (r) → ®
--> → →    <-- → ←    <--> → ↔
=/= → ≠    /= → ≠     != → ≠
+/- → ±    1/2 → ½    1/4 → ¼
... → …    (tm)->™  (c)->©
<= → ≤     >= → ≥     -> → →
```

#### 文件包含
```markdown
<<< asset://2001  <!-- 包含另一个 MD 文件 -->
```

#### 可选内嵌 Base64（小文件）
```markdown
![tiny-icon](data:image/png;base64,iVBORw0KGgoAAAA...)  <!-- < 64KB -->
```

---

### 兼容性策略

#### 渐进增强方案

1. **标准 Markdown 编辑器**：
   - 跳过前 256 字节的 Header
   - 直接读取 Markdown section
   - 显示原始符号：`(tm)`, `-->` 等
   - 显示资源引用原文：`asset://1001`

2. **MDE 感知编辑器/查看器**：
   - 解析 Header 和 Index
   - 解码资源块
   - 渲染符号和资源
   - 提供预览面板

3. **CLI 工具降级**：
   ```bash
   mde view doc.mde          # 完整渲染（内置查看器）
   mde view doc.mde --plain  # 提取原始 Markdown（兼容模式）
   mde export doc.mde -o md  # 导出为标准 MD + assets/
   ```

#### 元数据标识
```markdown
<!--
mde-version: 1.0
extensions: smartsymbols, asset-bundle, file-include
created: 2024-01-15T10:30:00Z
-->
```

---

## 2. 实现路线图

### Phase 1 MVP（4-6 周）

#### 功能清单
- [ ] **格式规范文档**
  - [ ] 二进制格式详细规范
  - [ ] 符号映射表
  - [ ] 元数据标准

- [ ] **CLI 工具核心**
  - [ ] `mde create <folder> -o output.mde` - 创建 MDE 文件
  - [ ] `mde view <file.mde>` - 完整渲染查看
  - [ ] `mde extract <file.mde> -o folder/` - 提取资源

- [ ] **核心库（Rust 实现）**
  - [ ] 二进制格式解析器
  - [ ] 资源编解码
  - [ ] 符号替换引擎

- [ ] **简单渲染器**
  - [ ] 命令行预览（支持符号和图片）
  - [ ] HTML 导出

#### 验证标准
```bash
# 创建测试文件
mde create test-project/ -o test.mde

# 直接查看（不解压）
mde view test.mde  # 应显示渲染后的内容

# 提取验证
mde extract test.mde -o extracted/
diff -r test-project/ extracted/  # 应完全一致
```

---

### Phase 2 扩展功能（6-8 周）

#### 功能清单
- [ ] **高级渲染器**
  - [ ] 文件包含解析
  - [ ] 循环包含检测
  - [ ] 增量渲染（缓存）

- [ ] **编辑器集成**
  - [ ] VS Code 插件
    - [ ] 语法高亮
    - [ ] 实时预览
    - [ ] 资源管理侧边栏
  - [ ] Obsidian 插件

- [ ] **Web 查看器**
  - [ ] WASM 版本（无需服务器）
  - [ ] 拖拽预览

- [ ] **多媒体支持**
  - [ ] 视频嵌入（H.264/VP9）
  - [ ] PDF 预览
  - [ ] SVG 支持优化

---

### Phase 3 生态建设（8-12 周）

#### 功能清单
- [ ] **SDK 多语言支持**
  - [ ] Node.js SDK（TypeScript）
  - [ ] Python SDK
  - [ ] Go SDK

- [ ] **插件系统**
  - [ ] 自定义符号映射
  - [ ] 自定义资源处理器
  - [ ] 渲染钩子

- [ ] **标准与文档**
  - [ ] GitHub Pages 规范文档
  - [ ] 示例库
  - [ ] 迁移指南

- [ ] **工具链完善**
  - [ ] Git 集成（diff 支持）
  - [ ] CI/CD 集成
  - [ ] 性能分析工具

---

## 3. 核心权衡决策

### 决策 1：为什么选择自定义二进制格式而非 ZIP？

| 维度 | ZIP 方案 | 自定义格式 |
|------|---------|-----------|
| **无需解压查看** | ❌ 需要 ZIP 流解析库 | ✅ 头部固定，可直接跳转 |
| **随机访问** | ⚠️ 需要 Central Directory | ✅ 索引表前置，O(1) 访问 |
| **流式读取** | ✅ 支持 | ✅ 支持 |
| **文件体积** | ✅ 有目录开销 | ✅ 紧凑，无冗余 |
| **兼容性** | ✅ 通用格式 | ⚠️ 需专用工具 |
| **实现复杂度** | ✅ 可用现成库 | ⚠️ 需从头实现 |

**结论**：自定义格式在核心约束"无需解压直接查看"上优势明显，虽然需要开发专用解析库，但 Rust 高性能库可快速实现。

---

### 决策 2：资源压缩方案选择

#### 选项对比
- **DEFLATE (zlib)**：兼容性最好，所有语言都有库
- **LZ4**：压缩/解压速度极快，但压缩率稍低
- **ZSTD**：平衡压缩率和速度，较新

**结论**：Phase 1 使用 DEFLATE（最成熟），Phase 3 可选支持 LZ4/ZSTD。

---

### 决策 3：如何平衡单文件便利性和文件体积？

#### 策略
1. **小文件（< 64KB）**：直接内嵌 Base64（可选）
2. **大文件（≥ 64KB）**：存储到资源块并压缩
3. **用户可选**：
   ```bash
   mde create project/ -o output.mde --compress-level 9  # 最大压缩
   mde create project/ -o output.mde --no-compress        # 速度优先
   ```

**预期体积变化**：
- 文本类 Markdown：压缩后 40-60%
- PNG/JPG 图片：压缩后 85-95%（图片已压缩）
- PDF/视频：压缩后 90-95%

---

### 决策 4：向后兼容性保障

#### 三层兼容方案
1. **物理层**：Markdown 内容不加密，可直接读取
2. **语法层**：扩展语法不影响标准 Markdown 解析
3. **工具层**：提供降级命令提取标准 Markdown

**验证**：
```bash
# 标准 MD 编辑器打开 .mde
cat test.mde | tail -n +65  # 跳过前 256 字节头部

# CLI 工具提取
mde extract test.mde --md-only -o output.md
```

---

## 4. 验证计划

### 功能验证

#### 测试矩阵

| 测试项 | 输入 | 预期输出 | 验证方法 |
|--------|------|---------|---------|
| **符号替换** | `(tm) --> 1/2` | `™ → ½` | 单元测试 |
| **图片嵌入** | `asset://1001` | `<img src="data:image/...">` | 集成测试 |
| **文件包含** | `<<< asset://2001` | 展开后的内容 | 手动测试 |
| **大文件处理** | 100MB 视频 | < 20min 处理 | 性能测试 |
| **循环包含检测** | A→B→A | 报错并退出 | 单元测试 |

#### 回归测试
```bash
# 完整流程测试
mde create src/ -o test.mde
mde view test.mde > preview.html
mde extract test.mde -o restored/
diff -r src/ restored/  # 应完全一致
```

---

### 性能验证

#### 基准测试
- **创建时间**：1000 个文件 < 30 秒
- **查看启动**：< 1 秒（流式读取）
- **内存占用**：< 500MB（含 10MB 资源）
- **压缩率**：Markdown 40-60%，图片 85-95%

---

### 安全验证

#### 威胁模型
1. **路径遍历攻击**：`../../../etc/passwd`
   - **防御**：Asset ID 仅数字，无路径
2. **恶意大文件**：解压炸弹
   - **防御**：限制最大文件大小、压缩比检测
3. **资源耗尽**：循环引用
   - **防御**：最大深度限制、访问计数

#### 安全测试
```bash
# 路径遍历测试
mde create malicious/ -o test.mde  # 包含 ../../../ 路径
mde view test.mde                  # 应拒绝访问

# 解压炸弹测试
dd if=/dev/zero bs=1M count=100 | gzip > big.gz
mde create big.gz -o test.mde      # 应拒绝
```

---

## 方案对比总结

| 维度 | 方案一（ZIP） | 方案二（MDE-DC） |
|------|--------------|------------------|
| **无需解压查看** | ⚠️ 需 ZIP 库 | ✅ 自定义格式 |
| **实现复杂度** | ✅ 低（现成库） | ⚠️ 中等 |
| **性能** | ⚠️ 需遍历 ZIP | ✅ O(1) 随机访问 |
| **文件体积** | ✅ 优化 | ✅ 紧凑 |
| **兼容性** | ✅ 通用格式 | ⚠️ 专用格式 |
| **向后兼容** | ✅ 解压即可读 | ✅ 跳过头部即可读 |

---

## 推荐选择

**如果优先实现快速 MVP**：选择方案一（ZIP），使用现成的库，快速验证概念。

**如果优先用户体验和核心约束**：选择方案二（MDE-DC），虽然是专用格式，但真正满足"无需解压直接查看"的要求。

**折中方案**：Phase 1 使用 ZIP 验证需求，Phase 2 迁移到自定义格式（向后兼容）。