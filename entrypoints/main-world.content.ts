/**
 * Content Script (MAIN world)
 * 注入到页面主 JavaScript 上下文中，直接 hook 浏览器 API
 *
 * 多层复制解禁策略（按优先级）：
 * 1. XHR 权限响应改写 — 拦截飞书权限 API（XMLHttpRequest）
 * 2. Fetch 权限响应改写 — 拦截飞书权限 API（fetch）
 * 3. Event.prototype.preventDefault hook — 放行右键菜单
 * 4. copy/cut 事件级兜底 — 捕获阶段 stopImmediatePropagation 绕过飞书拦截
 *
 * 此脚本运行在 MAIN world，可以直接操作页面的原型链。
 * 配置由 ISOLATED world 通过 window.postMessage 桥接（见 main-state.ts），
 * 事件级 hook 实时读取 mainState，配置变更无需刷新即可生效。
 */

import { installXHRHook, installFetchHook } from '../src/hooks/xhr-permission';
import { installPreventDefaultHook, setPreventDefaultHookActive } from '../src/hooks/prevent-default';
import {
  applyBridgedConfig,
  mainState,
  BRIDGE_SOURCE,
  type BridgedMainConfig,
} from '../src/hooks/main-state';
import { setDebug, log, warn } from '../src/utils/logger';
import { selectionToMarkdown } from '../src/utils/markdown';
import { showToast } from '../src/utils/toast';

export default defineContentScript({
  matches: [
    '*://*.feishu.cn/*',
    '*://*.larksuite.com/*',
    '*://*.larkoffice.com/*',
  ],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    // ── 全局诊断标记 ──
    (window as unknown as Record<string, unknown>).__FEISHU_COPY_LOADED = true;

    setupConfigBridge();

    try {
      // Layer 1: XHR 权限改写（实时读取 mainState.bypassCopy）
      installXHRHook();

      // Layer 2: Fetch 权限改写（安全版 — 仅拦截 JSON + 权限端点）
      installFetchHook();

      // Layer 3: preventDefault hook（放行右键菜单）
      installPreventDefaultHook({
        bypassContextMenu: mainState.bypassContextMenu,
      });

      // Layer 4: 事件级兜底 — 在捕获阶段拦截 copy/cut 事件
      //           权限改写成功且保留表格格式时自动放行飞书原生 handler
      installCopyEventFallback();

      // Layer 5: 恢复原生保存 — 放行 Ctrl+S 另存为 / Ctrl+P 打印
      installSaveShortcutBypass();

      // Layer 6: 选区复制为 Markdown — Ctrl+Shift+X
      installMarkdownCopyShortcut();

      log('hooks已安装 (XHR + Fetch + preventDefault + copyFallback + saveShortcut + mdCopy)');
    } catch (e) {
      warn('MAIN world hook 安装异常', e);
    }
  },
});

/**
 * 配置桥接：接收 ISOLATED world 同步过来的配置
 *
 * MAIN world 无法监听 chrome.storage 变更事件流，由 content.ts（ISOLATED）
 * 在配置加载/变更时通过 window.postMessage 推送。启动时主动请求一次，
 * 避免 ISOLATED 侧消息先于监听注册而丢失。
 */
function setupConfigBridge(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    const data = event.data as {
      source?: string;
      type?: string;
      config?: Partial<BridgedMainConfig>;
    } | null;
    if (!data || data.source !== BRIDGE_SOURCE) return;

    if (data.type === 'CONFIG_SYNC' && data.config && typeof data.config === 'object') {
      applyBridgedConfig(data.config);
      setPreventDefaultHookActive(mainState.bypassContextMenu);
      setDebug(mainState.debug);
      log('MAIN world 配置已同步', data.config);
    }
  });

  window.postMessage({ source: BRIDGE_SOURCE, type: 'REQUEST_CONFIG' }, window.location.origin);
}

/**
 * Layer 4 是否拦截本次 copy/cut（捕获阶段）
 *
 * 智能调度：
 * - bypassCopy 关闭 → 不拦截（恢复飞书原生限制）
 * - keepTableFormat 开启且权限改写已成功 → 不拦截，让飞书原生 handler
 *   写入 HTML 剪贴板（保留表格/富文本格式）
 * - 其他情况 → 拦截并手动写入纯文本（兜底保证复制可用）
 */
