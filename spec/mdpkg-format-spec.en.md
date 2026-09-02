# mdpkg Format Specification v1.0 (Draft)

> Status: **Phase 0A Draft**. This document is the executable expansion of `PLAN_MERGED.md`; where it conflicts with `PLAN_MERGED.md`, this document takes precedence and `PLAN_MERGED.md` should be updated accordingly.
> Keywords are interpreted per RFC 2119: MUST / MUST NOT / SHOULD / SHOULD NOT / MAY.
> Specification text is CC BY 4.0; conformance fixtures (Appendix B) are CC0.

---

## 1. Scope and Terminology

**mdpkg** (Markdown Enhanced) is a Markdown document package format that uses a standard ZIP archive as its container and `manifest.json` as its metadata source, designed for **single-file delivery**: a single `.mdpkg` file contains the main document, all referenced resources, and any includable sub-documents.

v1 provides three capabilities: resource bundling (P0), symbol expansion (P1), and in-package file inclusion (P2).

| Term              | Definition                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| package           | A `.mdpkg` file, i.e., a ZIP archive conforming to this specification                                  |
| package root      | The logical root directory within the ZIP; all in-package paths are resolved relative to it            |
| entrypoint        | The in-package path of the main Markdown document; `manifest.entrypoint` is the single source of truth |
| resource          | Any file within the package other than `manifest.json`, including the entrypoint document itself       |
| reference closure | The set of all local references reachable from the entrypoint after include expansion                  |
| expansion         | The textual state after an include directive has been replaced by its target file's content            |

**Precise meaning of "single file":** Only one file is delivered and transmitted. It does **not** mean Markdown content is embedded as Base64, nor does it mean opening `.mdpkg` in a plain text editor yields a complete rendering.

---

## 2. Container Format

### 2.1 Basic Constraints

1. A package MUST be a valid ZIP archive (APPNOTE.TXT 6.3.x compatible).
2. The package root MUST directly contain `manifest.json`.
3. A package MUST NOT contain absolute paths other than directory entries, `..` segments, symbolic links, or hard-link entries.
4. A package MUST NOT contain two paths that normalize to the same value.
5. All text (Markdown / JSON / include source files / text attachments) MUST be UTF-8, MUST NOT contain a BOM, and MUST NOT contain U+0000.
6. Path separators MUST uniformly be `/`.

### 2.2 Identification

A file is an mdpkg package if and only if all of the following hold:

- Its extension is `.mdpkg` (case-insensitive); and
- It is a valid ZIP; and
- The package root contains `manifest.json`; and
- `manifest.json` can be parsed as a JSON object, the `format` field equals the string `"mdpkg"`, and `spec_version` exists with a major version supported by the implementation.

If any condition fails → the implementation MUST treat it as a "plain ZIP", MUST NOT force mdpkg handling, and MUST NOT attempt guesswork repair.

### 2.3 Compression Strategy

| Content                                                                     | Method                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------ |
| Markdown / JSON / plain text                                                | DEFLATE (level 9)                                      |
| PNG / JPEG / GIF / WebP / audio & video / PDF / already-compressed archives | Store (no compression)                                 |
| Other                                                                       | The implementation MAY decide; SHOULD default to Store |

Rationale: Re-compressing already-compressed media yields no benefit and wastes CPU.

### 2.4 Reproducible Builds (MUST)

Packing the same input directory twice MUST produce **byte-identical** packages. To achieve this:

1. ZIP entry order MUST follow the **Unicode code point ascending order** of in-package paths (`manifest.json` sorts first).
   - Measured (fflate): entry order is entirely determined by the caller's insertion order; the library does not auto-sort. **Scrambling insertion order produces different bytes**. The implementation MUST sort entries before insertion.
2. All entry timestamps MUST be `1980-01-01 00:00:00` (the earliest time representable in ZIP). Measured: `unzip -l` correctly displays `01-01-1980`.
3. Regular file permission bits MUST be `0644`; directories MUST be `0755`.
4. The implementation MUST NOT write the local machine's absolute path, UID/GID, extended attributes, or comment fields.
5. Generation time MUST NOT enter `manifest.json`.
6. The implementation MAY provide `--preserve-mtime`; when enabled, this entire clause is void, and the implementation MUST output a message indicating "reproducible build abandoned".

