export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

export function formatDateForTable(isoString: string): string {
  const date = new Date(isoString);
  
  // 显示完整的年月日时分格式
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false // 使用24小时制
  });
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `clip-${Math.random().toString(36).slice(2, 10)}`;
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

export function isSupportedHttpUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