function shouldInterceptCopy(): boolean {
  if (!mainState.bypassCopy) return false;
  if (mainState.keepTableFormat && mainState.permissionRewritten) return false;
  return true;
}

/**
 * 本次 copy/cut 是否处于放行模式（飞书原生 handler 优先）
 * 放行模式下由冒泡阶段的 copyFallbackBubble 兜底：
 * 飞书真正写入剪贴板则不动，飞书拒绝（未写任何数据）则补写纯文本
 */
function shouldPassthrough(): boolean {
  return mainState.bypassCopy && mainState.keepTableFormat && mainState.permissionRewritten;
}

/**
 * 缴械 copy/cut 事件：使 preventDefault / stopPropagation 全部失效
 *
 * 飞书在捕获阶段 stopImmediatePropagation 掐死事件 + preventDefault 阻止默认复制。
 * 无效化后：
 * - 浏览器原生复制接管（选区序列化为 text/html，表格/富文本格式天然保留）
 * - 事件继续传播，任何 handler 都无法再掐死
 */
function neutralizeEvent(e: ClipboardEvent): void {
  try {
    e.preventDefault = () => undefined;
    e.stopPropagation = () => undefined;
    e.stopImmediatePropagation = () => undefined;
  } catch {
    // 极端情况静默降级
  }
}

/**
 * copy/cut 事件级兜底拦截
 *
 * 捕获阶段（window 级，传播路径最前端）：
 * - 放行模式（keepTableFormat + 权限已改写）→ 缴械事件 + 预填纯文本，
 *   浏览器原生复制带格式生效；若飞书仍设法取消，预填的纯文本兜底
 * - 纯文本模式 → stopImmediatePropagation + 手写纯文本
 *
 * 冒泡阶段（document 级）：放行模式下若飞书仍清空/未写剪贴板则补写纯文本
 */