> This clause guarantees "same input → same bytes", for caching, signing, and accidental-modification detection. It does **not** make ZIP produce readable diffs in Git; for version-to-version comparison, use `mdpkg diff` (§8.7).

---

## 3. Directory Layout

```text
example.mdpkg
├── manifest.json        # required
├── document.md          # entrypoint, default name; actual path per manifest.entrypoint
├── assets/              # convention, not mandatory
│   ├── images/
│   └── files/
└── includes/            # convention, not mandatory
```

The specification mandates only the existence and location of `manifest.json`. Other directory layouts are conventions; the implementation MUST NOT rely on convention layouts for any judgment and MUST always use `manifest.entrypoint` and actual paths.

---

## 4. `manifest.json`

### 4.1 Fields

```json
{
  "format": "mdpkg",
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

| Field                    | Type     | Required | Description                                                                                                                     |
| ------------------------ | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `format`                 | string   | ✅       | Format identifier, always `"mdpkg"`                                                                                             |
| `spec_version`           | string   | ✅       | `"<major>.<minor>"`; this specification is `"1.0"`                                                                              |
| `entrypoint`             | string   | ❌       | In-package path of the entrypoint document; defaults to `"document.md"` when omitted                                            |
| `encoding`               | string   | ❌       | Always `"utf-8"`; same when omitted                                                                                             |
| `extensions`             | object   | ❌       | Author intent: `symbols` ∈ `off\|core\|extended` (default `core`), `include` ∈ `true\|false` (default `true`)                   |
| `extensions_required`    | string[] | ❌       | Hard dependency list; if the renderer does not support any listed item, it MUST error and exit; silent degradation is forbidden |
| `resources`              | array    | ✅       | Resource index, see below                                                                                                       |
| `resources[].path`       | string   | ✅       | In-package relative path, NFC-normalized                                                                                        |
| `resources[].media_type` | string   | ✅       | IANA media type; use `application/octet-stream` for unknown types                                                               |
| `resources[].size`       | integer  | ✅       | Uncompressed byte count                                                                                                         |
| `resources[].sha256`     | string   | ✅       | Lowercase 64-character hex                                                                                                      |
| `resources[].source_url` | string   | ❌       | Present only when the resource was downloaded from an external URL                                                              |

`resources` MUST cover **all** files in the package other than `manifest.json`, **including the entrypoint document itself**.
`resources` order MUST follow `path` code point ascending order.

### 4.2 Field Ownership (Key Rule for the Edit–Repack Cycle)

When a user unpacks → edits → repacks, `mdpkg pack` MUST handle fields per the table below:

| Field                                                         | Ownership         | Repack Behavior                                            |
| ------------------------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `resources[]`, `size`, `sha256`, `media_type`                 | Machine fact      | **Recomputed each time**, overwriting prior values         |
| `entrypoint`, `extensions`, `extensions_required`, `encoding` | Author intent     | **Preserved if present**; defaults apply only when missing |
| `spec_version`                                                | Tool version      | Decided by the tool; **not inherited**                     |
| `resources[].source_url`                                      | Historical origin | Preserved                                                  |

Rationale: Conflating the two categories of fields will either overwrite author configuration on repack or let stale hashes persist indefinitely.

---

## 5. Path and Encoding Rules

1. Paths MUST NOT start with `/`, MUST NOT contain `.` or `..` segments, MUST NOT contain empty segments (`//`), MUST NOT contain U+0000, and MUST NOT contain Windows drive letters or reserved device names.
2. Paths and filenames MUST be unified to **Unicode NFC** normalization before insertion.
3. Two paths that are identical after normalization (including those differing only in case) MUST be rejected at pack time (error code `MDPKG-E201`).
   - Rationale: The same logical filename has different bytes on macOS (APFS, NFD) vs. Linux (NFC). Without normalization, manifest SHA-256 values mismatch across platforms and `validate` produces false positives.
4. Path length MUST NOT exceed 1024 bytes (UTF-8).
5. The implementation MUST reject symbolic-link and hard-link entries (`MDPKG-E601`).

---

## 6. Resource References and Packing

### 6.1 In-Document References

Documents MUST use **in-package relative paths** to reference resources:

```markdown
![Product screenshot](assets/images/product.png)
```

The implementation MUST NOT require or generate an `mdpkg://` protocol. Rationale: After unpack/export, the result must still be standard Markdown; `mdpkg://` would break the graceful degradation path.

