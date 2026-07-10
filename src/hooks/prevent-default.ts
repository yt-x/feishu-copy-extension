/**
 * Event.prototype.preventDefault Hook
 *
 * 放行 contextmenu 事件的 preventDefault，恢复浏览器原生右键菜单。
 * 仅修改特定事件类型，不影响其他任何事件的默认行为。
 *
 * 必须在 MAIN world 中运行。
 * 安装时机：document_start，在飞书 JS 初始化之前 hook。
 */

/** 保存原始 preventDefault 引用（模块加载时立即缓存） */
let _rawPreventDefault: typeof Event.prototype.preventDefault | null = null;
let _installed = false;
let _hookActive = true;

// 模块加载时立即缓存原始引用（document_start 时机可用）
try {
  _rawPreventDefault = Event.prototype.preventDefault;
} catch {
  // 极端情况：原型不可访问时降级
}

/**
 * 安装 preventDefault hook
 * @param options.bypassContextMenu - 是否放行右键菜单的 preventDefault
 */
export function installPreventDefaultHook(options: {
  bypassContextMenu?: boolean;
} = {}): void {
  if (_installed) {
    _hookActive = options.bypassContextMenu !== false;
    return;
  }

  if (options.bypassContextMenu === false) return;
  if (!_rawPreventDefault) {
    // 未成功缓存原始引用，降级重试
    try {
      _rawPreventDefault = Event.prototype.preventDefault;
    } catch {
      return;
    }
  }

  try {
    const raw = _rawPreventDefault;

    Event.prototype.preventDefault = function (
      this: Event,
    ): void {
      // 仅放行右键菜单事件 — 所有其他事件严格透传
      if (_hookActive && this.type === 'contextmenu') {
        // 不调用 raw → 浏览器原生右键菜单恢复正常
        return;
      }

      // 其他所有事件：透明转发给原始 preventDefault
      return raw.call(this);
    };

    _installed = true;
  } catch (e) {
    // hook 失败时静默降级 — 飞书页面正常运行
    console.warn('[飞书复制助手] preventDefault hook 安装失败', e);
  }
}

/**
 * 动态控制 hook 开关（无需刷新）
 */
export function setPreventDefaultHookActive(active: boolean): void {
  _hookActive = active;
}

/**
 * 获取安装状态
 */
export function isPreventDefaultHookInstalled(): boolean {
  return _installed;
}
