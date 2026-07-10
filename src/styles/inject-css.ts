/**
 * CSS 注入模块
 * 提供各种 CSS 覆盖规则的注入和移除
 */

/** 存储已注入的 style 元素 */
const styleElements = new Map<string, HTMLStyleElement>();

/**
 * 注入 CSS 规则到页面
 * @param id 唯一标识，用于后续移除
 * @param css CSS 文本
 */
export function injectStyle(id: string, css: string): void {
  removeStyle(id);

  const style = document.createElement('style');
  style.id = `__feishu_copy_${id}__`;
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  styleElements.set(id, style);
}

/**
 * 移除注入的 CSS 规则
 */
export function removeStyle(id: string): void {
  const existing = styleElements.get(id) || document.getElementById(`__feishu_copy_${id}__`);
  if (existing) {
    existing.remove();
    styleElements.delete(id);
  }
}

/**
 * 启用/禁用某个样式
 */
export function toggleStyle(id: string, enabled: boolean): void {
  const el = styleElements.get(id) || document.getElementById(`__feishu_copy_${id}__`);
  if (el instanceof HTMLStyleElement) {
    el.disabled = !enabled;
  }
}

/**
 * 覆盖 user-select，强制文本可选
 */
export const USER_SELECT_CSS = `
  *, *::before, *::after {
    user-select: text !important;
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
  }
`;

/**
 * 去除水印图层
 */
export const WATERMARK_CSS = `
  /* 水印类名 */
  [class*="watermark"],
  [class*="Watermark"],
  [class*="WaterMark"],
  /* 水印容器 */
  #watermark-cache-container,
  [id*="watermark"],
  /* 固定定位的无内容图层（常见水印实现） */
  body > div > div > div > div[style*="position: fixed"]:not(:has(*)):not(:has(img)),
  body > div[style*="position: fixed"]:not(:has(*)):not(:has(img)),
  /* 全屏固定定位空 div */
  body > div[style*="inset: 0px"]:not(:has(*)):not(:has(img)),
  /* SVG 水印 */
  svg[class*="watermark"],
  svg[id*="watermark"],
  /* 飞书特定水印 class 前缀 */
  [class*="TIAWBFTROSIDWYKTTIAW"],
  /* 聊天消息水印 */
  .chatMessages > div[style*="inset: 0px"] {
    background-image: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    z-index: -1 !important;
  }
`;

/**
 * 解除拖拽限制
 */
export const DRAG_CSS = `
  img, a, [draggable="false"] {
    -webkit-user-drag: auto !important;
    user-drag: auto !important;
  }
`;
