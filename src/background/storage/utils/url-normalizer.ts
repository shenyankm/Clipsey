/** URL 标准化：用于 URL 匹配与索引构建。 */

/** 标准化路径：去除末尾斜杠并保留根路径。 */
export function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return '/';
  }

  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
}

/** 标准化查询参数：排序键值并序列化为稳定字符串。 */
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

/** 协议校验：仅支持 http/https。 */
export function isSupportedProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

/** 构建索引键：返回包含与不包含查询参数的 URL 键。 */
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
