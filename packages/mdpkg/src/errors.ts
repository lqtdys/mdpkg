// 错误码表（对应规范附录 A）
export const E = {
  E101: 'MDPKG-E101', // 不是有效 ZIP
  E102: 'MDPKG-E102', // 缺少 manifest.json
  E201: 'MDPKG-E201', // 路径冲突（归一化或大小写后重复）
  E202: 'MDPKG-E202', // 非法路径
  E203: 'MDPKG-E203', // 非 UTF-8 或含 BOM
  E204: 'MDPKG-E204', // 路径超长
  E301: 'MDPKG-E301', // 无法确定入口
  E302: 'MDPKG-E302', // manifest 不符合 Schema
  E303: 'MDPKG-E303', // entrypoint 不存在或非 Markdown
  E304: 'MDPKG-E304', // resources 未覆盖包内全部文件
  E401: 'MDPKG-E401', // 引用的本地资源缺失
  E402: 'MDPKG-E402', // size 不符
  E403: 'MDPKG-E403', // sha256 不符（完整性问题，非篡改证据）
  E404: 'MDPKG-E404', // 孤儿资源（warning）
  E501: 'MDPKG-E501', // include 目标在包外
  E502: 'MDPKG-E502', // include 目标为 URL 或外部包
  E503: 'MDPKG-E503', // include 目标非 Markdown
  E504: 'MDPKG-E504', // include 深度超限（默认 32）
  E505: 'MDPKG-E505', // 展开后字节超限（默认 10MB）
  E506: 'MDPKG-E506', // include 次数超限（默认 1000）
  E507: 'MDPKG-E507', // 循环包含
  E508: 'MDPKG-E508', // include 目标不存在
  E601: 'MDPKG-E601', // 符号链接 / 硬链接
  E602: 'MDPKG-E602', // 资源总数超限
  E603: 'MDPKG-E603', // 单文件解压超限
  E604: 'MDPKG-E604', // 总解压超限
  E605: 'MDPKG-E605', // 压缩比异常（疑似 ZIP 炸弹）
  E701: 'MDPKG-E701', // spec_version 主版本不支持
  E702: 'MDPKG-E702', // extensions_required 含不支持项
} as const;

export type ErrorCode = (typeof E)[keyof typeof E];

export class MdeError extends Error {
  code: ErrorCode; // 不用参数属性：Node 的类型剥离不支持（需 erasable syntax）
  constructor(code: ErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.code = code;
  }
}

export const EXIT = { OK: 0, VALIDATION: 1, USAGE: 2, INTERNAL: 3 } as const;
