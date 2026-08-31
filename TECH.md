# 飞书复制助手 — 技术文档

> 最后更新：2026-08-31（经线上实测全面修订，反映真实飞书机制与现行实现）

## 一、背景：飞书的复制保护机制（实测修正版）

飞书网页端采用多层防御体系禁止未授权复制：

```
CSS 层:   user-select: none !important  阻止文本选中
          水印图层（fixed + 高 z-index）覆盖文档区域

事件层:   contextmenu   preventDefault()  禁用右键菜单
          copy/cut      捕获阶段 stopImmediatePropagation() 掐死事件（2026-08-31 实测）
          selectstart   阻止文本选择
          keydown       拦截 Ctrl+S / Ctrl+P 等浏览器快捷键

权限层:   不止一个闸口（2026-08-31 实测修正）:
          - space/api/suite/permission/document/actions/state/   文档权限
          - space/api/wiki/v2/perm/space/?wiki_actions=can_copy_content  知识库权限
          仅改写前者时，飞书 copy handler 仍会拦截并弹「无权限」toast

选区层:   表格跨单元格拖选时，飞书折叠原生 Selection（anchor=BODY），
          改用 overlay 渲染选中态（每个选中 td 插入 div.selected-mask），
          浏览器原生复制拿不到任何内容

图片层:   图片以 blob: URL 或鉴权的 drive-stream URL 渲染，
          保存的 HTML/PDF 中图片无法直接访问（加密 + 需会话）
```

## 二、架构概览

```
Chrome Extension (Manifest V3)
框架: WXT 0.19 + Vue 3 + TypeScript

  Background Service Worker（defineBackground）
  - 配置初始化、GET_CONFIG / SAVE_CONFIG（merge 写入）/ RELOAD_TAB 消息路由

  Content Script (ISOLATED world)
  - CSS 注入、持续加固、Popup 通信
  - 配置桥接发送端（chrome.storage → window.postMessage → MAIN world）
  - Markdown 整篇导出（虚拟滚动逐屏收集）

  Content Script (MAIN world)
  - 运行时状态 mainState（桥接配置 + permissionRewritten + configReady 门控）
  - XHR / Fetch 权限改写
  - preventDefault hook（contextmenu 放行）
  - copy/cut 事件接管（缴械 + 原生复制 + 表格 overlay 重建）
  - keydown 缴械（Ctrl+S / Ctrl+P 放行）

  Popup (Vue 3)
  - 开关控制面板（7 开关 + 导出 Markdown 按钮）
  - chrome.storage.sync 持久化（GET_CONFIG 带 2s 超时兜底）
```

### 为什么需要两个 Content Script？

| 考量 | ISOLATED world | MAIN world |
|------|---------------|------------|
| 访问页面原型链 | 否 | 是 |
| 访问 chrome.storage | 是 | **否**（页面全局里没有扩展 API，必须桥接） |
| 安全性 | 高（与页面 JS 隔离） | 中（共享上下文） |
| 适合任务 | CSS 注入、DOM 监听、存储读写 | XHR/Fetch/Event 原型 hook |

Chrome 111+ 的 manifest content_scripts 支持 `world: "MAIN"`，WXT 通过 `defineContentScript({ world: 'MAIN' })` 声明。

### 配置桥接（2026-08-31 新增）

MAIN world 无法访问 chrome.storage，配置通过 `window.postMessage` 桥接：

- ISOLATED → MAIN：`{ source: 'feishu-copy-bridge', type: 'CONFIG_SYNC', config }`（加载时、变更时推送）
- MAIN → ISOLATED：`{ type: 'REQUEST_CONFIG' }`（启动时主动拉取，防消息丢失）
- **竞态门控**：`mainState.configReceived` 未就绪前，XHR/Fetch 权限改写挂起等待 `configReady`，避免刷新瞬间按默认值误改写（开关关闭仍生效的 bug）

