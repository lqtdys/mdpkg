// 符号扩展：core profile + 词边界 + 哨兵法转义
// 实测（M0/S2）：排除区（code / inlineCode / link.url / html）无需自研——mdast 里它们不是 text 节点。
// 转义必须用哨兵法：Markdown 解析会把 \( 当合法转义消费掉，text 节点只剩 (tm)，无法区分用户意图。
import { visit } from 'unist-util-visit';

export const CORE: [string, string][] = [
  ['(tm)', '™'], ['(c)', '©'], ['(r)', '®'],
  ['-->', '→'], ['<--', '←'], ['<-->', '↔'],
  ['+/-', '±'], ['=/=', '≠'], ['<=', '≤'], ['>=', '≥'],
];

// 前邻/后邻必须是 行首|行尾|空白|中文标点，否则不转换（防误伤路径、命令、版本号）
const BOUNDARY = /[\s，。、；：！？（）【】《》「」『』—…·]/u;
const SENTINEL = '\uE000'; // 私有区：Markdown 不解析，且不满足词边界前邻条件

/** 解析前：把 \符号 换成 哨兵+符号，保护其不被转换 */
export function guardEscapes(md: string, table = CORE): string {
  return table.reduce((s, [from]) => s.split('\\' + from).join(SENTINEL + from), md);
}

/** 转换后：删除哨兵，还原字面符号 */
export function unguard(text: string): string {
  return text.split(SENTINEL).join('');
}

export function replaceSymbols(text: string, table = CORE): string {
  for (const [from, to] of table) {
    let out = '';
    let i = 0;
    while (i < text.length) {
      if (text.startsWith(from, i)) {
        const before = i === 0 || BOUNDARY.test(text[i - 1]);
        const after = i + from.length >= text.length || BOUNDARY.test(text[i + from.length]);
        if (before && after) { out += to; i += from.length; continue; }
      }
      out += text[i++];
    }
    text = out;
  }
  return text;
}

/** remark 插件：仅对 text 节点做符号转换，并还原哨兵 */
export function symbolsPlugin(options: { enabled?: boolean } = {}) {
  return (tree: unknown) => {
    if (options.enabled === false) return;
    visit(tree as never, 'text', (node: { value: string }) => {
      node.value = unguard(replaceSymbols(node.value));
    });
  };
}
