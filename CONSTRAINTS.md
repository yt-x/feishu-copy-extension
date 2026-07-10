# 踩坑记录与约束 — 飞书复制助手

本文件记录项目开发过程中遇到的坑、技术约束、已踩过的雷，以及对应的解决方案。用于沉淀知识，避免后续开发者重复踩坑。

## 一、项目构建与配置

### 1.1 `tsconfig.json` 不能依赖 `.wxt/`

**踩坑**: 最初 `tsconfig.json` 直接 `extends: "./.wxt/tsconfig.json"`，但 `.wxt/` 是构建产物目录，清理后 TypeScript 配置会失效。

**约束**: `tsconfig.json` 必须独立存在，包含完整的 `compilerOptions`。

**现状**: 已改为独立配置，包含 WXT 和 Vue 所需类型与路径别名。

---

### 1.2 构建产物目录已清理

**踩坑**: `node_modules/`、`.output/`、`.wxt/`、`package-lock.json` 都曾留在仓库根目录，体积大且无意义。

**约束**: 根目录只保留源码和必要配置；依赖通过 `npm install` 重新安装。

**现状**: 已删除上述目录/文件，`.gitignore` 已包含它们。

---

### 1.3 去除扩展图标

**踩坑**: 项目中没有自定义图标文件，但 WXT 构建时可能会自动生成默认图标。

**约束**: 如不需要图标，需在 `wxt.config.ts` 的 manifest 中显式设置 `icons: {}`。

**现状**: 已删除 `public/icons/`，并在 `wxt.config.ts` 中配置 `icons: {}`。

---

## 二、Content Script 设计

### 2.1 必须同时 hook `XMLHttpRequest` 和 `fetch`

**踩坑**: 早期只 hook `XMLHttpRequest`，但在某些飞书页面/版本下，权限请求通过 `fetch` 发起，导致复制限制未被解除。

**约束**: 两个 transport 层都必须覆盖，且只对权限端点做响应改写，非目标请求 100% 透传。

---

### 2.2 `fetch` hook 不能拦截所有请求

**踩坑**: 最初覆盖所有 `fetch` 请求，导致飞书资源加载（CSS/JS/图片）被干扰，页面无限 loading、鼠标失能。

**约束**: `fetch` hook 必须严格过滤：仅 `HTTP 200` + `Content-Type: application/json` + URL 匹配权限端点。所有异常静默降级。

---

### 2.3 `document_start` 时注入 CSS 需要等待 `document.head`

**踩坑**: Content script 在 `document_start` 运行，此时 `document.head` 可能尚未构建，直接 `appendChild(styleElement)` 会失败。

**约束**: 使用 `requestAnimationFrame` 轮询等待 `document.head` 就绪后再注入样式。

---

### 2.4 仅改写权限响应不足以解除 Ctrl+C

**踩坑**: 即使 `actions.copy` 被改为 `1`，飞书前端仍会在 `copy` 事件上调用 `e.preventDefault()`。

**约束**: 需要在 MAIN world 添加事件级兜底：捕获阶段拦截 `copy`/`cut` 事件，并手动将 `window.getSelection()` 内容写入剪贴板。注意这会丢失富文本/表格格式。

---

### 2.5 保留表格格式与兜底复制互斥

**踩坑**: 事件兜底复制会截断飞书自身的格式化 copy handler，导致表格粘贴为纯文本。

**约束**: 「保留表格格式」开关开启时，应尽可能依赖权限层改写，避免触发事件兜底。这是一个未完全解决的取舍点。

---

## 三、World 隔离

### 3.1 ISOLATED world 无法直接访问页面原型链

**约束**: ISOLATED world 无法 hook `Event.prototype`、`XMLHttpRequest.prototype` 等页面对象。这类操作必须放在 `world: "MAIN"` 的 content script 中。

### 3.2 ISOLATED 与 MAIN world 之间无法直接通信

**约束**: 配置数据存储在 `chrome.storage` 中，两边都可以读取。若需要实时同步复杂状态，需通过 `postMessage` 或 `chrome.runtime` 消息桥接。

---

## 四、目录与文件规范

### 4.1 Manifest 配置统一在 `wxt.config.ts`

**约束**: 不要直接修改构建产物中的 `manifest.json`，所有 manifest 配置通过 `wxt.config.ts` 的 `manifest` 字段管理。

### 4.2 技术文档归档到 `docs/`

**约束**: `TECH.md`、`TEST.md` 等技术/知识文档统一放在 `docs/` 目录，根目录只保留必要文件（README、AGENTS、CONSTRAINTS、TODO、配置、源码入口）。

---

## 五、待解决约束（已知限制）

| 限制 | 原因 | 改进方向 |
|------|------|----------|
| 复制为纯文本 | 事件兜底截断了飞书格式化 handler | 实现更精确的「保留表格格式」模式 |
| 图片无法复制 | 未实现图片下载/复制逻辑 | 添加图片悬停下载按钮 |
| 无 Markdown 导出 | 未实现 | 添加 Shift+Ctrl+C 复制为 Markdown |
| 配置不共享到 MAIN world | ISOLATED/MAIN 隔离 | 通过 `postMessage` 或 `chrome.storage` 桥接 |