External URLs (`http://`, `https://`, protocol-relative `//`) are **kept as external links** by default and are not downloaded.

### 6.2 `mdpkg pack` Behavior

```
mdpkg pack <dir> [-o out.mdpkg] [--entry <path>] [--referenced-only] [--fetch] [--preserve-mtime]
```

1. Entrypoint: specified by `--entry`; otherwise `dir/document.md`; otherwise, if `dir/manifest.json` exists, inherit its `entrypoint`. If all three are absent → `MDPKG-E301`.
2. **Default behavior: pack all files in `dir`** (excluding the output file itself).
   - Rationale: Full-pack code is an order of magnitude smaller than "precise scanning" and never misses images; orphan resources are only a cost in size, while missing images is a correctness defect. The two risks are asymmetric.
3. `--referenced-only`: pack only the reference closure (entrypoint + all local references reachable after transitive include expansion of the entrypoint) + entrypoint + `manifest.json`.
4. **Reference validation (executed in both modes):** traverse the include closure starting from the entrypoint and collect all local references. Any referenced local file not present in the set to be packed → **error and exit** (`MDPKG-E401`); silent skipping is forbidden.
   - **What counts as a "reference":** Images and embedded attachments (pdf / zip, etc.) are resources that must be bundled; **links to local Markdown files are inter-document navigation, not attachments, and are not forced to be packed**—otherwise packing one README would pull in the entire repository.
   - **Collection MUST be based on the Markdown AST; scanning the full text with regex is forbidden:** Documents frequently contain **example code blocks** with Markdown syntax (e.g., a tutorial's `![fig](assets/a.png)`). Regex treats examples as real references and falsely reports `MDPKG-E401`. With AST, only `image` / `link` node URLs count as references; code blocks and inline code are naturally excluded—this shares the same "exclusion zone" logic as symbol expansion.
   - Measured (dogfood): when packing the project's own README, the regex implementation produced two false positives (first the example's `assets/a.png`, then the real link `spec/mdpkg-format-spec.md`); after switching to AST, it passed on the first try.
   - This step MUST traverse the transitive include closure; scanning only the entrypoint document misses images in included sub-documents, directly violating P0's "attachments must not be lost" guarantee.
5. **Orphan resources** (in the package but not referenced by any document) → warning, not an error.
6. `--fetch`: explicitly download external links and rewrite them to in-package relative paths, recording the origin in `resources[].source_url`. Off by default.
   - **Reference implementation v1 does not provide this switch:** downloading external links introduces network dependencies, timeout/retry, and an SSRF surface (internal addresses, redirects to `169.254.169.254`, etc.), conflicting with v1's "no download, predictable" stance. External links are kept as-is; `validate` counts them and reports "this package contains N external references and cannot be fully offline". If provided in the future, it MUST include a protocol whitelist (http/https only), redirect limit, size limit, and internal-address rejection.

---

## 7. Extension Syntax

### 7.1 Symbol Expansion

1. **Positioning:** A render-time transformation, applied to plain text nodes; it does **not** modify the original Markdown in the package. Configurable, default `core`.
2. **Core profile mapping table (the only mandatory set in v1):**

   | Input  | Output | Input  | Output |
   | ------ | ------ | ------ | ------ |
   | `(tm)` | ™      | `-->`  | →      |
   | `(c)`  | ©      | `<--`  | ←      |
   | `(r)`  | ®      | `<-->` | ↔      |
   | `+/-`  | ±      | `<=`   | ≤      |
   | `=/=`  | ≠      | `>=`   | ≥      |

3. **Extended profile:** Out of scope for v1. Includes `...`→`…`, `1/2`→`½`, and other fraction/typography symbols—these carry high risk of false positives against paths, commands, version numbers, and ellipses, and require more boundary data before they can be finalized. The mapping table references PyMdown Extensions (MIT); when adopted, its copyright notice MUST be retained.
4. **Exclusion zones (MUST NOT transform):** code blocks, inline code, link and image destination URLs, HTML attributes, raw HTML blocks, autolinks.

   Implementation hint: traversing `text` nodes on mdast naturally satisfies the above—code / inlineCode / link.url / html are not `text` nodes, so no custom tokenizer is needed.

5. **Word boundary rule (MUST):** transformation occurs only when the matched sequence is **preceded by** a line start / whitespace / Chinese punctuation, and **followed by** a line end / whitespace / Chinese punctuation; otherwise the original text is preserved.
   - Example: `a<=b` is not transformed (preceded by `a`); `步骤 1 --> 步骤 2` is transformed.
   - Chinese punctuation set: `，。、；：！？（）【】《》「」『』—…·`
