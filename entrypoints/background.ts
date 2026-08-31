/**
 * Background Service Worker
 * 负责：
 * 1. 扩展安装/更新时的初始化
 * 2. 监听配置变更并通知 content scripts
 * 3. 处理 popup 的消息通信
 */

import { defineBackground } from 'wxt/sandbox';
import { DEFAULT_CONFIG, type FeishuConfig } from '../src/utils/storage';

export default defineBackground({
  main() {
    /**
     * 扩展安装/更新时初始化默认配置
     */
    chrome.runtime.onInstalled.addListener(async (details) => {
      if (details.reason === 'install') {
        await chrome.storage.sync.set({ feishu_copy_config: DEFAULT_CONFIG });
        console.log('[飞书复制助手] 已安装，默认配置已保存');
      }
    });

    /**
     * 处理来自 popup 的消息
     */
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'GET_CONFIG') {
        chrome.storage.sync.get('feishu_copy_config').then((result) => {
          sendResponse({ config: result.feishu_copy_config || DEFAULT_CONFIG });
        });
        return true; // 异步响应
      }

      if (message.type === 'SAVE_CONFIG') {
        // merge：popup 只发送变更的键，必须与已有配置合并后写入，
        // 否则部分写入会把其他键重置为默认值
        chrome.storage.sync
          .get('feishu_copy_config')
          .then((result) => {
            const existing = (result.feishu_copy_config || {}) as Partial<FeishuConfig>;
            const patch = (message.config || {}) as Partial<FeishuConfig>;
            const merged: FeishuConfig = { ...DEFAULT_CONFIG, ...existing, ...patch };
            return chrome.storage.sync.set({ feishu_copy_config: merged });
          })
          .then(() => {
            sendResponse({ success: true });
          });
        return true;
      }

      if (message.type === 'RELOAD_TAB') {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.id) chrome.tabs.reload(tab.id);
        });
        return false;
      }
    });
  },
});
