# 飞书复制助手 — 技术文档

## 一、背景：飞书的复制保护机制

飞书网页端采用多层防御体系禁止未授权复制：

```
CSS 层:   user-select: none !important  阻止文本选中
          水印图层（fixed + 高 z-index）覆盖文档区域

事件层:   contextmenu   preventDefault()  禁用右键菜单
          copy/cut/paste                 阻止剪贴板操作
          selectstart                    阻止文本选择
          keydown                        拦截 Ctrl+C

权限层:   API 返回 actions.copy = 0      前端据此禁用复制 UI
          端点: space/api/suite/permission/document/actions/state/
```

仅拦截 CSS 或 JS 事件无法完美解决 — 飞书的格式化复制（表格到 Excel）依赖其自身的 copy 事件处理器写入 HTML 剪贴板。如果粗暴拦截事件，会丢失富文本格式。因此采用「权限层改写 + 事件层兜底」的组合策略。

## 二、架构概览

```
Chrome Extension (Manifest V3)
框架: WXT 0.19 + Vue 3 + TypeScript

  Background Service Worker
  - 配置初始化、消息路由

  Content Script (ISOLATED world)
  - CSS 注入、持续加固、Popup 通信

  Content Script (MAIN world)
  - XHR 权限改写、Fetch 权限改写
  - preventDefault hook
  - copy/cut 事件兜底

  Popup (Vue 3)
  - 开关控制面板
  - chrome.storage.sync 持久化
```

### 为什么需要两个 Content Script？

| 考量 | ISOLATED world | MAIN world |
|------|---------------|------------|
| 访问页面原型链 | 否 | 是 |
| 访问 chrome.storage | 是 | 是 |
| 安全性 | 高（与页面 JS 隔离） | 中（共享上下文） |
| 适合任务 | CSS 注入、DOM 监听 | XHR/Fetch/Event 原型 hook |

Chrome 102+ 支持 world: "MAIN" 参数，WXT 通过 defineContentScript({ world: 'MAIN' }) 声明。

## 三、四层复制解禁策略

### Layer 1: XHR 权限响应改写

飞书前端通过 XMLHttpRequest 向权限 API 请求文档权限。服务端返回 `{ data: { actions: { copy: 0, ... } } }`，前端根据这些值控制 UI 行为。

在 document_start 时机 hook `XMLHttpRequest.prototype.open`，监听匹配权限端点的请求。响应就绪时将 `actions.copy` 等字段从 0 改为 1，通过 `Object.defineProperty` 覆盖 responseText/response。

```typescript
XMLHttpRequest.prototype.open = function (method, url) {
  this.addEventListener('readystatechange', function () {
    if (this.readyState !== 4) return;
    const response = JSON.parse(this.responseText);
    if (response?.data?.actions) {
      response.data.actions.copy = 1;
    }
    Object.defineProperty(this, 'responseText', {
      value: JSON.stringify(response),
    });
  });
  return rawOpen.call(this, method, url, ...);
};
```

### Layer 2: Fetch 权限响应改写

新版飞书可能使用 fetch API 替代 XHR。安全版 fetch hook 的三级过滤：

1. 仅拦截 HTTP 200 + Content-Type: application/json
2. 仅处理匹配权限端点的 URL
3. 非匹配请求 100% 透明透传

### Layer 3: Event.prototype.preventDefault Hook

飞书在 contextmenu 事件上调用 preventDefault() 阻止浏览器原生右键。Hook 原型方法，仅对 contextmenu 忽略：

```typescript
Event.prototype.preventDefault = function () {
  if (this.type === 'contextmenu') return;
  return rawPreventDefault.call(this);
};
```

### Layer 4: 事件级兜底

捕获阶段用 stopImmediatePropagation() 阻止飞书的 copy/cut/selectstart 处理器，并从 Selection API 手动提取文本写入剪贴板。这是最后兜底 — 当权限改写无法生效时保证基本文本复制可用。代价是无法保留富文本/表格格式。

## 四、关键问题与解决方案

### 问题 1：页面无限 loading + 鼠标失能

根因：最初版本的 fetch hook 覆盖了所有请求，导致飞书资源加载被干扰。

解决：限制 fetch hook 拦截范围（仅 JSON + 200 + 权限端点），非目标请求零延迟透传。

### 问题 2：document_start 时机 CSS 注入失败

根因：document.head 在 document_start 时可能尚未构建。

解决：safeApplyStyles() 通过 requestAnimationFrame 轮询等待 document.head 就绪后再注入。

### 问题 3：仅 XHR hook 无法解除复制

根因：飞书可能使用 fetch 而非 XHR 进行权限请求。

解决：同时 hook XHR 和 fetch，覆盖两种传输方式。

### 问题 4：权限改写后 Ctrl+C 仍不生效

根因：即使权限位改为 1，飞书前端仍会在 copy 事件上调用 preventDefault()。

解决：添加 Layer 4 事件级兜底，在捕获阶段拦截 copy/cut 事件并手动写入剪贴板。

## 五、项目结构

```
feishu-copy-extension/
├── entrypoints/
│   ├── background.ts           Service Worker
│   ├── content.ts              ISOLATED world（CSS + 加固）
│   ├── main-world.content.ts   MAIN world（XHR + Fetch + 事件兜底）
│   └── popup/                  Vue 3 面板
├── src/
│   ├── hooks/
│   │   ├── xhr-permission.ts     XHR + Fetch 权限改写
│   │   └── prevent-default.ts    Event.prototype hook
│   ├── styles/
│   │   └── inject-css.ts         CSS 注入引擎
│   └── utils/
│       ├── storage.ts           chrome.storage 封装
│       └── logger.ts            调试日志
├── wxt.config.ts
├── package.json
└── .output/chrome-mv3/         构建产物
```

## 六、开发

```bash
npm install          # 安装依赖
npm run dev          # 开发模式
npm run build        # 生产构建
npm run typecheck    # 类型检查（需先 build 生成 WXT 类型）
```

### 调试

- MAIN world 日志: 飞书页面 F12 中查找 `[飞书复制助手·MAIN]`
- ISOLATED world 日志: 同上查找 `[飞书复制助手]`（需在 Popup 中开启调试日志）
- Service Worker 日志: chrome://extensions/ 中点击 Service Worker 链接
- 验证权限改写: F12 Network 搜索 actions/state，查看 Response 中的 actions.copy

## 七、参考

- [BlueSkyXN/feishu-toolkit](https://github.com/BlueSkyXN/feishu-toolkit) — Tampermonkey 脚本，最完整的飞书增强参考
- [WXT Framework](https://wxt.dev)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
