// 视口与滚动相关工具：遮挡检测、滚动补偿与平滑滚动

export type ObstructionDetection = {
  offset: number;
  detected: boolean;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseCssPixels(value: string): number {
  if (!value) return 0;
  const m = /(-?\d+(?:\.\d+)?)\s*px/i.exec(value);
  return m ? Number(m[1]) || 0 : 0;
}

export function measureFixedOrStickyHeaderHeight(): number {
  // 结果缓存：在短时间窗口内复用，减少重复测量成本
  const now = Date.now();
  if (headerCache.ts && (now - headerCache.ts) < 500 && headerCache.value >= 0) {
    return headerCache.value;
  }

  const viewportWidth = Math.max(document.documentElement?.clientWidth || 0, 0);
  const candidates = Array.from(document.querySelectorAll(
    '[style*="position: fixed"], [style*="position:sticky"], header, nav, .header, .topbar, #header'
  )) as Element[];

  const referenceY = Math.max(window.scrollY, 0) + 0; // 顶部参考线
  const heights = candidates.map(el => evaluateObstructionElement(el, referenceY));
  const filtered = heights.filter(h => h > 0);
  if (!filtered.length) {
    headerCache.value = 0;
    headerCache.ts = now;
    return 0;
  }
  const avg = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const values = filtered.map(value => clamp(Math.round(value), 0, Math.max(viewportWidth - 1, 0)));
  const result = Math.max(...values, clamp(Math.round(avg), 0, Math.max(viewportWidth - 1, 0)));
  headerCache.value = result;
  headerCache.ts = now;
  return result;
}

export function evaluateObstructionElement(element: Element, referenceY: number): number {
  try {
    const style = getComputedStyle(element);
    const position = style.position;
    if (position !== 'fixed' && position !== 'sticky') return 0;
    const rect = element.getBoundingClientRect();
    if (rect.height <= 0 || rect.width <= 0) return 0;
    const top = rect.top + window.scrollY;
    // 仅考虑顶部遮挡区域
    if (top > referenceY + 64) return 0;
    return Math.max(0, rect.height);
  } catch {
    return 0;
  }
}

export function measureHeaderFromSelectors(): number {
  const selectors = ['header', 'nav', '.header', '.topbar', '#header'];
  let maxHeight = 0;
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      maxHeight = Math.max(maxHeight, rect.height);
    } catch {}
  }
  return maxHeight;
}

export function getScrollPaddingTopValue(): number {
  try {
    const root = document.documentElement;
    const rootStyles = window.getComputedStyle(root);
    const docPadding = parseCssPixels(rootStyles.scrollPaddingTop);
    const bodyPadding = document.body ? parseCssPixels(window.getComputedStyle(document.body).scrollPaddingTop) : 0;
    return Math.max(0, docPadding, bodyPadding);
  } catch {
    return 0;
  }
}

export function getSafeAreaInsetTop(): number {
  try {
    // 创建探针元素以读取 env(safe-area-inset-top)
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.top = '0';
    probe.style.left = '0';
    probe.style.width = '0';
    probe.style.height = '0';
    probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    document.body.appendChild(probe);
    const measured = parseCssPixels(window.getComputedStyle(probe).paddingTop);
    probe.remove();
    return Math.max(0, measured);
  } catch {
    return 0;
  }
}

export function detectTopObstructionHeight(): ObstructionDetection {
  const headerHeight = measureFixedOrStickyHeaderHeight();
  const scrollPadding = getScrollPaddingTopValue();
  const safeAreaInset = getSafeAreaInsetTop();
  const rawOffset = Math.max(headerHeight, scrollPadding, safeAreaInset);
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  const maxOffset = viewportHeight ? Math.min(viewportHeight * 0.6, 480) : 480;
  const offset = rawOffset > 0 ? Math.min(rawOffset, maxOffset) : 0;
  return { offset, detected: rawOffset > 0 };
}

export function smoothScrollBy(amount: number): void {
  try {
    window.scrollBy({ top: amount, behavior: 'smooth' });
  } catch {
    window.scrollBy(0, amount);
  }
}

export function scheduleFallbackScrolls(targetTop: number): void {
  try {
    const current = window.scrollY;
    const diff = targetTop - current;
    if (Math.abs(diff) < 2) return;
    const step = clamp(Math.round(Math.abs(diff) / 3), 8, 128);
    if (diff < 0) {
      smoothScrollBy(-step);
      setTimeout(() => smoothScrollBy(-step), 200);
    } else {
      smoothScrollBy(step);
      setTimeout(() => smoothScrollBy(step), 200);
    }
  } catch {}
}

// 简单缓存结构与失效机制
const headerCache: { value: number; ts: number } = { value: -1, ts: 0 };

try {
  window.addEventListener('resize', () => {
    headerCache.value = -1;
    headerCache.ts = 0;
  });
} catch {}