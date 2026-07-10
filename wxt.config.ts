import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '飞书复制助手',
    description: '解除飞书文档的复制、右键、文本选择限制，保留表格格式',
    icons: {},
    permissions: ['storage', 'scripting'],
    host_permissions: [
      '*://*.feishu.cn/*',
      '*://*.larksuite.com/*',
      '*://*.larkoffice.com/*',
    ],
    web_accessible_resources: [
      {
        resources: ['inject.js'],
        matches: [
          '*://*.feishu.cn/*',
          '*://*.larksuite.com/*',
          '*://*.larkoffice.com/*',
        ],
      },
    ],
  },
  runner: {
    disabled: true,
  },
});
