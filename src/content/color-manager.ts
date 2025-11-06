/**
 * 颜色管理器：统一管理高亮颜色的读取、计算与样式注入。
 * 目标：
 * - 与设置存储解耦，通过消息读取配置（REQUEST_SETTINGS）
 * - 将颜色以 CSS 变量方式注入，避免在功能逻辑中硬编码颜色
 * - 提供内联/覆盖两种高亮颜色的计算方法，便于未来扩展
 */

type OptionsRecord = {
  highlightColor?: string; // 基础设置中的“内容高亮”颜色，hex 格式，如 #ff0000
};

const DEFAULT_INLINE_RGBA = 'rgba(251, 191, 36, 0.45)'; // 旧版默认（琥珀色半透明）
const DEFAULT_OVERLAY_RGBA = 'rgba(251, 191, 36, 0.30)';

export const HIGHLIGHT_INLINE_CLASS = 'clipsey-inline-highlight';
export const HIGHLIGHT_OVERLAY_CLASS = 'clipsey-overlay-highlight';

let cachedOptions: OptionsRecord | null = null;
let styleInjected = false;

// 在内容脚本环境内联消息发送函数，避免打包为外部 ESM 导入
function sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }

        resolve(response as TResponse);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function hexToRgba(hex: string, alpha = 0.45): string {
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

async function readOptions(): Promise<OptionsRecord> {
  // 已废弃 - 现在使用默认颜色，不再从配置中读取
  return {};
}

function ensureStyleInjected(inlineColor: string, overlayColor: string): void {
  if (styleInjected) return;
  try {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.textContent = `
      :root {
        --clipsey-inline-highlight-color: ${inlineColor};
        --clipsey-overlay-highlight-color: ${overlayColor};
      }
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
    document.head?.appendChild(style);
    styleInjected = true;
  } catch {
    // ignore
  }
}

export async function ensureHighlightColorsReady(): Promise<void> {
  // 使用默认高亮颜色，不再从配置中读取
  const hex = '#ff0000';
  const inline = hexToRgba(hex, 0.45);
  const overlay = hexToRgba(hex, 0.30);
  ensureStyleInjected(inline, overlay);
}

export function getInlineHighlightColor(): string {
  const hex = cachedOptions?.highlightColor;
  return hex ? hexToRgba(hex, 0.45) : DEFAULT_INLINE_RGBA;
}

export function getOverlayHighlightColor(): string {
  const hex = cachedOptions?.highlightColor;
  return hex ? hexToRgba(hex, 0.30) : DEFAULT_OVERLAY_RGBA;
}

export function updateCachedOptions(options: OptionsRecord): void {
  cachedOptions = options;
  // 更新 CSS 变量
  const inline = getInlineHighlightColor();
  const overlay = getOverlayHighlightColor();
  try {
    const root = document.documentElement;
    root.style.setProperty('--clipsey-inline-highlight-color', inline);
    root.style.setProperty('--clipsey-overlay-highlight-color', overlay);
  } catch {
    // ignore
  }
}