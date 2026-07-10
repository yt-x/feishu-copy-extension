# 飞书复制助手 - 测试方案

## 一、安装验证

### 1.1 加载扩展
```
1. 打开 Chrome，访问 chrome://extensions/
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择目录: feishu-copy-extension\.output\chrome-mv3\
5. 确认扩展卡片出现，名称为「飞书复制助手」
```

### 1.2 基础检查
- [ ] 扩展图标显示在浏览器工具栏
- [ ] 点击图标弹出配置面板，显示 7 个开关
- [ ] 开关默认状态：复制✅ 右键✅ 选择✅ 水印✅ 拖拽❌ 表格格式✅ 调试❌
- [ ] 访问 `chrome://extensions/` → 扩展详情 → 无错误日志

---

## 二、核心功能测试（分项验证）

> 测试前确保每个开关独立测试（其他开关保持不变），刷新飞书页面后执行。

### 2.1 解除复制限制 (bypassCopy)

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 关闭「解除复制限制」，保存并刷新页面 | 无法复制文档内容 |
| 2 | 打开「解除复制限制」，保存并刷新页面 | 可以选中文本并 Ctrl+C 复制 |
| 3 | 选中表格内容 → Ctrl+C → 粘贴到 Excel | 表格格式保留（非纯文本） |
| 4 | 选中富文本（加粗/颜色/链接）→ Ctrl+C → 粘贴到飞书文档 | 富文本格式保留 |
| 5 | 打开 DevTools → Network → 搜索 `actions/state` → 查看响应 | `actions.copy` 应为 `1` |

**验证脚本**（在 DevTools Console 执行）：
```javascript
// 检查 XHR hook 是否生效
(function check() {
  // 发起一个测试请求看响应
  console.log('[TEST] 检查扩展是否加载:',
    typeof XMLHttpRequest.prototype.open !== 'undefined' ? '✅' : '❌');
  
  // 检查飞书权限
  const perfEntry = performance.getEntriesByType('resource')
    .find(r => r.name.includes('actions/state'));
  console.log('[TEST] 权限请求:', perfEntry ? '✅ 已发起' : '⏳ 等待中（刷新后重试）');
})();
```

### 2.2 解除右键限制 (bypassContextMenu)

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 默认状态下在文档正文区域右键 | 弹出浏览器原生右键菜单 |
| 2 | 在图片上右键 | 第一次可能不出现，稍等或再右键一次 |
| 3 | 关闭「解除右键限制」 | 右键无反应或被拦截 |
| 4 | 重新开启 | 即时生效，无需刷新 |

### 2.3 强制文本可选 (bypassUserSelect)

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 默认状态下鼠标拖选文档正文 | 文本可选中（蓝色高亮） |
| 2 | 选中导航栏/侧边栏文字 | 也可选中 |
| 3 | 关闭开关 | 文本无法选中（即时生效） |
| 4 | 打开开关 | 文本恢复可选（即时生效） |
| 5 | 在 DevTools Elements 面板检查 | 无 `user-select: none` 样式残留 |

### 2.4 去除水印 (removeWatermark)

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 默认状态下查看飞书文档 | 无水印文字/图案覆盖 |
| 2 | 关闭「去除水印」 | 水印出现（即时生效） |
| 3 | 打开开关 | 水印消失（即时生效） |
| 4 | 在 DevTools 中搜索 `watermark` | 相关元素的 `background-image` 被覆盖 |

**验证脚本**：
```javascript
console.log('[TEST] 水印元素统计:',
  document.querySelectorAll('[class*="watermark"]').length,
  '个（应被隐藏）');
```

### 2.5 保留表格格式 (keepTableFormat)

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 默认状态下复制飞书表格 | 粘贴到 Excel 格式正常 |
| 2 | 关闭「保留表格格式」，刷新 | 粘贴为纯文本（无表格） |
| 3 | 重新开启 | 表格格式恢复 |

