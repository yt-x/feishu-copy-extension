# 飞书复制助手 — 技术文档

## 一、背景：飞书的复制保护机制

飞书网页端采用**多层防御体系**禁止未授权复制，从 CSS 到 JavaScript 到服务端权限形成了完整的保护链：

```
┌─────────────────────────────────────────────────────┐
│                  飞书复制限制层级                      │
├──────────┬──────────────────────────────────────────┤
│ CSS 层   │ user-select: none !important  阻止文本选中  │
│          │ 水印图层（fixed + 高 z-index）覆盖文档区域   │
│          │ pointer-events: none  透明遮罩拦截交互      │
├──────────┼──────────────────────────────────────────┤
│ 事件层   │ contextmenu → preventDefault()  禁用右键    │
│          │ copy/cut/paste → 阻止剪贴板操作            │
│          │ selectstart → 阻止文本选择                 │
│          │ keydown → 拦截 Ctrl+C 组合键               │
├──────────┼──────────────────────────────────────────┤
│ 权限层   │ API 响应返回 actions.copy = 0              │
│          │ 前端根据权限位启用/禁用复制 UI              │
│          │ 端点: space/api/suite/permission/...       │
└──────────┴──────────────────────────────────────────┘
```

**关键发现**：仅拦截 CSS 或 JS 事件无法完美解决——飞书的格式化复制（表格→Excel）依赖其自身的 `copy` 事件处理器写入 HTML 剪贴板。如果我们在事件层面粗暴拦截，会丢失富文本格式。因此需要**权限层改写 + 事件层兜底**的组合策略。

---

## 二、架构概览

```
┌──────────────────────────────────────────────────────┐
│                    飞书复制助手                         │
├──────────────────────────────────────────────────────┤
│  Chrome Extension (Manifest V3)                      │
│  框架: WXT 0.19 + Vue 3 + TypeScript                  │
├──────────────────┬───────────────────────────────────┤
│  Background      │  Content Script × 2               │
│  (ServiceWorker) │                                   │
│                  │  ┌─────────────────────────────┐  │
│  - 配置初始化    │  │ ISOLATED world (content.ts) │  │
│  - 消息路由      │  │ · CSS 注入                  │  │
│                  │  │ · 持续加固                  │  │
│                  │  │ · Popup 通信                │  │
│                  │  └─────────────────────────────┘  │
│                  │                                   │
│                  │  ┌─────────────────────────────┐  │
│                  │  │ MAIN world (main-world.ct)  │  │
│                  │  │ · XHR 权限改写              │  │
│                  │  │ · Fetch 权限改写            │  │
│                  │  │ · preventDefault hook       │  │
│                  │  │ · copy/cut 事件兜底         │  │
│                  │  └─────────────────────────────┘  │
├──────────────────┴───────────────────────────────────┤
│  Popup (Vue 3)                                      │
│  · 开关控制面板                                       │
│  · chrome.storage.sync 持久化                        │
└──────────────────────────────────────────────────────┘
```

### 为什么需要两个 Content Script？

| | ISOLATED world | MAIN world |
|---|---|---|
| **访问页面 JS 对象** | ❌ 无法访问 `Event.prototype`、`XMLHttpRequest.prototype` | ✅ 可直接操作原型链 |
| **访问 chrome.storage** | ✅ 可访问 | ✅ 可访问 |
| **注入 CSS** | ✅ 可以 | ✅ 但通常不需要 |
| **安全性** | 高（与页面隔离） | 中（与飞书脚本共享上下文） |
| **用途** | CSS 注入、配置管理、DOM 监听 | XHR/Fetch hook、事件拦截 |

Chrome 从 102 版本开始支持 `world: "MAIN"` 参数，允许 content script 直接运行在页面主上下文。

---

## 三、四层复制解禁策略

### Layer 1: XHR 权限响应改写

**原理**：飞书前端通过 `XMLHttpRequest` 向 `/space/api/suite/permission/document/actions/state/` 请求文档权限。服务端返回 `{ data: { actions: { copy: 0, download: 0, ... } } }`，前端根据这些值控制 UI 行为。

**实现**：在 `document_start` 时机 hook `XMLHttpRequest.prototype.open`，对所有匹配权限端点的请求监听 `readystatechange` 事件。当响应就绪时，将 `actions.copy` 等字段从 `0` 改为 `1`，通过 `Object.defineProperty` 覆盖 `responseText`/`response`。

