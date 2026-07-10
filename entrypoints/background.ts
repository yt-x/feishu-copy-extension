/**
 * Background Service Worker
 * 负责：
 * 1. 扩展安装/更新时的初始化
 * 2. 监听配置变更并通知 content scripts
 * 3. 处理 popup 的消息通信
 */

import { DEFAULT_CONFIG, type FeishuConfig } from '../src/utils/storage';

const FEISHU_MATCHES = [
  '*://*.feishu.cn/*',
  '*://*.larksuite.com/*',
  '*://*.larkoffice.com/*',
];

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
    chrome.storage.sync.set({ feishu_copy_config: message.config }).then(() => {
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

export default {};