### 2.6 解除拖拽限制 (bypassDrag)

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 打开「解除拖拽限制」 | 即时生效 |
| 2 | 鼠标拖拽页面中的图片 | 图片可拖出浏览器窗口 |

### 2.7 调试日志 (debug)

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 打开「调试日志」 | 即时生效 |
| 2 | 打开 DevTools Console | 看到 `[飞书复制助手]` 开头的蓝色日志 |
| 3 | 刷新页面 | 看到启动日志和 hooks 安装日志 |
| 4 | 关闭开关 | 日志停止输出 |

---

## 三、兼容性矩阵测试

### 3.1 域名覆盖

| 域名 | 测试状态 | 备注 |
|------|----------|------|
| `*.feishu.cn` | ⬜ | 主要测试域 |
| `*.larksuite.com` | ⬜ | 海外版 |
| `*.larkoffice.com` | ⬜ | 新域名 |

### 3.2 文档类型覆盖

| 文档类型 | 普通复制 | 表格复制 | 右键 | 文本选择 | 水印 |
|----------|----------|----------|------|----------|------|
| 普通文档 | ⬜ | N/A | ⬜ | ⬜ | ⬜ |
| 表格文档 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 知识库文档 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| 思维笔记 | ⬜ | N/A | ⬜ | ⬜ | ⬜ |
| 多维表格 | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Bitable | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

### 3.3 浏览器覆盖

| 浏览器 | 状态 | 备注 |
|--------|------|------|
| Chrome 102+ | ⬜ | Manifest V3 完整支持 |
| Edge 102+ | ⬜ | Chromium 内核 |
| Arc Browser | ⬜ | Chromium 内核 |
| Firefox 109+ | ⬜ | 需 `build:firefox` |

---

## 四、边界场景测试

### 4.1 动态路由（SPA 导航）
- [ ] 在飞书内切换文档（不刷新页面）→ CSS 持续生效
- [ ] 从文档切换到知识库主页 → 扩展不崩溃
- [ ] 从主页进入文档 → hooks 在页面初始化时安装

### 4.2 加速场景
- [ ] 快速连续切换 3+ 个文档页面 → 无内存泄漏
- [ ] 在 20 秒加固期内频繁操作 → 功能正常
- [ ] 打开多个飞书标签页 → 各标签页独立工作

### 4.3 权限场景
- [ ] 自己是文档所有者 → 原生权限 + 扩展均正常
- [ ] 仅「可阅读」权限 → 扩展解开复制
- [ ] 仅「可评论」权限 → 扩展解开复制
- [ ] 匿名访问（分享链接）→ 扩展解开复制

### 4.4 降级场景
- [ ] 离线状态 → 扩展不崩溃（CSS 仍生效）
- [ ] 权限 API 请求失败 → hooks 静默失败，CSS 仍生效
- [ ] `chrome.storage` 不可用 → 使用默认配置

---

## 五、性能基准

| 指标 | 基线（无扩展） | 期望（扩展启用） | 实际 |
|------|---------------|------------------|------|
| 页面加载时间 (DOMContentLoaded) | T0 ms | ≤ T0 + 50ms | ⬜ |
| 首页可交互时间 (TTI) | T0 ms | ≤ T0 + 100ms | ⬜ |
| Content Script 执行时间 | - | < 10ms | ⬜ |
| 内存增量 | - | < 5MB | ⬜ |
| MutationObserver 开销 | - | < 1% CPU | ⬜ |

**性能测量脚本**：
```javascript
// 在扩展启用前后各执行一次
performance.mark('start');
setTimeout(() => {
  performance.mark('end');
  const measure = performance.measure('feishu-check', 'start', 'end');
  console.log('[PERF] 执行耗时:', measure.duration.toFixed(2), 'ms');
}, 0);
```

---

## 六、回归测试 Checklist

执行完整回归前，按以下顺序操作：