```typescript
// 核心逻辑（简化）
XMLHttpRequest.prototype.open = function (method, url) {
  this.addEventListener('readystatechange', function () {
    if (this.readyState !== 4) return;
    const response = JSON.parse(this.responseText);
    if (response?.data?.actions) {
      response.data.actions.copy = 1;  // 启用复制
    }
    Object.defineProperty(this, 'responseText', {
      value: JSON.stringify(response),
    });
  });
  return rawOpen.call(this, method, url, ...);
};
```

### Layer 2: Fetch 权限响应改写

**原理**：新版飞书可能使用 `fetch` API 替代 `XMLHttpRequest` 进行权限请求。我们在 `window.fetch` 上做同样的响应改写。

**安全设计**：
- 仅拦截 `Content-Type: application/json` 的 200 响应
- 仅处理匹配权限端点的 URL
- 非匹配请求 100% 透明透传（不修改、不延迟）
- 所有异常静默降级

```typescript
window.fetch = async function (input, init) {
  const response = await rawFetch(input, init);
  // 快速过滤：非 200、非 JSON、非权限端点 → 直接透传
  if (response.status !== 200) return response;
  if (!response.headers.get('content-type')?.includes('json')) return response;
  if (!urlStr.includes('permission/document/actions')) return response;
  // 修改 JSON 中的 permissions 字段...
  return new Response(modifiedBody, {
    status: response.status,
    headers: response.headers,
  });
};
```

### Layer 3: Event.prototype.preventDefault Hook

**原理**：飞书在 `contextmenu` 事件上调用 `e.preventDefault()` 阻止浏览器原生右键菜单。我们 hook 原型方法，仅对 `type === 'contextmenu'` 的事件忽略 `preventDefault`。

```typescript
const rawPreventDefault = Event.prototype.preventDefault;
Event.prototype.preventDefault = function () {
  if (this.type === 'contextmenu') return;  // 放行右键菜单
  return rawPreventDefault.call(this);
};
```

### Layer 4: 事件级兜底拦截

**原理**：在捕获阶段（capture phase）用 `stopImmediatePropagation()` 阻止飞书的 `copy`/`cut`/`selectstart` 事件处理器执行，并从 `window.getSelection()` 手动提取文本写入剪贴板。

**设计考量**：
- 这是**最后兜底**——当 Layer 1/2 的权限改写无法生效时，至少保证基本文本复制可用
- 注册在捕获阶段（`addEventListener(..., true)`）确保早于飞书的冒泡阶段处理器
- 无法保留富文本/表格格式（因为飞书的格式化复制依赖其自身 `copy` handler）
- 可考虑未来做成可选开关

---

## 四、关键问题与解决方案

### 问题 1：首次加载页面无限 loading + 鼠标失能

**现象**：安装扩展后，飞书页面持续显示加载中，无法进行任何操作。

**根因**：最初版本的 `window.fetch` hook 覆盖了所有 fetch 请求（包括 CSS/JS/图片等资源加载），导致飞书的资源请求被干扰，React 应用无法完成初始化。

**解决**：
1. 限制 fetch hook 的拦截范围：仅处理 `Content-Type: application/json` + HTTP 200 + 匹配权限端点的请求
2. 非目标请求无条件透传，零延迟
3. 所有异常静默降级，不抛出

### 问题 2：`document_start` 时机 CSS 注入失败导致文本不可选

**现象**：首次加载时文本无法选中，但刷新后可能恢复。

**根因**：Content script 在 `document_start` 时运行，此时 `document.head` 可能尚未构建完毕，`appendChild(styleElement)` 失败。

**解决**：`safeApplyStyles()` 函数通过 `requestAnimationFrame` 轮询等待 `document.head` 就绪后才注入 CSS。

```typescript
function safeApplyStyles(): void {
  if (!document.head) {
    requestAnimationFrame(safeApplyStyles);
    return;
  }
  applyAllStyles(config);
}
```

### 问题 3：Ctrl+C 无法复制（仅有 CSS + XHR hook 时）

**现象**：文本可选中、右键菜单出现，但 Ctrl+C 和右键→复制均无效。

**根因**：仅靠 XHR hook 改写权限响应不足以解除复制——飞书的前端 `copy` 事件处理器在权限位为 0 时，仍会调用 `e.preventDefault()` 阻止复制。

**解决**：添加 Layer 4 事件级兜底——在捕获阶段拦截 `copy`/`cut` 事件，手动从 Selection API 提取文本写入剪贴板。

### 问题 4：不同类型的 API 请求需要不同策略