6. **Escape (MUST, implementation approach verified by M0 probe):** `\` prefix escape. `\(tm)` means a literal `(tm)`.

   > **Implementation trap (measured):** Do not implement in the order "Markdown parser consumes backslashes first, then symbol converter handles the remainder." During Markdown parsing, `\(` is consumed as a valid escape, leaving only `(tm)` in the text node. **The converter cannot distinguish "user wrote `\(tm)` to keep literal" from "user wrote `(tm)` to convert."** Measured: under this ordering, `\(tm)` is incorrectly converted to `™`.

7. **MUST use the sentinel approach** (measured, viable):
   1. Before parsing, replace `\` + symbol sequences in the source with a private-use sentinel (`U+E000`) + symbol.
   2. Perform normal parsing and symbol conversion (the sentinel is a character Markdown does not parse, and it does not satisfy the word boundary "preceded by" condition, so the following symbol is not converted).
   3. After conversion, **delete the sentinels**, restoring the literal symbols.

   Cost is roughly 3 lines, with no source offset mapping and no sensitivity to entity references / multi-byte characters. Optional alternative (not adopted): remove the `\` escape syntax and use inline code `` `(tm)` `` as the literal-preservation mechanism—zero implementation cost, but sacrifices the ability to keep literal text in plain text without rendering it as code.

### 7.2 File Inclusion

1. **Syntax:**

   ```markdown
   <<< includes/chapter-1.md
   <<< "includes/a b.md"
   ```

2. **Trigger rule (MUST):** The directive triggers only when it is at **column 0** (no leading indentation) and the entire line matches the regex `^<<<\s*(.+?)\s*$`.

   > The specification does **not** require code-block context awareness. Rationale: correctly determining code-block status requires the preprocessor to implement fence scanning (` ``` ` / `~~~` / unequal-length fences / 4-space indentation / nested in lists), which is impossible at the "pre-parse expansion" stage and would inevitably cause implementation divergence.
   > **Known limitation:** A line inside a column-0 fenced code block that matches the above pattern will be expanded. This is known and accepted behavior; the specification does not fix it. Directives indented by ≥1 space or written inside code block content naturally do not trigger.

