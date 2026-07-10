/**
 * 存储键名常量
 */
export const STORAGE_KEYS = {
  CONFIG: 'feishu_copy_config',
} as const;

/**
 * 默认配置
 */
export interface FeishuConfig {
  /** 解除复制限制 (XHR权限改写) */
  bypassCopy: boolean;
  /** 解除右键限制 (preventDefault hook) */
  bypassContextMenu: boolean;
  /** 解除文本选择 (CSS user-select) */
  bypassUserSelect: boolean;
  /** 去除水印 */
  removeWatermark: boolean;
  /** 解除拖拽限制 */
  bypassDrag: boolean;
  /** 保留表格格式 (不拦截飞书原生copy handler) */
  keepTableFormat: boolean;
  /** 调试日志 */
  debug: boolean;
}

export const DEFAULT_CONFIG: FeishuConfig = {
  bypassCopy: true,
  bypassContextMenu: true,
  bypassUserSelect: true,
  removeWatermark: true,
  bypassDrag: false,
  keepTableFormat: true,
  debug: false,
};

/**
 * 加载配置
 */
export async function loadConfig(): Promise<FeishuConfig> {
  const result = await chrome.storage.sync.get(STORAGE_KEYS.CONFIG);
  const saved = result[STORAGE_KEYS.CONFIG] as Partial<FeishuConfig> | undefined;
  return { ...DEFAULT_CONFIG, ...saved };
}

/**
 * 保存配置
 */
export async function saveConfig(config: Partial<FeishuConfig>): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.CONFIG]: config });
}

/**
 * 监听配置变更
 */
export function onConfigChanged(callback: (config: FeishuConfig) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'sync' && changes[STORAGE_KEYS.CONFIG]) {
      const newConfig = changes[STORAGE_KEYS.CONFIG].newValue as FeishuConfig | undefined;
      if (newConfig) {
        callback({ ...DEFAULT_CONFIG, ...newConfig });
      }
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
