# md-bundle 集成指南：解包 → 编辑 → 重打包

> 本指南面向 md-bundle 等网页工具，说明如何调用 `mdpkg` 的浏览器端 API 完成 `.mdpkg` 的打开、编辑、保存闭环。

## 核心 API

```ts
import { openMdpkg, packMdpkg, type Manifest } from 'mdpkg/web/mdpkg-web.ts';
```

- `openMdpkg(bytes: Uint8Array)`：解包 `.mdpkg`，返回文件表、`manifest`、校验结果、渲染好的 HTML。
- `packMdpkg(files: Map<string, Uint8Array>, prevManifest?: Manifest)`：把编辑后的文件表重新打包成 `.mdpkg` 字节流。

## 最小闭环示例

```ts
import { openMdpkg, packMdpkg } from 'mdpkg/web/mdpkg-web.ts';

// 1. 打开用户上传的 .mdpkg
const file = await fetch('/demo.mdpkg').then((r) => r.arrayBuffer());
const result = await openMdpkg(new Uint8Array(file));

if (result.validation.ok === false) {
  // 校验失败仍可继续编辑，但应提示用户
  console.warn('校验未通过', result.validation.errors);
}

// 2. 编辑：直接替换 files Map 中的 Uint8Array
const entry = result.manifest?.entrypoint ?? 'document.md';
const oldText = new TextDecoder().decode(result.files.get(entry)!);
const newText = oldText.replace('(tm)', '(tm) — 已编辑');
result.files.set(entry, new TextEncoder().encode(newText));

// 3. 重打包
const outBytes = packMdpkg(result.files, result.manifest ?? undefined);

// 4. 触发浏览器下载
const blob = new Blob([outBytes], { type: 'application/octet-stream' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'edited.mdpkg';
a.click();
URL.revokeObjectURL(a.href);
```

## 推荐保存流程

1. **始终保留 `result.files` 这个 Map**，它是单文件包的内存真源。
2. **用户修改文本时**，把字符串用 `new TextEncoder().encode(text)` 转成 `Uint8Array` 写回 Map。
3. **用户替换图片/附件时**，把二进制内容作为 `Uint8Array` 写回 Map，并确保路径仍被 Markdown 引用。
4. **调用 `packMdpkg(files, result.manifest)`**：第二个参数传入原 `manifest`，用于保留 `entrypoint`、`extensions`、`extensions_required`、`encoding` 等作者意图字段。
5. **（可选）二次校验**：再次调用 `openMdpkg(outBytes)` 或 `validatePackage`，确认没有过期哈希或缺失资源。
6. **写回存储或触发下载**。

## 必须遵守的规则

### 不要直接修改 `manifest.json` 文本

`packMdpkg` 会主动删除 `files` 中的 `manifest.json`，并调用 `buildManifest` 重新生成：

- `resources[]`、`size`、`sha256`、`media_type`：每次重算。
- `entrypoint`、`extensions`、`extensions_required`、`encoding`：从 `prevManifest` 继承。
- `spec_version`：由工具决定，不继承。

如果你手动改了 `manifest.json` 的哈希但没有重算，保存后的包会在 `validate` 阶段报 `MDPKG-E402/E403`。

### `source_url` 按路径继承

`resources[].source_url` 表示「该资源曾经从哪个外链下载」。重打包时：

- **路径不变、内容改变**：`source_url` 会保留在同一路径上。
- **重命名文件**：原 `source_url` 会丢失。
- **新增文件**：没有 `source_url`。

### `files` Map 中必须全是 `Uint8Array`

不要放入字符串、Buffer 或其他类型。浏览器端没有 Node 的 `Buffer`，统一使用 `Uint8Array`。

### 孤儿资源只是告警

包内存在但未被引用的资源会在 `pack` 阶段报 `MDPKG-E404` 警告，不会中断保存。若希望精简体积，可在调用 `packMdpkg` 前自行从 Map 中删除这些文件。

### 相对路径引用保持原样

mdpkg v1 不使用 `mdpkg://` 协议。包内 Markdown 仍使用标准相对路径：

```markdown
![产品截图](assets/images/product.png)
```

编辑时若移动了资源文件，记得同步修改 Markdown 中的引用路径。

## 常见错误

| 现象 | 原因 | 处理 |
|---|---|---|
| 重打包后 `validate` 报 `MDPKG-E304` | `manifest.json` 被手动修改，`resources` 与实际文件对不上 | 不要手动改 manifest，让 `packMdpkg` 重建 |
| 报 `MDPKG-E401` | Markdown 引用了 Map 中不存在的资源 | 确保引用路径与 Map 键一致 |
| 报 `MDPKG-E402/E403` | 文件内容改了但 manifest 哈希没更新 | 使用 `packMdpkg`，它会重算哈希 |
| 下载的文件无法被 `openMdpkg` 识别 | 写入的不是 `Uint8Array` 或 MIME 类型不对 | 用 `Blob([uint8Array], { type: 'application/octet-stream' })` |

## 与 CLI 的关系

浏览器端 `packMdpkg` 与 Node CLI 的 `mdpkg pack` 共用同一套 ZIP 打包逻辑：

- 同样的条目排序（`manifest.json` 最前，其余按路径码位升序）。
- 同样的压缩策略（文本 DEFLATE，已压缩媒体 Store）。
- 同样的固定时间戳 `1980-01-01`，保证同输入同字节。

因此，在 md-bundle 中编辑保存的包，可以被 CLI 正常 `unpack / validate / render`。
