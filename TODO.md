# 项目待办事项 — 飞书复制助手

本文件用于记录项目的工作项，方便 AI 代理在不同会话、模型或终端之间继承上下文，继续推进项目。

> 最后更新: 2026-07-13

## 当前状态

- ✅ 项目脚手架完整，WXT + Vue 3 构建通过，零 TypeScript 错误
- ✅ 四层复制解禁架构已实现并验证：XHR + Fetch + preventDefault + 事件兜底
- ✅ 弹出面板 UI 完成，7 个功能开关 + chrome.storage 持久化
- ✅ 文档齐全：AGENTS / CONSTRAINTS / TODO / README / TECH / TEST
- ⚠️ 扩展无自定义图标（有意为之），`wxt.config.ts` 中 `icons: {}`
- ⚠️ 复制为纯文本，表格格式丢失（Layer 4 截断了飞书格式化 handler）

---

## 待办事项

### P0（核心体验）

- [ ] **保留表格格式** — 权限改写成功时不拦截 copy 事件，让飞书原生 handler 写入 HTML 剪贴板。需实现权限状态检测 + 智能事件调度

### P1（体验增强）

- [ ] **复制为 Markdown** — Ctrl+Shift+C 将选区转为 Markdown（参考 `feishu-toolkit` 的 `htmlToMarkdown()`）
- [ ] **图片悬停下载** — 悬停图片显示下载按钮，去除飞书尺寸参数拿原图
- [ ] **外链新标签打开** — 飞书域外链接自动 `target="_blank"`
- [ ] **Popup 诊断面板** — 显示 hook 状态、CSS 注入状态、权限 API 拦截状态

### P2（扩展能力）

- [ ] **Firefox 兼容性测试** — `npm run build:firefox` 后验证
- [ ] **Chrome Web Store 上架** — 准备截图、描述、隐私政策
- [ ] **多语言支持（中/英）** — 利用 WXT i18n 模块
- [ ] **不可见元素清理** — 清理 `public/icons/`、`src/features/` 等空目录或创建占位

### P3（未来）

- [ ] 配置导入/导出 JSON
- [ ] 自定义站点白名单
- [ ] 页面性能影响监控
- [ ] 核心 hook 单元测试

---

## 已完成事项

- [x] 项目脚手架（WXT + Vue 3 + TS）
- [x] XHR 权限响应改写 hook
- [x] Fetch 权限响应改写 hook（安全版：JSON + 端点过滤）
- [x] Event.prototype.preventDefault hook（右键菜单放行）
- [x] copy/cut 事件级兜底（捕获阶段 + Selection→Clipboard）
- [x] CSS 注入（user-select / watermark / drag）+ 持续加固
- [x] 弹出面板 UI（7 开关 + storage 持久化）
- [x] Service Worker（配置初始化 + 消息路由）
- [x] TypeScript 零错误 + 构建通过
- [x] 文档：README / TECH / TEST / AGENTS / CONSTRAINTS / TODO
- [x] .gitignore 配置完成

---

## 会话继承提示

恢复上下文请读取（按优先级）：

1. [AGENTS.md](./AGENTS.md) — 项目结构、技术栈、开发规范
2. [TECH.md](./TECH.md) — 四层架构详解、技术难点
3. [CONSTRAINTS.md](./CONSTRAINTS.md) — 踩坑记录与约束
4. [TEST.md](./TEST.md) — 测试 checklist
5. [README.md](./README.md) — 用户使用说明

```bash
# 确认代码状态
npm install && npm run typecheck && npm run build
```