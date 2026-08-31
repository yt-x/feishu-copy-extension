# 项目待办事项

记录项目工作项，方便在不同会话间继承上下文。

> 最后更新: 2026-08-31（经设计访谈定案，见文末「目标口径」）

## 目标口径（2026-08-31 定案）

「目标功能完成」= 以下全部通过 [TEST.md](./TEST.md) 人工验收：

1. 复制粘贴全部解除（文本 + 富文本/表格格式保留）
2. **图片可直接复制到剪贴板**（路线：先侦察飞书图片渲染方式 → ClipboardItem 写入，失败兜底为下载）
3. **文档可保存到本地** = 整篇导出 Markdown 文件 + 选中内容复制为 Markdown（图片保留原始 URL）+ 恢复原生 Ctrl+S 另存为、Ctrl+P 打印为 PDF

## 当前状态（2026-08-31 源码审计结论）

- [x] 四层复制解禁架构已实现：XHR + Fetch + preventDefault + 事件兜底
- [x] CSS 注入 + 持续加固、Popup UI、storage 封装、Service Worker、构建产物一致
- [ ] **G1 — MAIN world 不读配置**：`main-world.content.ts` 硬编码 `{bypassCopy:true, bypassContextMenu:true}`，Popup 的「解除复制」「解除右键」「保留表格格式」3 个开关实际无效
- [ ] **G2 — keepTableFormat 零实现 + Layer 4 无条件拦截**：表格/富文本带格式复制当前必挂
- [ ] **G3 — SAVE_CONFIG 整体覆写**：background 把单键补丁当全量配置写入，每次拨开关重置其他配置
- [ ] **G4 — Popup toggle 疑似存旧值**：`v-model` + `@change` 顺序导致持久化切换前状态（需运行时确认）

## 待办事项（按定案顺序：先 bug 后功能）

### P0 — Bug 修复（阻塞验收）

- [x] **P0-1 修复 G1**：MAIN world 配置桥接（`src/hooks/main-state.ts` + postMessage，含 REQUEST_CONFIG 回拉）✅ 2026-08-31
- [x] **P0-2 修复 G2**：keepTableFormat 智能调度 —— `shouldInterceptCopy()`：权限改写成功且保留格式时放行飞书原生 handler ✅ 2026-08-31
- [x] **P0-3 修复 G3+G4**：background SAVE_CONFIG 改为 merge；Popup 改用 `:checked` + 显式读取 DOM 新值 ✅ 2026-08-31
- [x] **P0-4 小修**：G5 bypassContextMenu 经桥接实现真正热切换（`setPreventDefaultHookActive`），徽标保持「即时生效」；G6 MAIN world 日志全部接入 debug 开关；G7 TEST.md §7 断言改大小写不敏感 ✅ 2026-08-31
- [x] **P0-6 修复 SW 注册失败**（用户实测发现）：background 改用 `defineBackground({main()})`，根除 `Status code: 15` + popup 永远「加载中」；popup 增加 2s 超时兜底直读 storage ✅ 2026-08-31
- [x] **P0-5 浏览器实测**（OpenCLI + 人工，2026-08-31）：hooks 安装、权限改写、桥接热切换、Layer 4 动态门控、表格跨单元格复制、无权限 toast 消除 —— 全部通过 ✅
  - 发现飞书真实复制闸口不止 actions/state（wiki perm/space），Layer 4 改为：window 捕获缴械事件（preventDefault/stop* 无效化）→ 浏览器原生复制带格式接管 + 纯文本预填兜底 + document 冒泡检查补写
  - 发现飞书表格跨单元格拖选会折叠原生 selection（anchor=BODY），改为从 `td .selected-mask` overlay 重建 `<table>` HTML + TSV 写入剪贴板
  - ✅ P1-0 图片侦察结论：正文图片为 `<img>` 标签（非 canvas），`internal-api-drive-stream.feishu.cn` 源，`fetch + credentials:'include'` 可获取（200, image/png, ~192KB）→ P1-1 ClipboardItem 路线可行

### P1 — 新功能（目标口径内）

- [x] **P1-0 图片侦察**（前置）：正文图片为 `<img>`（blob: 或 drive-stream URL），`fetch(+credentials)` 均可获取 ✅ 2026-08-31
- [x] **P1-1 图片复制到剪贴板**：✅ 2026-08-31 实测两条路径均通过 —— contextmenu 解禁后浏览器原生菜单的「复制图片」对正文图片和预览灯箱图片都有效（含 blob: src），「图片另存为」同理可用。无需自实现 ClipboardItem 链路；原生菜单失效的边角场景出现时再补
- [ ] **P1-2 DOM→Markdown 转换器**：供 P1-3/P1-4 共用（参考 feishu-toolkit 的 htmlToMarkdown()）
- [ ] **P1-3 整篇导出 Markdown**：Popup 增加「导出 Markdown」按钮，下载 .md 文件，图片保留原始 URL
- [ ] **P1-4 选中复制为 Markdown**：Ctrl+Shift+C 将选区转为 Markdown 写入剪贴板
- [ ] **P1-5 恢复原生保存**：keydown hook 放行 Ctrl+S / Cmd+S（另存为）与 Ctrl+P / Cmd+P（打印为 PDF）

### P1 — 原体验增强（目标口径外，保留）

- [ ] 图片悬停下载（P1-1 完成后可能冗余，届时评估）
- [ ] 外链新标签打开 — 飞书域外链接自动 target="_blank"
- [ ] Popup 诊断面板 — 显示 hook 状态、CSS 注入状态、权限 API 拦截状态

### P2 — 扩展能力

- [ ] Firefox 兼容性测试（npm run build:firefox）
- [ ] Chrome Web Store 上架准备（截图、描述、隐私政策）
- [ ] 多语言支持（中/英），利用 WXT i18n 模块
- [ ] 死代码清理（可选）：`saveConfig`、`toggleStyle`、`FEISHU_MATCHES`、RELOAD_TAB 消息分支、`scripting` 权限、空目录 public/icons/、src/features/

### P3 — 未来

- [ ] 配置导入/导出 JSON
- [ ] 自定义站点白名单
- [ ] 页面性能影响监控
- [ ] 核心 hook 单元测试

## 已完成

- [x] 项目脚手架（WXT + Vue 3 + TS）
- [x] XHR 权限响应改写 hook
- [x] Fetch 权限响应改写 hook（安全版：JSON + 端点过滤）
- [x] Event.prototype.preventDefault hook（右键菜单放行）
- [x] copy/cut 事件级兜底（捕获阶段 + Selection -> Clipboard）
- [x] CSS 注入（user-select / watermark / drag）+ 持续加固
- [x] 弹出面板 UI（7 开关 + storage 持久化）
- [x] Service Worker（配置初始化 + 消息路由）
- [x] 构建通过，无编译错误
- [x] 全部文档（AGENTS、CONSTRAINTS、TODO、README、TECH、TEST）
- [x] .gitignore 配置完成
- [x] 2026-08-31 全量源码审计 + 目标口径设计访谈定案

## 会话继承

恢复上下文请按优先级读取：

1. [AGENTS.md](./AGENTS.md) — 项目结构、技术栈、开发规范
2. [TECH.md](./TECH.md) — 四层架构详解、技术难点
3. [CONSTRAINTS.md](./CONSTRAINTS.md) — 踩坑记录与约束
4. [TEST.md](./TEST.md) — 测试 checklist（验收标准）
5. [README.md](./README.md) — 用户使用说明

```bash
npm install && npm run build
```