事件级 hook 在事件发生时实时读取 `mainState`，因此右键开关、复制兜底门控均无需刷新即可热切换。

## 三、五层解禁策略（现行实现）

### Layer 1: XHR 权限响应改写

hook `XMLHttpRequest.prototype.open`，监听匹配权限端点的请求，响应就绪时将 `actions.copy/download/export/print` 置 1，通过 `Object.defineProperty` 覆盖 responseText/response。改写成功后置 `mainState.permissionRewritten = true`（供 Layer 4 智能调度）。配置未就绪时挂起等待（见竞态门控）。

### Layer 2: Fetch 权限响应改写（安全版）

三级过滤：仅 HTTP 200 + `application/json` + 权限端点，非匹配请求 100% 透明透传。配置未就绪时 `await configReady`（fetch 链路 Promise 化，时序天然安全）。

### Layer 3: Event.prototype.preventDefault hook

仅放行 contextmenu 的 preventDefault，恢复浏览器原生右键菜单（含「复制图片」「图片另存为」——图片复制能力即由此免费获得，blob: 图片同样适用）。支持 `setPreventDefaultHookActive()` 热切换。

### Layer 4: copy/cut 事件接管（2026-08-31 重构）

飞书在捕获阶段 `stopImmediatePropagation` 掐死 copy 事件，document 冒泡兜底永远执行不到。现行架构在 **window 捕获阶段（传播最前端）**分模式处理：

- **放行模式**（keepTableFormat 开 + 权限已改写）：
  1. `neutralizeEvent()` — 将事件实例的 preventDefault/stopPropagation/stopImmediatePropagation 无效化 → 飞书 handler 变成空拳
  2. 预填 text/plain 兜底（若最终未被取消则忽略，被取消则生效）
  3. 用**原型方法** `Event.prototype.stopImmediatePropagation.call(e)` 掐断传播 → 飞书 handler 不执行，「无权限」toast 消除
  4. 浏览器原生复制接管：选区序列化为 text/html，表格/富文本格式天然保留
- **纯文本模式**（keepTableFormat 关或权限未改写）：stopImmediatePropagation + 手写 text/plain
- **表格跨单元格选区**（原生 Selection 为空 + 存在 `.selected-mask`）：按 TR 分组重建 `<table>` HTML + TSV 纯文本写入剪贴板，stopImmediatePropagation（同时掐死 toast）
- **document 冒泡检查**：放行模式下若飞书仍使事件被取消且剪贴板为空，补写纯文本（最终兜底）

### Layer 5: keydown 缴械（原生保存）

window 捕获阶段对 Ctrl+S / Ctrl+P 的 keydown 事件做同样的实例缴械，飞书的 preventDefault 失效，浏览器原生「另存为」「打印」对话框恢复。

## 四、关键问题与解决方案

### 问题 1：Service Worker 注册失败（status code 15）+ Popup 永远「加载中」

根因：`background.ts` 使用 `export default {}`，WXT 包装器调用 `undefined.main()` 启动即抛 TypeError。症状隐蔽：content scripts 完全正常，仅 SW 依赖路径失效，且 popup 的 sendMessage 永不返回。

解决：改用 `defineBackground({ main() {...} })`；popup GET_CONFIG 增加 2s 超时兜底直读 storage。

### 问题 2：配置变更把其他开关重置为默认值

根因：popup 只发送变更的键，background 却把它当全量配置整体覆写。

解决：SAVE_CONFIG 先 load 再 merge 后写入；popup 改用 `:checked` + 显式读取 DOM 新值（避免 v-model 与 @change 监听顺序导致存旧值）。

### 问题 3：关闭「解除复制」刷新后仍可复制

根因：MAIN world 默认配置 bypassCopy=true，配置桥接是异步的，刷新瞬间飞书权限请求可能先于桥接消息到达，hook 按默认值误改写。

