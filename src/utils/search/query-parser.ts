// 搜索查询类型
export type SearchType = 'all' | 'title' | 'website' | 'content';

// 解析后的搜索查询结构
export interface ParsedSearchQuery {
  type: SearchType;
  keyword: string;
}

// 解析搜索查询（支持 @title/@website/@content 前缀；空指令视为不过滤）
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmed = query.trim();
  
  if (!trimmed) {
    return { type: 'all', keyword: '' };
  }
  
  // 检查是否以 @ 开头
  if (trimmed.startsWith('@')) {
    const parts = trimmed.split(' ');
    const typePrefix = parts[0].substring(1); // 移除 @
    const keyword = parts.slice(1).join(' ').trim();
    
    // 验证类型是否有效
    const validTypes: SearchType[] = ['title', 'website', 'content'];
    if (validTypes.includes(typePrefix as SearchType)) {
      // 只有当有具体关键词时才返回特定类型搜索
      if (keyword) {
        return {
          type: typePrefix as SearchType,
          keyword
        };
      } else {
        // 仅有前缀没有关键词时，返回空搜索（不触发筛选）
        return {
          type: 'all',
          keyword: ''
        };
      }
    }
  }
  
  // 普通关键词搜索（全文搜索）
  return {
    type: 'all',
    keyword: trimmed
  };
}

// 根据搜索类型构建提示文案
export function buildSearchHint(type: SearchType): string {
  const hints: Record<SearchType, string> = {
    all: '搜索标题、网站或内容',
    title: '搜索标题',
    website: '搜索网站',
    content: '搜索内容'
  };
  return hints[type] || hints.all;
}
