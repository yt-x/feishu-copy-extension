# 项目代理指南 — 飞书复制助手

本文件面向协助本项目的 AI 代理与开发者，说明项目背景、技术栈、目录结构和协作规范。

## 项目概述

飞书复制助手是一个 Chrome 浏览器扩展，用于解除飞书文档（`*.feishu.cn` 等域名）的复制、右键、文本选择限制。项目基于 WXT 框架和 Vue 3 + TypeScript 构建，采用 Manifest V3。

## 技术栈

- **框架**: [WXT](https://wxt.dev) 0.19 + Vue 3.5 + TypeScript 5.7
- **浏览器 API**: Chrome Extension Manifest V3
- **构建产物**: `.output/chrome-mv3/`
- **包管理**: npm

## 目录结构

```
feishu-copy-extension/
├── .gitignore              # Git 忽略规则
├── .omo/                   # OpenCode 工作目录（保留）
├── AGENTS.md               # 本文件
├── CONSTRAINTS.md          # 踩坑记录与约束
├── README.md               # 用户-facing 使用说明
├── TODO.md                 # 可追踪的工作事项
├── env.d.ts                # Vue SFC 类型声明
├── package.json            # 依赖与脚本
├── tsconfig.json           # TypeScript 配置（独立，不依赖 .wxt）
├── wxt.config.ts           # WXT 构建与 manifest 配置
├── docs/                   # 技术文档归档
│   ├── TECH.md             # 技术架构与实现细节
│   └── TEST.md             # 测试方案与 checklist
├── entrypoints/            # WXT 入口点
│   ├── background.ts       # Service Worker
│   ├── content.ts          # ISOLATED world 内容脚本
│   ├── main-world.content.ts # MAIN world 内容脚本
│   └── popup/              # 扩展弹出面板
│       ├── App.vue
│       ├── index.html
│       └── main.ts
├── public/                 # 静态资源（当前为空）
└── src/                    # 源码
    ├── hooks/
    │   ├── prevent-default.ts
    │   └── xhr-permission.ts
    ├── styles/
    │   └── inject-css.ts
    └── utils/
        ├── logger.ts
        └── storage.ts
```

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 类型检查
npm run typecheck

# 打包 zip
npm run zip
```

## 开发规范

1. **TypeScript**: 启用严格模式，禁止 `as any`、`@ts-ignore`、`@ts-expect-error`。
2. **Manifest**: 通过 `wxt.config.ts` 配置，不要直接编辑生成的 `manifest.json`。
3. **Content Scripts**: 项目使用两个 content script：
   - `content.ts` 运行在 ISOLATED world，负责 CSS 注入和配置管理
   - `main-world.content.ts` 运行在 MAIN world，负责 XHR/Fetch hook 和事件拦截
4. **样式**: CSS 注入逻辑统一放在 `src/styles/inject-css.ts`。
5. **存储**: 配置持久化通过 `src/utils/storage.ts` 封装 `chrome.storage`。
6. **日志**: 调试日志通过 `src/utils/logger.ts` 控制，避免生产环境输出敏感信息。

## 修改注意事项

- 修改 `wxt.config.ts` 中的 `host_permissions` 或 `permissions` 后，需要重新构建并重新加载扩展。
- 涉及 MAIN world 的修改（`main-world.content.ts`）通常需要刷新页面生效。
- 涉及 ISOLATED world 的样式修改通常即时生效。
- 不要直接提交 `.output/`、`.wxt/`、`node_modules/`、`package-lock.json`（已清理）。

## 参考文档

- 技术架构: [docs/TECH.md](./docs/TECH.md)
- 测试方案: [docs/TEST.md](./docs/TEST.md)
- 约束踩坑: [CONSTRAINTS.md](./CONSTRAINTS.md)
- 工作事项: [TODO.md](./TODO.md)