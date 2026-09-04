# Changelog

## [0.1.0.0] - 2026-09-05

### Added

- **mdpkg-web 浏览器打包库**：`openMdpkg`（读）/ `packMdpkg`（写，重打包）/ `readEntrySource` 全链路在浏览器可跑，配合演示页 `demo.html` 与单文件演示 `imademo.mdpkg`。
- **zip-core 跨端核心层**：打包/解包/列表/路径规范化抽为浏览器与 Node 共用的零 Node 依赖模块（CLI 入口不变）。
- **编辑-重打包闭环**：`packMdpkg` 产出与 CLI `pack` 逐字节一致、可重复构建；新增 repack 往返测试。
- **限额与边界测试**：单文件 200MB 上限（E603）、空包检测（E101）、toBase64 跨分块边界一致性。

### Changed

- 资源哈希从 `node:crypto` 切换为 `js-sha256`（浏览器可用，输出字节不变）。
- `container.ts` 瘦身为 zip-core 的 re-export 层，既有 `import` 路径不受影响。
- 符号扩展、页面工具目录（.codex/.gemini/.opencode 等）与 QA 报告目录加入 `.gitignore`。

### Fixed

- **pack 拒绝非 Markdown 入口**（E303）：不再产出 validate 会拒绝的包（对齐 validate 语义）。
- **web 重打包与渲染统一入口守卫**：`packMdpkg` 与 `render` 与 CLI 同规则拒绝非 Markdown/缺失入口。
- **非法百分号转义不再崩溃**：`[下载](100%.pdf)` 类链接按字面引用处理，pack 不再以「内部错误」退出。
- **损坏 manifest 报 E302**：CLI render 路径对非法 JSON 给出规范错误码，而非裸 SyntaxError。

### Removed

- `node:crypto` 在 sha256 层的依赖（由 js-sha256 替代）。

---

**已知缺口**（见 issue #1）：`unpack` 对超过约 2100 条目的包存在 fflate 解析截断（静默丢内容），E602/E604 限额保护暂不可达；修复计划已登记。