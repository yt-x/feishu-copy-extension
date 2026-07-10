# 项目待办事项 — 飞书复制助手

本文件用于记录项目的工作项，方便 AI 代理在不同会话、模型或终端之间继承上下文，继续推进项目。

> 最后更新: 2026-07-10

## 当前状态

- 项目根目录已规整，技术文档已归档到 `docs/`
- 项目级 `AGENTS.md`、`CONSTRAINTS.md`、`TODO.md` 已创建
- 无效依赖目录和构建产物已清理
- 扩展图标已去除（`wxt.config.ts` 中 `icons: {}`）
- `tsconfig.json` 已改为独立配置，不再依赖 `.wxt/`

---

## 待办事项

### 高优先级

- [ ] 安装依赖并验证构建 (`npm install` & `npm run build`)
- [ ] 运行类型检查，确认无类型错误 (`npm run typecheck`)
- [ ] 补充扩展图标或确认无图标构建产物正常
- [ ] 验证 WXT 配置中 `icons: {}` 不会导致构建失败

### 中优先级

- [ ] 审查 `src/` 和 `entrypoints/` 代码，清理未使用的功能开关
- [ ] 完善事件兜底复制与「保留表格格式」的互斥逻辑
- [ ] 补充自动化测试或至少可手动执行的验证脚本
- [ ] 考虑添加 `.env` 或配置模板（如果需要）

### 低优先级

- [ ] 考虑为 `public/` 目录添加说明或默认占位文件
- [ ] 更新 `docs/TECH.md` 中关于 `public/icons/` 的残留描述（如果存在）
- [ ] 整理 `docs/TEST.md` 中的测试矩阵，标记已验证项
- [ ] 考虑发布到 Chrome Web Store 的准备工作

---

## 已完成事项

- [x] 清理 `node_modules/`、`.output/`、`.wxt/`、`package-lock.json`
- [x] 修复 `tsconfig.json` 独立配置
- [x] 归档 `TECH.md`、`TEST.md` 到 `docs/`
- [x] 去除项目中的所有 icon（删除 `public/icons/` 并配置 `icons: {}`）
- [x] 简化 `README.md`
- [x] 创建 `AGENTS.md`
- [x] 创建 `CONSTRAINTS.md`
- [x] 创建 `TODO.md`（本文件）

---

## 会话继承提示

如果你是新会话或新模型，请优先阅读以下文件以恢复上下文：

1. [AGENTS.md](./AGENTS.md) — 项目级指南和目录结构
2. [CONSTRAINTS.md](./CONSTRAINTS.md) — 已知踩坑和技术约束
3. [README.md](./README.md) — 用户-facing 使用说明
4. [docs/TECH.md](./docs/TECH.md) — 技术架构细节
5. [docs/TEST.md](./docs/TEST.md) — 测试方案

继续工作前，建议先运行：

```bash
npm install
npm run typecheck
```

以确认当前代码状态是否健康。