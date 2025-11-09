/**
 * URL标准化工具
 * 用于URL匹配和索引构建
 */

/**
 * 标准化路径
 */
export function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

/**
 * 标准化查询参数
 */
export function normalizeSearch(search: string): string {
  if (!search || search === '?') {
    return '';
  }

  const params = new URLSearchParams(search);
  const entries = Array.from(params.entries());
  if (!entries.length) {
    return '';
  }

  entries.sort((a, b) => {
    if (a[0] === b[0]) {
      return a[1].localeCompare(b[1]);
    }
    return a[0].localeCompare(b[0]);
  });

  const serialized = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return serialized ? `?${serialized}` : '';
}

/**
 * 检查是否支持的协议
 */
export function isSupportedProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

/**
 * 创建索引键
 * 返回用于匹配的URL键数组（包含和不包含查询参数）
 */
export function createIndexKeys(url: string): string[] {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }

  if (!isSupportedProtocol(parsed.protocol)) {
    return [];
  }

  const basePath = normalizePath(parsed.pathname);
  const baseKey = `${parsed.origin}${basePath}`;
  const keys: string[] = [baseKey];

  const normalizedSearch = normalizeSearch(parsed.search);
  if (normalizedSearch) {
    keys.unshift(`${baseKey}${normalizedSearch}`);
  }

  return keys;
}
