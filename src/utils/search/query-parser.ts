/**
 * 搜索查询类型
 */
export type SearchType = 'all' | 'title' | 'website' | 'content';

/**
 * 解析后的搜索查询结果
 */
export interface ParsedSearchQuery {
  type: SearchType;
  keyword: string;
}

/**
 * 解析搜索查询字符串
 * 支持指令前缀：@title、@website、@content
 * 当仅输入指令无关键词时，视为空搜索（不过滤）
 * 
 * @param query - 搜索查询字符串
 * @returns 解析后的查询对象
 * 
 * @example
 * parseSearchQuery('@title 测试')  // { type: 'title', keyword: '测试' }
 * parseSearchQuery('@website')     // { type: 'all', keyword: '' }
 * parseSearchQuery('关键词')        // { type: 'all', keyword: '关键词' }
 */
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

/**
 * 构建搜索提示文本
 * @param type - 搜索类型
 * @returns 搜索提示文本
 */
export function buildSearchHint(type: SearchType): string {
  const hints: Record<SearchType, string> = {
    all: '搜索标题、网站或内容',
    title: '搜索标题',
    website: '搜索网站',
    content: '搜索内容'
  };
  return hints[type] || hints.all;
}
