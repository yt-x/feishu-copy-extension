# 飞书复制助手 — 测试方案

## 一、安装验证

### 加载扩展
1. Chrome 访问 chrome://extensions/
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择目录: .output/chrome-mv3/
5. 确认扩展卡片出现，名称为「飞书复制助手」

### 基础检查
- [ ] 扩展图标显示在浏览器工具栏
- [ ] 点击图标弹出配置面板，显示 7 个开关
- [ ] 默认开关状态: 复制开、右键开、选择开、水印开、拖拽关、表格格式开、调试关
- [ ] chrome://extensions/ 中扩展详情无错误日志

## 二、核心功能测试

### 2.1 解除复制限制

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 关闭开关，保存并刷新页面 | 无法复制文档内容 |
| 2 | 开启开关，保存并刷新页面 | 可选中文本并 Ctrl+C 复制 |
| 3 | 选中表格内容，复制到 Excel | 表格格式保留（非纯文本） |
| 4 | 选中富文本（加粗/颜色/链接），复制到飞书文档 | 富文本格式保留 |
| 5 | DevTools Network 搜索 actions/state | 响应中 actions.copy 为 1 |

验证脚本（Console 执行）:
```javascript
(function check() {
  console.log('[TEST] XHR hook:',
    typeof XMLHttpRequest.prototype.open !== 'undefined' ? 'OK' : 'FAIL');
  const perfEntry = performance.getEntriesByType('resource')
    .find(r => r.name.includes('actions/state'));
  console.log('[TEST] 权限请求:', perfEntry ? 'OK 已发起' : '等待中（刷新后重试）');
})();
```

### 2.2 解除右键限制

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 默认状态，在文档区域右键 | 弹出浏览器原生右键菜单 |
| 2 | 在图片上右键 | 第一次可能不出现，稍等或再右键一次 |
| 3 | 关闭开关 | 右键无反应或被拦截 |
| 4 | 重新开启 | 即时生效，无需刷新 |

### 2.3 强制文本可选

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 鼠标拖选文档正文 | 文本可选中（蓝色高亮） |
| 2 | 选中导航栏/侧边栏文字 | 也可选中 |
| 3 | 关闭开关 | 文本无法选中（即时生效） |
| 4 | 打开开关 | 文本恢复可选（即时生效） |

### 2.4 去除水印

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 默认状态查看飞书文档 | 无水印文字/图案覆盖 |
| 2 | 关闭开关 | 水印出现（即时生效） |
| 3 | 打开开关 | 水印消失（即时生效） |

### 2.5 保留表格格式

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 默认状态复制飞书表格 | 粘贴到 Excel 格式正常 |
| 2 | 关闭开关，刷新 | 粘贴为纯文本 |
| 3 | 重新开启 | 格式恢复 |

### 2.6 解除拖拽限制

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 开启开关 | 即时生效 |
| 2 | 鼠标拖拽页面中的图片 | 图片可拖出浏览器窗口 |

### 2.7 调试日志

| 步骤 | 操作 | 期望结果 |
|------|------|----------|
| 1 | 开启 | 即时生效 |
| 2 | DevTools Console | 看到 [飞书复制助手] 蓝色日志 |
| 3 | 刷新页面 | 看到启动日志和 hooks 安装日志 |

## 三、兼容性矩阵

### 域名覆盖

| 域名 | 状态 |
|------|------|
| *.feishu.cn | 待测试 |
| *.larksuite.com | 待测试 |
| *.larkoffice.com | 待测试 |

### 文档类型

| 文档类型 | 普通复制 | 表格复制 | 右键 | 文本选择 | 水印 |
|----------|----------|----------|------|----------|------|
| 普通文档 | 待测试 | N/A | 待测试 | 待测试 | 待测试 |
| 表格文档 | 待测试 | 待测试 | 待测试 | 待测试 | 待测试 |
| 知识库文档 | 待测试 | 待测试 | 待测试 | 待测试 | 待测试 |
| 思维笔记 | 待测试 | N/A | 待测试 | 待测试 | 待测试 |
| 多维表格 | 待测试 | 待测试 | 待测试 | 待测试 | 待测试 |

### 浏览器

| 浏览器 | 状态 |
|--------|------|
| Chrome 102+ | 待测试 |
| Edge 102+ | 待测试 |
| Arc Browser | 待测试 |
| Firefox 109+ | 需 build:firefox |

## 四、边界场景

