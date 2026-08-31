/**
 * MAIN world 运行时状态
 *
 * 配置由 ISOLATED world 通过 window.postMessage 桥接写入。
 * 所有 hook 在事件发生时读取本模块的实时值，因此 preventDefault、
 * copy 兜底等事件级 hook 的配置变更无需刷新即可生效。
 */

export const BRIDGE_SOURCE = 'feishu-copy-bridge';

export interface BridgedMainConfig {
  bypassCopy: boolean;
  bypassContextMenu: boolean;
  keepTableFormat: boolean;
  debug: boolean;
}

export interface MainWorldState extends BridgedMainConfig {
  /** 权限响应是否已被 XHR/Fetch hook 成功改写（供 Layer 4 智能调度） */
  permissionRewritten: boolean;
  /** 是否已收到 ISOLATED world 桥接过来的真实配置 */
  configReceived: boolean;
}

export const mainState: MainWorldState = {
  bypassCopy: true,
  bypassContextMenu: true,
  keepTableFormat: true,
  debug: false,
  permissionRewritten: false,
  configReceived: false,
};

/**
 * 首次配置就绪信号
 * XHR/Fetch 权限改写必须等待真实配置到达，否则刷新页面时飞书的权限请求
 * 可能先于桥接消息到达，hook 会按默认值误改写（开关关闭仍生效）
 */
let resolveConfigReady: () => void;
export const configReady: Promise<void> = new Promise((resolve) => {
  resolveConfigReady = resolve;
});

export function applyBridgedConfig(config: Partial<BridgedMainConfig>): void {
  if (typeof config.bypassCopy === 'boolean') mainState.bypassCopy = config.bypassCopy;
  if (typeof config.bypassContextMenu === 'boolean') {
    mainState.bypassContextMenu = config.bypassContextMenu;
  }
  if (typeof config.keepTableFormat === 'boolean') {
    mainState.keepTableFormat = config.keepTableFormat;
  }
  if (typeof config.debug === 'boolean') mainState.debug = config.debug;

  if (!mainState.configReceived) {
    mainState.configReceived = true;
    resolveConfigReady();
  }
}

export function toBridgedConfig(cfg: BridgedMainConfig): BridgedMainConfig {
  return {
    bypassCopy: cfg.bypassCopy,
    bypassContextMenu: cfg.bypassContextMenu,
    keepTableFormat: cfg.keepTableFormat,
    debug: cfg.debug,
  };
}
