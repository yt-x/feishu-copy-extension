/**
 * Content Script (ISOLATED world)
 *
 * 负责：
 * 1. 读取 chrome.storage 配置
 * 2. 注入 CSS 样式（user-select 覆盖、水印移除、拖拽解除）
 * 3. 与 popup 通信
 * 4. 持续加固（MutationObserver + 节流防抖）
 *
 * ⚠️ 不操作 document.head 直到 DOM 准备好（避免 document_start 时 head 未就绪）
 */

import { defineContentScript } from 'wxt/sandbox';
import { loadConfig, onConfigChanged, type FeishuConfig } from '../src/utils/storage';
import { setDebug, log, error } from '../src/utils/logger';
import {
  injectStyle,
  removeStyle,
  USER_SELECT_CSS,
  WATERMARK_CSS,
  DRAG_CSS,
} from '../src/styles/inject-css';

export default defineContentScript({
  matches: [
    '*://*.feishu.cn/*',
    '*://*.larksuite.com/*',
    '*://*.larkoffice.com/*',
  ],
  runAt: 'document_start',

  async main(ctx) {
    let config: FeishuConfig = await loadConfig();
    setDebug(config.debug);
    log('Content Script 已加载（ISOLATED world）', config);

    // ⚠️ 不立即注入 CSS — 等待 document.head 就绪
    // document_start 时机 head 可能尚未构建完毕
    function safeApplyStyles(): void {
      if (!document.head) {
        // head 还未就绪，延迟重试
        requestAnimationFrame(safeApplyStyles);
        return;
      }
      applyAllStyles(config);
    }
    safeApplyStyles();

    // 监听配置变更
    const removeListener = onConfigChanged((newConfig) => {
      log('配置已更新', newConfig);
      config = newConfig;
      setDebug(config.debug);
      applyAllStyles(config);
    });

    ctx.onInvalidated(() => {
      removeListener();
      removeStyle('user-select');
      removeStyle('watermark');
      removeStyle('drag');
    });

    // DOM 完全就绪后启动持续加固（节流版）
    const scheduleReinforcement = () => setupReinforcement(config);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleReinforcement, { once: true });
    } else {
      scheduleReinforcement();
    }

    // 监听来自 popup 的消息
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'GET_CONFIG') {
        sendResponse({ config });
        return true;
      }
      if (message.type === 'APPLY_STYLES') {
        applyAllStyles(message.config || config);
        sendResponse({ success: true });
        return true;
      }
    });
  },
});

/**
 * 应用所有 CSS 样式
 */
function applyAllStyles(cfg: FeishuConfig): void {
  if (!document.head) return;

  if (cfg.bypassUserSelect) {
    injectStyle('user-select', USER_SELECT_CSS);
  } else {
    removeStyle('user-select');
  }

  if (cfg.removeWatermark) {
    injectStyle('watermark', WATERMARK_CSS);
  } else {
    removeStyle('watermark');
  }

  if (cfg.bypassDrag) {
    injectStyle('drag', DRAG_CSS);
  } else {
    removeStyle('drag');
  }
}

/**
 * 持续加固：MutationObserver（节流） + 短时 rAF 循环 + SPA 路由检测
 *
 * 设计约束：
 * - MutationObserver 添加 200ms 节流，避免飞书渲染期间高频触发
 * - rAF 循环仅运行 20 秒，之后完全依赖 MutationObserver
 * - URL 轮询间隔从 1s 提高到 5s，降低 CPU 开销
 */
function setupReinforcement(cfg: FeishuConfig): void {
  log('启动持续加固');

  let observer: MutationObserver | null = null;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  function reapplyStyles(): void {
    applyAllStyles(cfg);
  }

  // 节流版 MutationObserver：200ms 内多次触发只执行一次
  try {
    observer = new MutationObserver(() => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        reapplyStyles();
      }, 200);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch (e) {
    error('MutationObserver 初始化失败', e);
  }

  // rAF 循环加固 20 秒（仅飞书初始化期间）
  const startTime = performance.now();
  function loop(): void {
    reapplyStyles();
    if (performance.now() - startTime < 20000) {
      requestAnimationFrame(loop);
    } else {
      log('持续加固 rAF 结束 (20s)，后续仅依赖 MutationObserver');
    }
  }
  requestAnimationFrame(loop);

  // SPA 路由变化检测（5s 轮询，降低开销）
  let lastUrl = location.href;
  const urlCheckInterval = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      log('SPA 路由变化，重新注入 CSS');
      // SPA 路由变化时可能丢样式，立即补注
      reapplyStyles();
    }
  }, 5000);

  // 5 分钟后停止 URL 轮询
  setTimeout(() => clearInterval(urlCheckInterval), 300000);
}
