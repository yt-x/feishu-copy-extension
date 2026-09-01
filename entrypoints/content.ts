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
import { BRIDGE_SOURCE, toBridgedConfig } from '../src/hooks/main-state';
import { findDocContainer, collectVisibleContentBlocks, blocksToMarkdown, collectImageAssets } from '../src/utils/markdown';
import JSZip from 'jszip';
import { showToast } from '../src/utils/toast';
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

    // 桥接配置到 MAIN world（hook 实时读取，事件级开关无需刷新）
    syncConfigToMainWorld(config);

    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      const data = event.data as { source?: string; type?: string } | null;
      if (data?.source === BRIDGE_SOURCE && data.type === 'REQUEST_CONFIG') {
        syncConfigToMainWorld(config);
      }
    });

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
      syncConfigToMainWorld(config);
    });

    installExternalLinkHandler();

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
      if (message.type === 'EXPORT_MARKDOWN') {
        (async () => {
          try {
            const md = await collectFullDocumentMarkdown();
            if (!md.trim()) {
              sendResponse({ success: false });
              return;
            }
            const title =
              document.title.replace(/[ _-]*飞书云文档.*$/, '').trim() || 'document';

            if (config.embedImages) {
              // 打包 zip：文档名.md + assets/ 图片文件夹，md 内用相对路径引用
              const { markdown, assets } = await collectImageAssets(md);
              const zip = new JSZip();
              zip.file(`${title}.md`, markdown);
              const folder = zip.folder('assets');
              for (const asset of assets) {
                folder?.file(asset.filename, asset.blob);
              }
              const blob = await zip.generateAsync({ type: 'blob' });
              downloadBlob(blob, `${title}.zip`);
              showToast(`已导出 zip（含 ${assets.length} 张图片）`);
              sendResponse({ success: true, length: markdown.length });
            } else {
              downloadBlob(
                new Blob([md], { type: 'text/markdown;charset=utf-8' }),
                `${title}.md`,
              );
              showToast('Markdown 已导出');
              sendResponse({ success: true, length: md.length });
            }
          } catch (e) {
            error('Markdown 导出失败', e);
            sendResponse({ success: false });
          }
        })();
        return true;
      }
    });
  },
});

/**
 * 推送配置到 MAIN world
 * 失败静默降级 — MAIN world 未就绪时会通过 REQUEST_CONFIG 主动拉取
 */
function syncConfigToMainWorld(cfg: FeishuConfig): void {
  try {
    window.postMessage(
      { source: BRIDGE_SOURCE, type: 'CONFIG_SYNC', config: toBridgedConfig(cfg) },
      window.location.origin,
    );
  } catch {
    // 静默降级
  }
}

/**
 * 外链新标签打开
 *
 * 飞书域外链接默认经过飞书安全跳转页。捕获阶段拦截点击，
 * 域外 http(s) 链接直接 window.open 新标签打开，域内链接不动。
 */
function installExternalLinkHandler(): void {
  const INTERNAL = /(^|\.)(feishu\.cn|larksuite\.com|larkoffice\.com)$/;

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]');
      if (!anchor) return;

      const href = anchor.getAttribute('href') || '';
      if (!/^https?:\/\//.test(href)) return;

      let hostname: string;
      try {
        hostname = new URL(href).hostname;
      } catch {
        return;
      }
      if (INTERNAL.test(hostname)) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      window.open(href, '_blank', 'noopener');
    },
    true,
  );
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 整篇文档 → Markdown（处理飞书虚拟滚动）
 *
 * 飞书只把可视区附近的块挂载到 DOM，直接转换只能拿到当前屏幕内容。
 * 这里从顶部逐步滚动到底部，逐屏克隆内容块（克隆是快照，避免虚拟列表
 * 回收复用同一元素导致内容串位），最后拼接转换并恢复滚动位置。
 */
async function collectFullDocumentMarkdown(): Promise<string> {
  const container = findDocContainer();
  if (!container) return '';

  // 向上找滚动容器，找不到退化到 documentElement
  let scroller: Element | null = container.parentElement;
  while (scroller && scroller.scrollHeight <= scroller.clientHeight + 50) {
    scroller = scroller.parentElement;
  }
  const scrollEl: HTMLElement =
    (scroller as HTMLElement | null) || document.documentElement;

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const blockKey = (el: Element): string => {
    const id = el.getAttribute('data-block-id');
    if (id) return id;
    const text = (el.textContent || '').trim();
    return (el.getAttribute('data-block-type') || el.className) + ':' + text.length + ':' + text.slice(0, 48);
  };

  const blocks = new Map<string, Element>();
  const collect = (): void => {
    for (const block of collectVisibleContentBlocks(container)) {
      const key = blockKey(block);
      if (!blocks.has(key)) {
        blocks.set(key, block.cloneNode(true) as Element);
      }
    }
  };

  const originalTop = scrollEl.scrollTop;
  try {
    scrollEl.scrollTop = 0;
    await sleep(400);

    let lastTop = -1;
    let guard = 0;
    while (scrollEl.scrollTop !== lastTop && guard < 200) {
      lastTop = scrollEl.scrollTop;
      collect();
      scrollEl.scrollTop = lastTop + scrollEl.clientHeight * 0.8;
      await sleep(250);
    }
    collect();
  } finally {
    scrollEl.scrollTop = originalTop;
  }

  return blocksToMarkdown(Array.from(blocks.values()));
}

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