```
1. 重置配置 → 刷新页面
2. [ ] 复制普通文本 ✅
3. [ ] 右键菜单 ✅  
4. [ ] 文本可选 ✅
5. [ ] 水印隐藏 ✅
6. [ ] 表格复制格式保留 ✅
7. 关闭「复制限制」→ 刷新
8. [ ] 复制被禁止（飞书原生行为）❌
9. 打开「复制限制」→ 刷新
10. [ ] 复制恢复 ✅
11. 关闭所有开关 → 刷新
12. [ ] 所有增强功能关闭，页面行为与无扩展一致
13. 点击「恢复默认」→ 刷新
14. [ ] 回到默认状态 ✅
```

---

## 七、自动化验证脚本

在飞书文档页面的 DevTools Console 中执行：

```javascript
(async function runTests() {
  const results = [];
  const assert = (name, condition) => {
    results.push({ name, pass: !!condition });
    console.log(`${condition ? '✅' : '❌'} ${name}`);
  };

  // 1. 检查扩展是否注入
  assert('扩展 content script 已加载',
    document.querySelector('#__feishu_copy_user-select__') !== null ||
    window.__FEISHU_COPY_LOADED === true);

  // 2. 检查 XHR hook
  assert('XMLHttpRequest hook 存在',
    XMLHttpRequest.prototype.open.toString().includes('permission'));

  // 3. 检查 CSS 注入
  const styleEl = document.querySelector('[id*="__feishu_copy_"]');
  assert('CSS 样式已注入', styleEl !== null);

  // 4. 检查 preventDefault hook
  const pd = Event.prototype.preventDefault.toString();
  assert('preventDefault hook 已安装', pd.includes('contextmenu'));

  // 5. 检查文本可选
  const testDiv = document.createElement('div');
  testDiv.textContent = 'TEST';
  testDiv.style.cssText = 'user-select:none;-webkit-user-select:none';
  document.body.appendChild(testDiv);
  const cs = getComputedStyle(testDiv);
  const selectable = cs.userSelect === 'text' || cs.webkitUserSelect === 'text';
  document.body.removeChild(testDiv);
  assert('user-select 已覆盖', selectable);

  // 6. 检查水印隐藏
  const watermarks = document.querySelectorAll('[class*="watermark"]');
  let hidden = true;
  watermarks.forEach(w => {
    const s = getComputedStyle(w);
    if (s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0) {
      hidden = false;
    }
  });
  assert('水印已隐藏', watermarks.length === 0 || hidden);

  // 汇总
  const passed = results.filter(r => r.pass).length;
  console.log(`\n📊 测试结果: ${passed}/${results.length} 通过`);
  results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name}`));
})();
```

---

## 八、调试指南

### 8.1 查看扩展日志
1. 打开飞书文档页面
2. F12 → Console
3. 确认 popup 中「调试日志」已开启
4. 刷新页面，查找 `[飞书复制助手]` 日志

### 8.2 查看 Service Worker 日志
1. 访问 `chrome://extensions/`
2. 找到「飞书复制助手」
3. 点击「Service Worker」旁的蓝色链接
4. 在新窗口中查看 background 日志

### 8.3 验证 XHR 权限改写
1. F12 → Network → 搜索 `actions/state`
2. 点击对应请求 → Response
3. 确认 `data.actions.copy` 为 `1`

### 8.4 常见问题

| 现象 | 可能原因 | 解决方案 |
|------|----------|----------|
| 刷新后仍不能复制 | XHR hook 未生效 | 确认刷新的是飞书文档页，检查 Network 中 `actions/state` 响应 |
| 右键菜单偶尔不出现 | 飞书动态添加监听 | 再右键一次（脚本需要时间拦截） |
| 表格粘贴为纯文本 | keepTableFormat 关闭 | 打开「保留表格格式」并刷新 |
| 水印仍然可见 | CSS 选择器未覆盖 | 反馈水印元素 class/id，开发者需要更新选择器 |
| Popup 开关不生效 | 配置未保存 | 确认 popup 未报错，检查 chrome.storage |