3. **Path resolution:** Paths are resolved relative to the **package root** and, after normalization, MUST fall within the package root. Access to files outside the package, URLs, or other `.mdpkg` packages is forbidden (`MDPKG-E501` / `MDPKG-E502`).
4. **Target type:** Only in-package Markdown files. Non-Markdown targets → `MDPKG-E503`.
5. **Relative base and URL rewriting (MUST, the key rule that eliminates implementation divergence):**
   A **relative** image/resource reference `R` in an included file `P` (in-package path) MUST be rewritten as plain text to `normalize(dirname(P) + "/" + R)` at expansion time.

   - Example: `img/fig.png` in `includes/chapter-1.md` → after expansion becomes `includes/img/fig.png`.
   - Absolute URLs, protocol-relative URLs, and `data:` URIs MUST NOT be rewritten.
   - **Example paths in code blocks and inline code MUST NOT be rewritten:** code fences frequently contain Markdown usage examples (e.g., a tutorial's `![fig](img/demo.png)`). Rewriting them would alter user-visible content. The implementation MUST track fence state (` ``` ` / `~~~`) to skip lines inside code blocks—**this rule constrains only URL rewriting** and is separate from the above "include directives trigger only at column 0 and do not perceive code blocks"; the latter remains unchanged.
     - This shares the same principle as §6.2 reference collection: **any text-level processing of Markdown MUST exclude code blocks and inline code** (reference collection uses AST; rewriting uses fence tracking). Each has produced a defect in practice.
   - Rewriting occurs at the **expansion stage** (text layer), making the expanded text self-consistent; `render` and `export --expanded` share the same intermediate product, and the renderer no longer needs to carry "current file context".

6. **Nesting:** Nested inclusion is allowed; the same pipeline (expansion → parsing → symbol conversion) is applied recursively layer by layer, with depth counted toward the limit.
7. **Hard limits (MUST; defaults must exist):**

   | Limit                                | Default | Error Code   |
   | ------------------------------------ | ------- | ------------ |
   | Maximum depth                        | 32      | `MDPKG-E504` |
   | Expanded size per document           | 10 MB   | `MDPKG-E505` |
   | Total include directives per package | 1000    | `MDPKG-E506` |

8. **Cycle detection (MUST):** Maintain an expansion stack; if the same file appears in the stack more than once, report `MDPKG-E507`.
9. **Error location (SHOULD):** The implementation SHOULD maintain an "expanded line number → (source file, original line number)" mapping so that errors carry their original origin.

---

## 8. Processing Pipeline and CLI

### 8.1 Rendering Pipeline (Fixed Order, MUST)

```text
1. Read and unpack ZIP
2. Validate manifest (Schema + resource size/sha256)
3. Pre-process: include expansion (cycle/depth/size limits + relative URL rewriting)
4. Parse: Markdown → AST
5. Symbol conversion: applied only to text nodes (word boundary + escape)
6. Render: AST → HTML (safe sanitization)
7. Output
```

### 8.2 HTML Safety (MUST)

1. Output MUST undergo HTML sanitization (stripping `script` / `on*` event attributes / `javascript:` URLs).
2. **SVGs MUST be rendered via `<img>` reference and MUST NOT be inserted into the HTML DOM.**
   - Clarification: `<img src="data:image/svg+xml;base64,...">` **is an `<img>` reference**; the SVG inside does not execute scripts, so `render --inline` can safely use data URIs for SVGs.
   - "Inline" specifically means inserting SVG nodes into the HTML DOM tree—this behavior is forbidden in v1, and no explicit switch is provided.
3. External-URL images MUST carry `referrerpolicy="no-referrer"`.
4. Raw HTML inline in the document MUST be sanitized; sanitization behavior MUST be auditable (record the count of removed node types by type).

### 8.3 Boundary of Integrity Checking (MUST Be Stated in the Spec)

The SHA-256 recorded in `manifest.json` is used to detect **non-malicious integrity issues**: transfer corruption, misdelivery, post-unpack modification by external programs, and cross-platform NFC/NFD byte drift.

**It does not provide tamper-resistance.** The manifest and the resources it validates reside in the same ZIP; anyone who can rewrite the package can also update the hashes, and validation will still pass. Tamper-resistance requires a signing mechanism (signatures or digest anchors located outside the package), which **v1 does not provide**.

The implementation MUST NOT describe a passing validation as "not tampered / trusted / source-verified" in its output.

### 8.4 Unpack Safety (MUST)

The implementation MUST enforce the following limits during unpack/read, and defaults must exist (overridable by parameters):

| Limit                       | Default | Error Code   |
| --------------------------- | ------- | ------------ |
| Total resource count        | 10,000  | `MDPKG-E602` |
| Uncompressed bytes per file | 200 MB  | `MDPKG-E603` |
| Total uncompressed bytes    | 1 GB    | `MDPKG-E604` |
| Compression ratio per entry | 1000:1  | `MDPKG-E605` |

Detection MUST stream-count during decompression; it MUST NOT fully decompress first and then measure (otherwise ZIP bomb protection fails). Determination requires only reading the entry's central directory header; **once the limit is reached, the decompression stream for that entry is not started**—measured: a 120 MB bomb (120 KB compressed) rejected by header-only read takes 0 ms; full decompression takes 156 ms and nothing is written to disk.

> **Implementation trap (measured, fflate):** The `size` exposed in `Unzip` callbacks is the **compressed** size; `originalSize` is the uncompressed size; `compressedSize` is `undefined`. Misusing `size` for limit checks **completely disables** bomb protection. Also: the file callback for `Unzip` MUST be passed to the **constructor** `new Unzip(cb)`; `register()` is only for registering codecs; otherwise it throws `no stream handler`.

### 8.5 Version Negotiation

- Major version differs → MUST reject and error (`MDPKG-E701`).
- Minor version higher → process known v1 fields, ignore unknown fields (MUST NOT error on unknown fields).
- `extensions_required` contains an item the implementation does not support → MUST error and exit (`MDPKG-E702`); silent degradation is forbidden.

### 8.6 Command Contract

| Command                                | Description                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mdpkg pack <dir> -o out.mdpkg`        | §6.2                                                                                                                                                         |
| `mdpkg unpack <pkg> -o dir`            | Restore to directory; enforce §8.4 limits                                                                                                                    |
| `mdpkg list <pkg>`                     | List `resources[]` (path / media_type / size)                                                                                                                |
| `mdpkg validate <pkg>`                 | Schema + size + sha256 + path rules + limit items; count external links and report "this package contains N external references and cannot be fully offline" |
| `mdpkg render <pkg>`                   | See §8.7                                                                                                                                                     |
| `mdpkg export --raw <pkg> -o dir`      | Output a **directory**, preserving in-package structure, text unchanged                                                                                      |
| `mdpkg export --expanded <pkg> -o dir` | Output a **directory**, including expanded Markdown (include expanded, relative URLs rewritten per §7.2) + all resources                                     |
| `mdpkg diff <a> <b>`                   | Unpack both sides to temp directories, then `diff -ruN`                                                                                                      |

> `--raw` MUST output a directory, not a single file: in unexpanded documents, include directives and relative paths are meaningless at other levels; outputting to a single file would inevitably corrupt them. The output of `--expanded` can be opened by any standard Markdown tool.

### 8.7 `mdpkg render` Output Modes

```
mdpkg render <pkg> [-o out.html] [--inline | --dir] [--max-inline-bytes N]
```

- **Default `--inline`:** resources are inlined as data URIs, producing a **single self-contained HTML file**, matching the "AI-generated document delivery" positioning.
- When total resource bytes exceed `--max-inline-bytes` (default 50 MB), MUST automatically degrade to `--dir` and print a notice to stderr.
- When `--inline` or `--dir` is explicitly specified, the threshold is ignored.
- `--dir`: unpack resources to a sibling directory next to the output HTML; the HTML references them with relative paths.

---

## 9. Compatibility (Three Layers)

| Layer                   | Commitment                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Container compatibility | `.mdpkg` is a standard ZIP; `unzip -l` / `unzip -p` can list and extract                                                  |
| Document compatibility  | In-package Markdown is standard Markdown + relative paths; symbols keep their source text; `<<<` degrades to visible text |
| Export compatibility    | Output from `export --raw` / `--expanded` can be opened by any standard Markdown tool                                     |

**Not committed:** Opening `.mdpkg` directly in a plain text editor yields a complete rendering.

---

## Appendix A: Error Code Reference

| Code                        | Meaning                                                                   | Trigger                          |
| --------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| **1xx Container**           |                                                                           |                                  |
| `MDPKG-E101`                | Not a valid ZIP                                                           | Open phase                       |
| `MDPKG-E102`                | Missing `manifest.json`                                                   | Identification phase             |
| `MDPKG-E103`                | Identification failed; treated as plain ZIP                               | Not an error, informational only |
| **2xx Path / Encoding**     |                                                                           |                                  |
| `MDPKG-E201`                | Path conflict (duplicate after normalization or case-folding)             | pack                             |
| `MDPKG-E202`                | Illegal path (`..` / absolute / empty segment / NUL / drive letter)       | pack / unpack                    |
| `MDPKG-E203`                | Non-UTF-8 text or contains BOM                                            | pack                             |
| `MDPKG-E204`                | Path too long (> 1024 bytes)                                              | pack                             |
| **3xx Manifest**            |                                                                           |                                  |
| `MDPKG-E301`                | Cannot determine entrypoint document                                      | pack                             |
| `MDPKG-E302`                | manifest does not conform to Schema                                       | validate                         |
| `MDPKG-E303`                | `entrypoint` points to a non-existent or non-Markdown file                | validate                         |
| `MDPKG-E304`                | `resources` does not cover all files in the package                       | validate                         |
| **4xx Resource**            |                                                                           |                                  |
| `MDPKG-E401`                | Referenced local resource missing                                         | pack                             |
| `MDPKG-E402`                | Resource size mismatch                                                    | validate                         |
| `MDPKG-E403`                | Resource sha256 mismatch (**integrity issue, not evidence of tampering**) | validate                         |
| `MDPKG-E404`                | Orphan resource (warning, not an error)                                   | pack                             |
| **5xx Include**             |                                                                           |                                  |
| `MDPKG-E501`                | include target outside package                                            | render / export                  |
| `MDPKG-E502`                | include target is a URL or external package                               | render / export                  |
| `MDPKG-E503`                | include target is not Markdown                                            | render / export                  |
| `MDPKG-E504`                | Depth limit exceeded (default 32)                                         | render / export                  |
| `MDPKG-E505`                | Expanded byte limit exceeded (default 10 MB)                              | render / export                  |
| `MDPKG-E506`                | Include count limit exceeded (default 1000)                               | render / export                  |
| `MDPKG-E507`                | Cyclic inclusion detected                                                 | render / export                  |
| `MDPKG-E508`                | include target does not exist                                             | render / export                  |
| **6xx Safety / Limits**     |                                                                           |                                  |
| `MDPKG-E601`                | Symbolic-link / hard-link entry                                           | pack / unpack                    |
| `MDPKG-E602`                | Total resource count limit exceeded                                       | unpack                           |
| `MDPKG-E603`                | Uncompressed byte limit per file exceeded                                 | unpack                           |
| `MDPKG-E604`                | Total uncompressed byte limit exceeded                                    | unpack                           |
| `MDPKG-E605`                | Abnormal compression ratio (suspected ZIP bomb)                           | unpack                           |
| **7xx Extension / Version** |                                                                           |                                  |
| `MDPKG-E701`                | spec_version major version unsupported                                    | Any read operation               |
| `MDPKG-E702`                | `extensions_required` contains unsupported item                           | render                           |
| `MDPKG-E703`                | Unknown extension field (warning, ignored)                                | validate                         |

Exit codes: `0` success; `1` validation / business error (accompanied by an error code from the table above); `2` usage error; `3` internal error.

---

## Appendix B: Conformance Fixtures

### B.1 Why It Is a Core Phase 0 Deliverable

Verifying that "two independent implementations produce semantically equivalent packages from the specification alone" cannot be done by reading the document; it requires an executable, implementation-agnostic set of vectors. Fixtures are the executable form of the specification. **Writing fixtures before the specification is far faster than the reverse**—fixtures actively force out every ambiguity in the spec.

### B.2 Directory and Format

```text
spec/fixtures/<case-id>/
├── case.json        # case definition
├── input/           # input directory, or input.mdpkg
└── expected/        # expected output (manifest / html / unpacked tree)
```

`case.json`:

```json
{
  "id": "pack-basic",
  "title": "Minimal package: 1 image + 1-level include + core symbols",
  "kind": "pack",
  "args": ["pack", "input/", "-o", "out.mdpkg"],
  "expect": {
    "exitCode": 0,
    "errorCode": null,
    "manifest": "expected/manifest.json",
    "tree": "expected/tree.txt"
  }
}
```

| Field                   | Description                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `kind`                  | `pack` / `unpack` / `list` / `validate` / `render` / `export` / `diff`                   |
| `expect.exitCode`       | Expected exit code                                                                       |
| `expect.errorCode`      | Expected error code (mandatory for negative cases)                                       |
| `expect.manifest`       | Expected manifest path (field-by-field comparison; `resources[].sha256` always compared) |
| `expect.tree`           | Expected unpacked directory tree (paths + sizes)                                         |
| `expect.html`           | Expected HTML path (`render` cases; compare normalized DOM)                              |
| `expect.stderrContains` | Substring expected in stderr                                                             |

`pack` cases MUST additionally assert **reproducibility**: packing the same input twice produces byte-identical output.

### B.3 Case Inventory (Phase 0B target ≥ 30)

> **Implementation status (2026-08-30): 43 cases implemented** (the target list below is fully covered), located at `spec/fixtures/<id>/`, driven by `packages/mdpkg/test/fixtures.test.ts`, all passing (**full suite 79/79**, including 36 implementation unit tests).
>
> Actual `case.json` fields (difference from B.2: assertions are inline; only large outputs go in `expected/`):
> `id` / `title` / `kind` (`pack`|`validate`|`render`|`expand`|`path`) / `input` (default `input/`) / `entry` / `args` (passed to `render`) / `tamper` (tamper manifest to test integrity: `{ resource, sha256, size }`) / `expect` (`errorCode`|`tree`|`manifest`|`htmlContains`|`htmlNotContains`|`textContains`|`pathInput`).
>
> Differences from the target list below and reasons:
>
> - **Cases not in fixtures** (constrained by execution environment; covered by implementation unit tests instead): ① case-conflict and NFC/NFD same-name conflicts—macOS APFS is insensitive to both case and Unicode normalization, so these inputs overwrite each other on the filesystem and cannot be created at all; covered by `container.test.ts` using an in-memory Map; ② ZIP bombs—require embedding a 12 MB file in the case and an unpack channel; covered by `container.test.ts`.
> - Six driver channels: `pack` / `validate` / `render` / `expand` / `export` / `unpack` (plus `path`, which does not depend on a file tree). `unpack-roundtrip` asserts that after pack→unpack, every file is byte-identical except `manifest.json` (tool-generated).
> - **Reproducibility is not a separate case**: the driver automatically attaches a "two packs are byte-identical" assertion to all `pack` cases.

**Positive (8)**

1. `pack-basic` — 1 image + 1-level include + core symbols (minimal example package, also the documentation example)
2. `pack-reproducible` — same input packed twice produces byte-identical output
3. `pack-unicode-path` — Chinese filenames, Unicode filenames, NFD input
4. `unpack-roundtrip` — pack → unpack → byte-identical to original directory
5. `render-symbols` — plain text replacement; code / inline code / URL / HTML attributes / escaped not replaced
6. `render-include-nested` — multi-level include and relative image path rewriting in nested files
7. `export-raw` / `export-expanded` — both export modes produce output openable by standard tools
8. `validate-clean` — clean package passes all checks

**Symbol boundaries (4)** 9. `symbols-word-boundary` — `a<=b`, `v1.2-->v2`, `...`, mixed CJK/Latin not falsely triggered 10. `symbols-escape` — `\(tm)` keeps literal 11. `symbols-profile-off` — `extensions.symbols: "off"` disables all conversion 12. `symbols-cjk-punct` — correct conversion around Chinese punctuation

**Include (7)** 13. `include-single` / `include-multi-level` / `include-cycle` / `include-duplicate` 14. `include-missing` / `include-outside-root` / `include-non-markdown` 15. `include-quoted-path` — path with spaces `"includes/a b.md"` 16. `include-indented-not-triggered` — 1-space indent does not trigger 17. `include-depth-limit` / `include-size-limit` / `include-count-limit` 18. `include-url-rewrite` — relative image path rewriting in nested files is correct (including same name in different directories)

**Safety (8)** 19. `sec-path-traversal` / `sec-absolute-path` / `sec-windows-drive` 20. `sec-symlink` / `sec-duplicate-entry` 21. `sec-zip-bomb-ratio` / `sec-total-size-limit` / `sec-entry-count-limit` 22. `sec-malicious-svg` — SVG not inserted into DOM 23. `sec-html-injection` — inline HTML sanitized 24. `sec-sha-mismatch` — hash mismatch reports `MDPKG-E403` and message does not contain "tampering" 25. `sec-external-url` — external links preserved + `referrerpolicy`

**Path / Encoding (3)** 26. `path-nfd-conflict` — NFD/NFC same-name conflict rejected 27. `path-case-conflict` — case-only-different paths rejected 28. `encoding-non-utf8` — non-UTF-8 rejected

**Version / Extension (3)** 29. `version-major-mismatch` — reports `MDPKG-E701` 30. `ext-required-unsupported` — reports `MDPKG-E702`, no silent degradation 31. `ext-unknown-ignored` — unknown field ignored with warning

**Interoperability (2)** 32. `interop-unzip` — `unzip -l` / `unzip -p` can list and extract 33. `interop-renderer` — exported Markdown openable by third-party renderers

---

## Appendix C: JSON Schema (at `spec/schema/manifest-1.0.json`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://mdpkg.spec/schema/manifest-1.0.json",
  "title": "mdpkg manifest v1.0",
  "type": "object",
  "required": ["format", "spec_version", "resources"],
  "additionalProperties": false,
  "properties": {
    "format": { "const": "mdpkg" },
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

> The Schema does **not** express semantic constraints (path validity, NFC, reference closure, ordering). Semantic constraints are implemented by `validate` per §5–§7 and map to the error codes in Appendix A.
>
> Implementation note (M2 measured): `source_url` does **not** use `"format": "uri"`—ajv 8's draft 2020-12 entry point (`ajv/dist/2020.js`) does not include format by default and prints `unknown format "uri" ignored` to stderr, requiring an additional `ajv-formats` import. Adding a dependency for an optional URI format check is not worthwhile, so it is downgraded to a string constraint. Also note: ajv 8 ships with only draft-07/2019-09 by default; for 2020-12 you must `import Ajv2020 from 'ajv/dist/2020.js'` (ESM requires the `.js` extension; otherwise `ERR_MODULE_NOT_FOUND`).
