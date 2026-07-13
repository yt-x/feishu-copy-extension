# 飞书复制助手

解除飞书文档的复制、右键、文本选择限制的 Chrome 浏览器扩展。

## 功能

- ✅ 解除复制限制 — Ctrl+C、右键→复制均可正常工作
- ✅ 恢复右键菜单 — 检查元素、另存图片、复制链接等原生功能
- ✅ 强制文本可选 — 覆盖 user-select CSS 限制
- ✅ 去除水印 — 隐藏页面上的水印图层
- ✅ 拖拽解除 — 允许拖拽图片和文本（可选）
- ✅ 可视化控制面板 — 点击扩展图标，一键开关各项功能

## 安装

### 方式一：从源码构建

```bash
git clone <repo-url>
cd feishu-copy-extension
npm install
npm run build
# 产物在 .output/chrome-mv3/ 目录
```

然后：

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「**开发者模式**」
3. 点击「**加载已解压的扩展程序**」
4. 选择 `.output/chrome-mv3/` 目录

### 方式二：打包为 zip

```bash
npm run build
npm run zip
# 产物在 .output/chrome-mv3-*.zip
```

解压后按方式一步骤 1-4 加载。

### 支持的浏览器

| 浏览器 | 最低版本 | 状态 |
|--------|----------|------|
| Chrome | 102+ | ✅ |
| Edge | 102+ | ✅ |
| Arc / 其他 Chromium | 102+ | ✅ |
| Firefox | 109+ | `npm run build:firefox` |

## 使用

1. 打开任意飞书文档（`*.feishu.cn` / `*.larksuite.com` / `*.larkoffice.com`）
2. **刷新页面**（部分功能需刷新后生效）
3. 选中文本 → `Ctrl+C` 复制
4. 右键任意位置 → 使用浏览器原生菜单

### 控制面板

点击浏览器工具栏的扩展图标，弹出设置面板：

| 开关 | 功能 | 即时生效 |
|------|------|----------|
| 解除复制限制 | 通过改写权限响应启用复制 | ❌ 需刷新 |
| 解除右键限制 | 恢复浏览器原生右键菜单 | ✅ |
| 强制文本可选 | 覆盖 CSS，允许选中所有文本 | ✅ |
| 去除水印 | 隐藏水印图层 | ✅ |
| 解除拖拽限制 | 允许拖拽图片和文本 | ✅ |
| 保留表格格式 | 不拦截飞书格式化复制 | ❌ 需刷新 |
| 调试日志 | 在控制台输出运行信息 | ✅ |

## 常见问题

**Q: 安装后复制仍然不生效？**
刷新飞书页面（F5）即可。复制限制和表格格式两个开关需要页面刷新后生效。

**Q: 如何确认扩展已生效？**
打开飞书文档，F12 → Console，执行：

```javascript
console.log(window.__FEISHU_COPY_LOADED ? '✅ 已加载' : '❌ 未加载');
```

**Q: 复制表格到 Excel 格式丢失？**
当前版本默认为纯文本复制。确保「保留表格格式」已开启并刷新页面。如仍丢失，说明飞书权限改写未完全生效，属于已知限制。

**Q: 页面加载异常？**
关闭控制面板中所有开关 → 刷新飞书页面 → 逐一重新开启各开关进行排查。

## 开发

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（热重载）
npm run build        # 生产构建 → .output/chrome-mv3/
npm run typecheck    # TypeScript 类型检查（需先 build 生成类型）
npm run zip          # 打包 zip
npm run build:firefox  # Firefox 构建
```

技术文档：[TECH.md](./TECH.md) · 测试方案：[TEST.md](./TEST.md) · 踩坑约束：[CONSTRAINTS.md](./CONSTRAINTS.md)

## 许可

MIT License

---

**注意**：本扩展仅应在你有权限访问和处理的文档上使用，请遵守企业信息安全策略和相关法律法规。