解决：`configReady` 竞态门控（见配置桥接）。另注：若文档本身允许复制（公开文档+有权限），关闭开关后"依旧可复制"是**正确行为**——开关语义是解除限制，不是反向禁止。

### 问题 4：表格跨单元格复制为空 + 「无权限」toast

根因：飞书折叠原生 Selection 并用 overlay 渲染选中态；其 copy handler 在捕获阶段掐死事件。

解决：见 Layer 4（overlay 重建 + window 捕获缴械 + 原型方法掐断）。

### 问题 5：Markdown 导出只有当前屏幕内容

根因：飞书虚拟滚动，只挂载可视区附近的块。

解决：导出时从顶部按 0.8 屏步长滚到底部，逐屏**克隆**内容块（快照防虚拟列表回收串位），按键（data-block-id 或内容哈希）去重，转换后恢复滚动位置。

### 问题 6：fetch hook 导致页面无限 loading（历史）

根因：最初版本覆盖所有请求，干扰飞书资源加载。

解决：仅 JSON + 200 + 权限端点，其余透传。

### 问题 7：document_start 时机 CSS 注入失败（历史）

根因：document.head 尚未构建。解决：rAF 轮询等待。

## 五、项目结构

```
feishu-copy-extension/
├── entrypoints/
│   ├── background.ts           Service Worker（defineBackground）
│   ├── content.ts              ISOLATED world（CSS + 加固 + 桥接发送 + MD 导出）
│   ├── main-world.content.ts   MAIN world（五层 hook + 桥接收端）
│   └── popup/                  Vue 3 面板（7 开关 + 导出 Markdown）
├── src/
│   ├── hooks/
│   │   ├── xhr-permission.ts     XHR + Fetch 权限改写（mainState 实时读取）
│   │   ├── prevent-default.ts    Event.prototype hook（可热切换）
│   │   └── main-state.ts         MAIN world 运行时状态 + 桥接协议
│   ├── styles/
│   │   └── inject-css.ts         CSS 注入引擎
│   └── utils/
│       ├── storage.ts           chrome.storage 封装
│       ├── logger.ts            调试日志（两个 world 各自实例）
│       ├── markdown.ts          DOM→Markdown 转换器
│       └── toast.ts             页面轻提示
├── scripts/
│   └── regression.ps1           自动化回归（OpenCLI，13 项断言）
├── wxt.config.ts
├── package.json
└── .output/chrome-mv3/          构建产物
```

## 六、开发

```bash
npm install          # 安装依赖
npm run dev          # 开发模式
npm run build        # 生产构建
npm run typecheck    # 类型检查（tsconfig 继承 .wxt/tsconfig.json，改动了 web 入口需先 npx wxt prepare）
```

### 回归验证

```bash
npm run build                       # 构建
# chrome://extensions 刷新扩展后：
powershell -File scripts/regression.ps1    # 13 项自动化断言（需 OpenCLI 环境）
```

人工项（真实剪贴板、toast、右键菜单、Ctrl+S/P 对话框、导出文件内容）见 [TEST.md](./TEST.md)。

### 调试

- 日志：两个 world 均输出 `[飞书复制助手]`（需在 Popup 开启调试日志，MAIN world 经桥接同步开关）
- Service Worker 日志: chrome://extensions/ 中点击 Service Worker 链接
- 验证权限改写: F12 Network 搜索 actions/state，查看 Response 中的 actions.copy

## 七、已知限制

| 限制 | 原因 |
|------|------|
| 保存物中图片不可用 | 飞书图片加密 + URL 鉴权，需解析重构（P3 后续任务） |
| 选中复制为 Markdown | 快捷键链路不可靠，已放弃（2026-08-31） |
| wiki perm/space 未改写 | 现行靠事件接管绕过，未做响应级改写 |

## 八、参考

- [BlueSkyXN/feishu-toolkit](https://github.com/BlueSkyXN/feishu-toolkit) — Tampermonkey 脚本参考
- [WXT Framework](https://wxt.dev)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
