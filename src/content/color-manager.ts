/** 统一管理高亮颜色：通过 CSS 变量注入并提供内联/覆盖两种计算，默认采用舒适配色方案。 */
import type { HighlightColorScheme, SettingsOptions } from '@/utils/settings-local';
import type { MessageResponse } from '@/types/message';

// 预设的高亮颜色方案（类型从 utils 引入）

// 高亮配色方案定义
const COLOR_SCHEMES: Record<HighlightColorScheme, { hex: string; name: string }> = {
  amber: {
    hex: '#FFC107',
    name: '琥珀色' // Material Design Amber 500 - 经典高亮颜色
  },
  green: {
    hex: '#81C784',
    name: '青绿色' // Material Design Green 300 - 柔和护眼
  },
  blue: {
    hex: '#64B5F6',
    name: '天蓝色' // Material Design Blue 300 - 清新舒适
  }
};

// 默认配色方案
const DEFAULT_COLOR_SCHEME: HighlightColorScheme = 'amber';
const DEFAULT_INLINE_RGBA = 'rgba(255, 193, 7, 0.3)';
const DEFAULT_OVERLAY_RGBA = 'rgba(255, 193, 7, 0.2)';

// 当前使用的颜色(缓存)
let currentColorScheme: HighlightColorScheme = DEFAULT_COLOR_SCHEME; 

export const HIGHLIGHT_INLINE_CLASS = 'clipsey-inline-highlight';
export const HIGHLIGHT_OVERLAY_CLASS = 'clipsey-overlay-highlight';

let styleInjected = false;
let styleEl: HTMLStyleElement | null = null;

// 十六进制转 RGBA（非法输入回退至默认值）
function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex?.replace('#', '').trim();
  if (!normalized || !/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    return DEFAULT_INLINE_RGBA;
  }

  const full = normalized.length === 3
    ? normalized.split('').map(ch => ch + ch).join('')
    : normalized;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function ensureStyleInjected(inlineColor: string, overlayColor: string): void {
  try {
    // 首次注入样式规则（类选择器），CSS 变量使用 root 直接设置，便于动态更新
    if (!styleInjected) {
      styleEl = document.createElement('style');
      styleEl.type = 'text/css';
      styleEl.textContent = `
        .${HIGHLIGHT_INLINE_CLASS} {
          background-color: var(--clipsey-inline-highlight-color, ${DEFAULT_INLINE_RGBA});
          border-radius: 2px;
          padding: 0 1px;
        }
        .${HIGHLIGHT_OVERLAY_CLASS} {
          background-color: var(--clipsey-overlay-highlight-color, ${DEFAULT_OVERLAY_RGBA});
          pointer-events: none;
          position: absolute;
          z-index: 2147483647;
          border-radius: 2px;
        }
      `;
      document.head?.appendChild(styleEl);
      styleInjected = true;
    }

    // 每次调用都更新 CSS 变量，确保颜色即时生效
    const root = document.documentElement;
    root.style.setProperty('--clipsey-inline-highlight-color', inlineColor);
    root.style.setProperty('--clipsey-overlay-highlight-color', overlayColor);
  } catch {
    // ignore
  }
}

// 从设置读取用户选择的高亮配色（优先背景页消息，次选 storage.local）
async function loadColorSchemeFromSettings(): Promise<HighlightColorScheme> {
  // 优先通过背景页消息获取（IndexedDB 持久化）
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      const response = await new Promise<MessageResponse<SettingsOptions>>((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: 'REQUEST_SETTINGS' }, (res) => {
            resolve((res as MessageResponse<SettingsOptions>) || { success: false });
          });
        } catch {
          resolve({ success: false });
        }
      });

      const scheme = response?.data?.highlightColor;
      if (scheme && COLOR_SCHEMES[scheme]) {
        return scheme;
      }
    }
  } catch {
    // 忽略，回退到 chrome.storage.local
  }

  // 其次尝试从 chrome.storage.local 读取镜像设置（选项页保存时同步写入）
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const items = await chrome.storage.local.get('clipsey-options');
      const settings = items['clipsey-options'] as { highlightColor?: HighlightColorScheme } | undefined;
      const scheme = settings?.highlightColor;
      if (scheme && COLOR_SCHEMES[scheme]) {
        return scheme;
      }
    }
  } catch (error) {
    console.warn('Failed to load highlight color from chrome.storage.local:', error);
  }

  return DEFAULT_COLOR_SCHEME;
}

// 确保样式注入并按设置应用颜色
export async function ensureHighlightColorsReady(): Promise<void> {
  // 从设置中读取颜色方案
  currentColorScheme = await loadColorSchemeFromSettings();
  const hexColor = COLOR_SCHEMES[currentColorScheme].hex;
  
  const inline = hexToRgba(hexColor, 0.3);
  const overlay = hexToRgba(hexColor, 0.2);
  ensureStyleInjected(inline, overlay);
}

// 获取内联高亮背景色
export function getInlineHighlightColor(): string {
  return DEFAULT_INLINE_RGBA;
}

// 获取覆盖层高亮色（用于遮罩层）
export function getOverlayHighlightColor(): string {
  return DEFAULT_OVERLAY_RGBA;
}

// 返回颜色方案列表（value/label/hex）
export function getAvailableColorSchemes(): Array<{ value: HighlightColorScheme; label: string; hex: string }> {
  return Object.entries(COLOR_SCHEMES).map(([key, config]) => ({
    value: key as HighlightColorScheme,
    label: config.name,
    hex: config.hex
  }));
}

// 返回当前颜色方案
export function getCurrentColorScheme(): HighlightColorScheme {
  return currentColorScheme;
}

// 监听设置变化，动态更新颜色（依赖 options 页同步写入 chrome.storage.local）
try {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      const changed = changes['clipsey-options'];
      if (!changed) return;
      const newVal = changed.newValue as { highlightColor?: HighlightColorScheme } | undefined;
      const scheme = newVal?.highlightColor;
      if (scheme && COLOR_SCHEMES[scheme]) {
        currentColorScheme = scheme;
        const hexColor = COLOR_SCHEMES[scheme].hex;
        const inline = hexToRgba(hexColor, 0.3);
        const overlay = hexToRgba(hexColor, 0.2);
        ensureStyleInjected(inline, overlay);
      }
    });
  }
} catch {
  
}