**现象**：早期的单 XHR hook 方案有时有效、有时无效。

**根因**：飞书在不同版本/不同模块中可能混用 `XMLHttpRequest` 和 `fetch` API。

**解决**：同时 hook XHR 和 fetch，覆盖两种传输方式。fetch hook 采用安全版设计（仅 JSON 响应拦截），避免干扰资源加载。

---

## 五、项目结构

```
feishu-copy-extension/
├── entrypoints/                    # WXT 入口点（自动映射到 manifest）
│   ├── background.ts               # Service Worker
│   ├── content.ts                  # ISOLATED world 内容脚本
│   ├── main-world.content.ts       # MAIN world 内容脚本
│   └── popup/                      # 弹出面板
│       ├── index.html
│       ├── main.ts                 # Vue 挂载入口
│       └── App.vue                 # 开关面板组件
├── src/
│   ├── hooks/
│   │   ├── xhr-permission.ts       # XHR + Fetch 权限改写
│   │   └── prevent-default.ts      # Event.prototype hook
│   ├── styles/
│   │   └── inject-css.ts           # CSS 注入引擎
│   ├── features/                   # (预留) 增强功能
│   └── utils/
│       ├── storage.ts              # chrome.storage 封装
│       └── logger.ts               # 调试日志
├── wxt.config.ts                   # WXT 构建配置
├── tsconfig.json                   # TypeScript 配置（继承 WXT）
├── env.d.ts                        # Vue SFC 类型声明
├── package.json
├── TECH.md                         # 本文档
├── README.md                       # 使用文档
└── TEST.md                         # 测试方案
```

### 构建产物

```
.output/chrome-mv3/
├── manifest.json                   # 自动生成的 Manifest V3
├── background.js                   # Service Worker (10.89 kB)
├── popup.html                      # 弹出面板 HTML
├── content-scripts/
│   ├── content.js                  # ISOLATED world (18.5 kB)
│   └── main-world.js               # MAIN world (4.07 kB)
├── chunks/
│   └── popup-*.js                  # Vue 运行时 (67.6 kB)
└── assets/
    └── popup-*.css                 # 面板样式 (2.5 kB)
```

---

## 六、开发指南

### 环境要求

- Node.js ≥ 18
- npm ≥ 9

### 常用命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 类型检查
npm run typecheck

# 构建 Firefox 版本
npm run build:firefox

# 打包 zip（上架用）
npm run zip
```

### 加载到浏览器

1. 执行 `npm run build`
2. Chrome 打开 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `.output/chrome-mv3/` 目录

### 调试

- **MAIN world 日志**：飞书页面 F12 → Console → 查找 `[飞书复制助手·MAIN]`
- **ISOLATED world 日志**：同上，查找 `[飞书复制助手]`（需在 Popup 中开启调试日志）
- **Service Worker 日志**：`chrome://extensions/` → 点击「Service Worker」链接
- **验证权限改写**：F12 → Network → 搜索 `actions/state` → 查看 Response 中的 `actions.copy`

---

## 七、技术债务与改进方向

### 已知限制

| 限制 | 原因 | 改进方向 |
|------|------|----------|
| 复制为纯文本 | Layer 4 事件兜底截断了飞书格式化 handler | 实现「保留表格格式」模式——检测权限改写成功后不拦截 copy 事件 |
| 图片无法复制 | 未实现图片下载/复制逻辑 | 添加图片悬停下载按钮 |
| 无 Markdown 导出 | 未实现 | 添加 Shift+Ctrl+C 复制为 Markdown |
| 配置不共享到 MAIN world | ISOLATED/MAIN world 之间无法直接通信 | 通过 `postMessage` 或 chrome.storage 桥接 |

### 未来功能

- [ ] 保留表格格式模式（权限改写成功时不拦截 copy 事件）
- [ ] 图片悬停下载按钮
- [ ] 外链自动新标签打开
- [ ] 复制为 Markdown（Ctrl+Shift+C）
- [ ] 飞书页面全宽模式
- [ ] Firefox 支持验证

---

## 八、参考

- [BlueSkyXN/feishu-toolkit](https://github.com/BlueSkyXN/feishu-toolkit) — Tampermonkey 脚本，最完整的飞书增强参考实现
- [WXT Framework](https://wxt.dev) — 现代浏览器扩展开发框架
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome `world: "MAIN"`](https://developer.chrome.com/docs/extensions/reference/api/scripting#type-ExecutionWorld) — Content Script 运行在页面主上下文
