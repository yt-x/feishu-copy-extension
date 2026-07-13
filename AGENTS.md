# 项目代理指南 — 飞书复制助手

本文件面向协助本项目的 AI 代理与开发者，说明项目背景、技术栈、目录结构和协作规范。

## 项目概述

飞书复制助手是一个 Chrome 浏览器扩展，用于解除飞书文档（`*.feishu.cn` 等域名）的复制、右键、文本选择限制。项目基于 WXT 框架和 Vue 3 + TypeScript 构建，采用 Manifest V3。

核心策略为**四层复制解禁**：
1. **XHR 权限响应改写** — 拦截 XMLHttpRequest 权限 API
2. **Fetch 权限响应改写** — 拦截 fetch 权限 API（安全版，仅 JSON + 权限端点）
3. **Event.prototype.preventDefault hook** — 放行右键菜单
4. **copy/cut 事件级兜底** — 捕获阶段 stopImmediatePropagation + 手动 Selection→Clipboard

## 技术栈

- **框架**: [WXT](https://wxt.dev) 0.19 + Vue 3.5 + TypeScript 5.7
- **浏览器 API**: Chrome Extension Manifest V3
- **构建产物**: `.output/chrome-mv3/`
- **包管理**: npm

## 目录结构

```
feishu-copy-extension/
├── AGENTS.md               # 本文件 — 开发者与 AI 代理指南
├── README.md               # 用户-facing 使用说明
├── TECH.md                 # 技术架构、难点与实现细节
├── TEST.md                 # 测试方案与 checklist
├── CONSTRAINTS.md          # 踩坑记录与约束
├── TODO.md                 # 可追踪的工作事项
├── .gitignore              # Git 忽略规则
├── env.d.ts                # Vue SFC + WXT 类型声明
├── package.json            # 依赖与脚本
├── tsconfig.json           # 继承 .wxt/tsconfig.json
├── wxt.config.ts           # WXT 构建与 manifest 配置
├── entrypoints/            # WXT 入口点（自动映射到 manifest）
│   ├── background.ts       # Service Worker（配置初始化、消息路由）
│   ├── content.ts          # ISOLATED world 内容脚本（CSS 注入 + 持续加固）
│   ├── main-world.content.ts # MAIN world 内容脚本（四层 hook）
│   └── popup/              # 扩展弹出面板（Vue 3）
│       ├── App.vue         # 开关控制面板组件
│       ├── main.ts         # Vue 挂载入口
│       └── index.html      # 面板入口 HTML
├── src/                    # 源码
│   ├── hooks/
│   │   ├── xhr-permission.ts   # XHR + Fetch 权限响应改写
│   │   └── prevent-default.ts  # Event.prototype hook
│   ├── styles/
│   │   └── inject-css.ts       # CSS 注入引擎
│   └── utils/
│       ├── logger.ts           # 调试日志控制
│       └── storage.ts          # chrome.storage 封装
└── public/                 # 静态资源目录（当前为空，无自定义图标）
```

## 常用命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（热重载）
npm run build        # 生产构建，输出到 .output/chrome-mv3/
npm run typecheck    # TypeScript 类型检查
npm run zip          # 打包 zip（上架用）
npm run build:firefox  # Firefox 构建
npm run zip:firefox    # Firefox 打包
```

## 开发规范

1. **TypeScript**: 严格模式。禁止 `as any`（可用 `as unknown as Type` 代替）、`@ts-ignore`、`@ts-expect-error`。
2. **Manifest**: 通过 `wxt.config.ts` 配置，不要直接编辑生成的 `manifest.json`。
3. **Content Scripts**: 项目使用两个 content script，运行在不同 JavaScript world：
   - `content.ts` → **ISOLATED world** — 负责 CSS 注入（user-select 覆盖、水印移除、拖拽解除）、持续加固（MutationObserver + rAF）、Pop 面板通信
   - `main-world.content.ts` → **MAIN world** — 负责 XHR/Fetch 权限改写、preventDefault hook、copy/cut 事件兜底拦截。必须运行在 MAIN world 才能访问 `Event.prototype`、`XMLHttpRequest.prototype`
4. **样式**: CSS 注入逻辑统一在 `src/styles/inject-css.ts`，通过 `injectStyle(id, css)` 注入，通过 `removeStyle(id)` 移除。
5. **存储**: 配置持久化通过 `src/utils/storage.ts` 封装 `chrome.storage.sync`。默认配置在 `DEFAULT_CONFIG` 常量中定义。
6. **日志**: 调试日志通过 `src/utils/logger.ts` 控制，需在 Popup 中开启「调试日志」开关才会输出。生产环境禁止输出敏感信息。
7. **错误处理**: 所有 hook 安装操作必须包裹 try-catch，失败时静默降级，绝不阻断飞书页面加载。

## MAworld 修改注意事项

| 修改范围 | 生效方式 | 说明 |
|----------|----------|------|
| `wxt.config.ts`（permissions/host_permissions） | 重新构建 + 重新加载扩展 | 权限变更需要浏览器重新授权 |
| `main-world.content.ts`（XHR/Fetch/事件 hook） | 刷新飞书页面 | MAIN world 脚本在页面加载时执行 |
| `content.ts`（CSS 注入） | 即时生效（部分需刷新） | ISOLATED world 的样式修改通常即时生效 |
| `popup/App.vue`（面板 UI） | 关闭面板后重新打开 | Popup 每次打开都会重新挂载 Vue 组件 |
| `background.ts`（Service Worker） | 重新加载扩展 | Service Worker 在扩展加载时启动 |

## 架构决策记录

### 为什么需要两个 Content Script？

| 考量 | ISOLATED world | MAIN world |
|------|---------------|------------|
| 访问页面原型链 | 否 | 是 |
| 访问 chrome.storage | 是 | 是 |
| 安全性 | 高（与页面 JS 隔离） | 中（共享上下文） |
| 适合任务 | CSS 注入、DOM 监听 | XHR/Fetch/Event 原型 hook |

Chrome 102+ 支持 `world: "MAIN"` 参数，WXT 通过 `defineContentScript({ world: 'MAIN' })` 声明。

### 为什么不直接拦截所有 copy 事件？

飞书的表格/富文本复制依赖其自身的 `copy` 事件处理器写入 HTML 剪贴板（如复制表格到 Excel 保留格式）。如果在事件层面粗暴拦截，会丢失富文本格式。当前策略是：
   - Layer 1/2 成功: 权限改写使飞书原生 handler 正常工作（带格式）
   - Layer 1/2 失败: Layer 4 事件兜底保证纯文本复制可用

## 参考文档

-  技术架构: [TECH.md](./TECH.md)
-  测试方案: [TEST.md](./TEST.md)
-  踩坑约束: [CONSTRAINTS.md](./CONSTRAINTS.md)
-  工作事项: [TODO.md](./TODO.md)
