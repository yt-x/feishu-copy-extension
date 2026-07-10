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
 * 此脚本运行在 MAIN world，可以直接操作页面的原型链
 */

import { installXHRHook, installFetchHook } from '../src/hooks/xhr-permission';
import { installPreventDefaultHook } from '../src/hooks/prevent-default';

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

    function loadAndApply(): void {
      const config = {
        bypassCopy: true,
        bypassContextMenu: true,
        debug: false,
      };

      try {
        // Layer 1: XHR 权限改写
        installXHRHook({
          bypassCopy: config.bypassCopy,
          forceExport: true,
        });

        // Layer 2: Fetch 权限改写（安全版 — 仅拦截 JSON + 权限端点）
        installFetchHook({
          bypassCopy: config.bypassCopy,
          forceExport: true,
        });

        // Layer 3: preventDefault hook（放行右键菜单）
        installPreventDefaultHook({
          bypassContextMenu: config.bypassContextMenu,
        });

        // Layer 4: 事件级兜底 — 在捕获阶段拦截 copy/cut 事件
        //           仅当飞书的权限 API 无法被改写时才靠这个兜底
        //           注意：这会阻止飞书的富文本/表格格式化复制
        installCopyEventFallback();

        console.log(
          '%c[飞书复制助手·MAIN]%c hooks已安装 %c(XHR + Fetch + preventDefault + copyFallback)',
          'color:#52c41a;font-weight:bold',
          '',
          'color:#8f959e',
        );
      } catch (e) {
        console.warn('[飞书复制助手] MAIN world hook 安装异常', e);
      }
    }

    loadAndApply();
  },
});

/**
 * copy/cut 事件级兜底拦截
 *
 * 在捕获阶段拦截飞书的 copy/cut 事件处理器，并手动从 Selection API
 * 提取内容写入剪贴板，确保 Ctrl+C 和右键→复制均可正常工作。
 *
 * 设计：
 * - 捕获阶段 stopImmediatePropagation() → 飞书处理器永不执行
 * - 手动 clipboardData.setData() → 纯文本写入剪贴板
 * - selectstart 放行 → 结合 CSS user-select 注入，文本可选中
 *
 * ⚠️ 已知限制：无法保留富文本/表格格式（飞书的格式化复制依赖其自身 copy handler）
 *   如果需要复制表格到 Excel，依赖 Layer 1/2 的 XHR/Fetch 权限改写生效。
 */
function installCopyEventFallback(): void {
  /**
   * copy 事件处理器：从 Selection 提取纯文本写入剪贴板
   */
  function copyHandler(e: ClipboardEvent): void {
    e.stopImmediatePropagation();

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString();
    if (!text) return;

    // 写入纯文本到剪贴板
    e.clipboardData?.setData('text/plain', text);
    // 阻止浏览器默认行为（用我们的数据替代）
    e.preventDefault();
  }

  /**
   * cut 事件处理器：复制 + 删除选中内容
   */
  function cutHandler(e: ClipboardEvent): void {
    e.stopImmediatePropagation();

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString();
    if (!text) return;

    e.clipboardData?.setData('text/plain', text);
    e.preventDefault();

    // 删除选中内容
    selection.deleteFromDocument();
  }

  /**
   * selectstart 放行：阻止飞书禁用文本选择
   */
  function selectStartHandler(e: Event): void {
    e.stopImmediatePropagation();
  }

  // 捕获阶段注册（早于飞书的冒泡阶段处理器）
  document.addEventListener('copy', copyHandler, true);
  document.addEventListener('cut', cutHandler, true);
  document.addEventListener('selectstart', selectStartHandler, true);
}
