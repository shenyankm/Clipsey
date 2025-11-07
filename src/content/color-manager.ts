/**
 * 颜色管理器:统一管理高亮颜色的读取、计算与样式注入。
 * 目标:
 * - 将颜色以 CSS 变量方式注入,避免在功能逻辑中硬编码颜色
 * - 提供内联/覆盖两种高亮颜色的计算方法,便于未来扩展
 * - 采用最佳实践配色方案,确保良好的阅读体验
 */

// 高亮配色方案:琥珀色 (Material Design Amber 500)
// 相比黄色具有更好的对比度和视觉舒适度
const DEFAULT_HIGHLIGHT_HEX = '#FFC107';
const DEFAULT_INLINE_RGBA = 'rgba(255, 193, 7, 0.3)';
const DEFAULT_OVERLAY_RGBA = 'rgba(255, 193, 7, 0.2)'; 

export const HIGHLIGHT_INLINE_CLASS = 'clipsey-inline-highlight';
export const HIGHLIGHT_OVERLAY_CLASS = 'clipsey-overlay-highlight';

let styleInjected = false;

/**
 * 将十六进制颜色转换为 RGBA 格式
 * @param hex 十六进制颜色值（如 #FFC107 或 #FC0）
 * @param alpha 不透明度 (0-1)
 * @returns RGBA 颜色字符串
 */
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

/**
 * 确保高亮颜色样式已注入到页面中
 * 使用优化后的配色方案：琥珀色 (Amber 500) 具有更好的对比度和可读性
 */
export async function ensureHighlightColorsReady(): Promise<void> {
  const inline = hexToRgba(DEFAULT_HIGHLIGHT_HEX, 0.3);
  const overlay = hexToRgba(DEFAULT_HIGHLIGHT_HEX, 0.2);
  ensureStyleInjected(inline, overlay);
}

/**
 * 获取内联高亮颜色（用于文本选区的背景高亮）
 */
export function getInlineHighlightColor(): string {
  return DEFAULT_INLINE_RGBA;
}

/**
 * 获取覆盖层高亮颜色（用于浮层遮罩的高亮）
 */
export function getOverlayHighlightColor(): string {
  return DEFAULT_OVERLAY_RGBA;
}