# 飞书复制助手

解除飞书文档的复制、右键、文本选择限制，适用于 Chrome / Edge 等 Chromium 内核浏览器。

## 功能

- 解除复制限制 — Ctrl+C、右键复制均可正常工作
- 恢复右键菜单 — 检查元素、另存图片、复制链接等原生功能
- 强制文本可选 — 覆盖 user-select CSS 限制
- 去除水印 — 隐藏页面上的水印图层
- 解除拖拽限制 — 允许拖拽图片和文本（默认关闭，需手动开启）
- 可视化控制面板 — 点击扩展图标，一键开关各项功能

## 快速开始

### 直接下载（推荐）

前往 [Releases](https://github.com/yt-x/feishu-copy-extension/releases) 页面下载最新版本的 zip 文件，解压后：

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择解压后的目录

### 从源码构建

```bash
git clone https://github.com/yt-x/feishu-copy-extension.git
cd feishu-copy-extension
npm install
npm run build
# 产物在 .output/chrome-mv3/ 目录
```

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `.output/chrome-mv3/` 目录

### 打包为 zip

```bash
npm run build && npm run zip
# 产物在 .output/chrome-mv3-*.zip
```

解压后按上述步骤 1-4 加载。

### 支持的浏览器

| 浏览器 | 最低版本 | 备注 |
|--------|----------|------|
| Chrome | 102+ | 完整支持 Manifest V3 |
| Edge | 102+ | Chromium 内核，兼容 |
| Arc / 其他 Chromium | 102+ | Chromium 内核，兼容 |
| Firefox | 109+ | `npm run build:firefox` |

## 使用

1. 打开任意飞书文档（`*.feishu.cn` / `*.larksuite.com` / `*.larkoffice.com`）
2. 刷新页面（部分功能需刷新后生效）
3. 选中文本后 `Ctrl+C` 复制，或右键选择「复制」
4. 右键任意位置使用浏览器原生菜单

### 控制面板

点击浏览器工具栏的扩展图标，弹出设置面板：

| 开关 | 功能 | 生效方式 |
|------|------|----------|
| 解除复制限制 | 通过改写权限响应启用复制 | 需刷新页面 |
| 解除右键限制 | 恢复浏览器原生右键菜单 | 即时生效 |
| 强制文本可选 | 覆盖 CSS，允许选中所有文本 | 即时生效 |
| 去除水印 | 隐藏水印图层 | 即时生效 |
| 解除拖拽限制 | 允许拖拽图片和文本 | 即时生效 |
| 保留表格格式 | 不拦截飞书格式化复制处理器 | 需刷新页面 |
| 调试日志 | 在控制台输出运行信息 | 即时生效 |

## 常见问题

**安装后复制仍然不生效？**

刷新飞书页面（F5）。复制限制和表格格式两个开关需要页面刷新后生效。

**如何确认扩展已生效？**

打开飞书文档，F12 打开 Console，执行：

```javascript
console.log(window.__FEISHU_COPY_LOADED ? '已加载' : '未加载');
```

**复制表格到 Excel 后格式丢失？**

当前版本默认为纯文本复制。请确保「保留表格格式」已开启并刷新页面。如仍丢失格式，说明飞书权限改写未完全生效，属于已知限制。

**页面加载异常？**

关闭控制面板中所有开关，刷新飞书页面，然后逐一重新开启各开关进行排查。

## 开发

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（热重载）
npm run build        # 生产构建
npm run typecheck    # TypeScript 类型检查（需先 build 生成类型）
npm run zip          # 打包 zip
npm run build:firefox  # Firefox 构建
```

相关文档：[技术架构](./TECH.md) · [踩坑约束](./CONSTRAINTS.md) · [测试方案](./TEST.md) · [待办事项](./TODO.md)

## 许可

MIT License

---

本扩展仅应在你有权限访问的文档上使用，请遵守企业信息安全策略和相关法律法规。