function installCopyEventFallback(): void {
  function writeSelectionAsPlainText(e: ClipboardEvent, isCut: boolean): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString();
    if (!text) return;

    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();

    if (isCut) selection.deleteFromDocument();
  }

  /**
   * 飞书表格跨单元格选区提取
   *
   * 拖选跨单元格时飞书会折叠原生 selection（anchor=BODY），用自己的
   * overlay 渲染选中态（每个选中 td 内插入 div.selected-mask），
   * 此时原生复制拿不到任何内容。从 overlay 重建表格内容：
   * - text/html：按 TR 分组重建 <table>，粘贴到 Excel 保留单元格结构
   * - text/plain：单元格 \t 分隔、行 \n 分隔
   *
   * @returns 是否命中表格选区并已写入剪贴板
   */
  function extractFeishuTableSelection(e: ClipboardEvent): boolean {
    const masks = Array.from(document.querySelectorAll('.selected-mask'));
    if (masks.length === 0) return false;

    const cells = masks
      .map((m) => m.closest('td'))
      .filter((c): c is HTMLTableCellElement => c !== null);
    if (cells.length === 0) return false;

    const rows = new Map<Element, Element[]>();
    for (const cell of cells) {
      const tr = cell.parentElement;
      if (!tr) continue;
      const rowCells = rows.get(tr);
      if (rowCells) {
        rowCells.push(cell);
      } else {
        rows.set(tr, [cell]);
      }
    }
    if (rows.size === 0) return false;

    let html = '<table>';
    const plainRows: string[] = [];
    for (const rowCells of rows.values()) {
      html += '<tr>';
      const plainCells: string[] = [];
      for (const cell of rowCells) {
        const clone = cell.cloneNode(true) as Element;
        clone.querySelectorAll('.selected-mask').forEach((m) => m.remove());
        html += '<td>' + clone.innerHTML + '</td>';
        plainCells.push((clone.textContent || '').trim());
      }
      html += '</tr>';
      plainRows.push(plainCells.join('\t'));
    }
    html += '</table>';

    e.clipboardData?.setData('text/html', html);
    e.clipboardData?.setData('text/plain', plainRows.join('\n'));
    e.preventDefault();
    return true;
  }

  /**
   * 原生选区是否为空（飞书表格跨单元格拖选后会折叠原生 selection）
   */
  function isNativeSelectionEmpty(): boolean {
    const s = window.getSelection();
    return !s || s.isCollapsed || !s.toString().trim();
  }

  function copyHandler(e: ClipboardEvent): void {
    if (!mainState.bypassCopy) return;

    // 飞书表格跨单元格选区：从 overlay 重建并直接写入，
    // stopImmediatePropagation 同时掐死飞书的「无权限」提示
    if (isNativeSelectionEmpty() && extractFeishuTableSelection(e)) {
      e.stopImmediatePropagation();
      return;
    }

    if (shouldPassthrough()) {
      neutralizeEvent(e);
      writeSelectionAsPlainText(e, false);
      return;
    }
    e.stopImmediatePropagation();
    writeSelectionAsPlainText(e, false);
  }

  function cutHandler(e: ClipboardEvent): void {
    if (!mainState.bypassCopy) return;

    // 表格选区：同 copy 处理（不做删除，避免破坏表格内容）
    if (isNativeSelectionEmpty() && extractFeishuTableSelection(e)) {
      e.stopImmediatePropagation();
      return;
    }

    if (shouldPassthrough()) {
      neutralizeEvent(e);
      writeSelectionAsPlainText(e, true);
      return;
    }
    e.stopImmediatePropagation();
    writeSelectionAsPlainText(e, true);
  }

  /**
   * 冒泡阶段兜底：放行模式下飞书未写入任何数据时补写纯文本
   */
  function copyFallbackBubble(e: ClipboardEvent): void {
    if (!shouldPassthrough()) return;
    if (!e.defaultPrevented) return;
    const types = e.clipboardData ? Array.from(e.clipboardData.types) : [];
    if (types.length > 0) return;
    writeSelectionAsPlainText(e, false);
  }

  function cutFallbackBubble(e: ClipboardEvent): void {
    if (!shouldPassthrough()) return;
    if (!e.defaultPrevented) return;
    const types = e.clipboardData ? Array.from(e.clipboardData.types) : [];
    if (types.length > 0) return;
    writeSelectionAsPlainText(e, true);
  }

  /**
   * selectstart 放行：阻止飞书禁用文本选择
   */
  function selectStartHandler(e: Event): void {
    if (!mainState.bypassCopy) return;
    e.stopImmediatePropagation();
  }

  // window 捕获阶段（传播路径最前端，早于 document 级 handler）
  window.addEventListener('copy', copyHandler, true);
  window.addEventListener('cut', cutHandler, true);
  document.addEventListener('selectstart', selectStartHandler, true);
  // document 冒泡阶段兜底
  document.addEventListener('copy', copyFallbackBubble, false);
  document.addEventListener('cut', cutFallbackBubble, false);
}

/**
 * 选区复制为 Markdown — Ctrl+Shift+X
 *
 * 不用 Ctrl+Shift+C：那是 Chrome DevTools 审查元素的浏览器级快捷键，页面收不到。
 */
function installMarkdownCopyShortcut(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!mainState.bypassCopy) return;
      if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'x') return;

      const md = selectionToMarkdown();
      if (!md.trim()) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      navigator.clipboard.writeText(md).then(
        () => showToast('已复制为 Markdown'),
        () => showToast('Markdown 复制失败'),
      );
    },
    true,
  );
}

/**
 * 恢复浏览器原生保存快捷键
 *
 * 飞书在 keydown 上 preventDefault 拦截 Ctrl+S / Ctrl+P。
 * 在 window 捕获阶段（最前端）将事件实例的 preventDefault/stop* 无效化，
 * 飞书的拦截变成空调用，浏览器原生「另存为」「打印」对话框正常弹出。
 */
function installSaveShortcutBypass(): void {
  window.addEventListener(
    'keydown',
    (e) => {
      if (!mainState.bypassCopy) return;
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();
      if (key !== 's' && key !== 'p') return;

      try {
        e.preventDefault = () => undefined;
        e.stopPropagation = () => undefined;
        e.stopImmediatePropagation = () => undefined;
      } catch {
        // 静默降级
      }
    },
    true,
  );
}