- [ ] 在飞书内切换文档（不刷新页面）— CSS 持续生效
- [ ] 从文档切换到知识库主页 — 扩展不崩溃
- [ ] 从主页进入文档 — hooks 在页面初始化时安装
- [ ] 快速连续切换 3+ 个文档页面 — 无内存泄漏
- [ ] 在 20 秒加固期内频繁操作 — 功能正常
- [ ] 打开多个飞书标签页 — 各标签页独立工作
- [ ] 自己是文档所有者 — 原生权限 + 扩展均正常
- [ ] 仅「可阅读」权限 — 扩展解开复制
- [ ] 仅「可评论」权限 — 扩展解开复制
- [ ] 匿名访问（分享链接） — 扩展解开复制
- [ ] 离线状态 — 扩展不崩溃（CSS 仍生效）
- [ ] 权限 API 请求失败 — hooks 静默失败，CSS 仍生效
- [ ] chrome.storage 不可用 — 使用默认配置

## 五、性能基准

| 指标 | 基线（无扩展） | 期望（扩展启用） |
|------|---------------|------------------|
| DOMContentLoaded | T0 | <= T0 + 50ms |
| TTI | T0 | <= T0 + 100ms |
| Content Script 执行 | - | < 10ms |
| 内存增量 | - | < 5MB |
| MutationObserver 开销 | - | < 1% CPU |

## 六、回归测试 Checklist

按顺序操作:
1. 重置配置，刷新页面
2. [ ] 复制普通文本正常
3. [ ] 右键菜单出现
4. [ ] 文本可选
5. [ ] 水印隐藏
6. [ ] 表格复制格式保留
7. 关闭「复制限制」，刷新
8. [ ] 复制被禁止（飞书原生行为）
9. 开启「复制限制」，刷新
10. [ ] 复制恢复
11. 关闭所有开关，刷新
12. [ ] 所有增强功能关闭，页面行为与无扩展一致
13. 点击「恢复默认」，刷新
14. [ ] 回到默认状态

## 七、自动化验证脚本

在飞书文档页面的 DevTools Console 中执行:

```javascript
(async function runTests() {
  const results = [];
  const assert = (name, condition) => {
    results.push({ name, pass: !!condition });
    console.log((condition ? 'PASS' : 'FAIL'), name);
  };

  assert('扩展已加载', window.__FEISHU_COPY_LOADED === true);
  assert('XHR hook 存在',
    XMLHttpRequest.prototype.open.toString().includes('permission'));
  assert('CSS 已注入',
    !!document.querySelector('[id*="__feishu_copy_"]'));
  assert('preventDefault hook 已安装',
    Event.prototype.preventDefault.toString().includes('contextmenu'));

  const testDiv = document.createElement('div');
  testDiv.textContent = 'TEST';
  testDiv.style.cssText = 'user-select:none;-webkit-user-select:none';
  document.body.appendChild(testDiv);
  const cs = getComputedStyle(testDiv);
  const selectable = cs.userSelect === 'text' || cs.webkitUserSelect === 'text';
  document.body.removeChild(testDiv);
  assert('user-select 已覆盖', selectable);

  const watermarks = document.querySelectorAll('[class*="watermark"]');
  let hidden = true;
  watermarks.forEach(w => {
    const s = getComputedStyle(w);
    if (s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0) {
      hidden = false;
    }
  });
  assert('水印已隐藏', watermarks.length === 0 || hidden);

  const passed = results.filter(r => r.pass).length;
  console.log('\n结果: ' + passed + '/' + results.length + ' 通过');
  results.filter(r => !r.pass).forEach(r => console.log('  FAIL', r.name));
})();
```

## 八、调试指南

### 查看扩展日志
1. 打开飞书文档页面
2. F12 Console
3. 确认 popup 中「调试日志」已开启
4. 刷新页面，查找 `[飞书复制助手]` 日志

### 查看 Service Worker 日志
1. chrome://extensions/
2. 找到「飞书复制助手」
3. 点击 Service Worker 旁的蓝色链接
4. 在新窗口中查看 background 日志

### 验证 XHR 权限改写
1. F12 Network 搜索 actions/state
2. 点击对应请求，查看 Response
3. 确认 data.actions.copy 为 1

### 常见问题

| 现象 | 可能原因 | 解决方案 |
|------|----------|----------|
| 刷新后仍不能复制 | XHR hook 未生效 | 确认刷新的是飞书文档页，检查 Network 中 actions/state 响应 |
| 右键菜单偶尔不出现 | 飞书动态添加监听 | 再右键一次 |
| 表格粘贴为纯文本 | keepTableFormat 关闭 | 开启「保留表格格式」并刷新 |
| 水印仍然可见 | CSS 选择器未覆盖 | 反馈水印元素 class/id，需更新选择器 |
| Popup 开关不生效 | 配置未保存 | 确认 popup 未报错，检查 chrome.storage |
