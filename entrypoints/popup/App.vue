<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface FeishuConfig {
  bypassCopy: boolean;
  bypassContextMenu: boolean;
  bypassUserSelect: boolean;
  removeWatermark: boolean;
  bypassDrag: boolean;
  keepTableFormat: boolean;
  debug: boolean;
}

const DEFAULT_CONFIG: FeishuConfig = {
  bypassCopy: true,
  bypassContextMenu: true,
  bypassUserSelect: true,
  removeWatermark: true,
  bypassDrag: false,
  keepTableFormat: true,
  debug: false,
};

const config = ref<FeishuConfig>({ ...DEFAULT_CONFIG });
const loading = ref(true);
const saving = ref(false);

interface ToggleItem {
  key: keyof FeishuConfig;
  label: string;
  desc: string;
  hot: boolean; // true=即时生效, false=需刷新
  group: string;
}

const toggles: ToggleItem[] = [
  {
    key: 'bypassCopy',
    label: '解除复制限制',
    desc: '通过改写权限响应启用复制，保留飞书原生富文本格式',
    hot: false,
    group: '核心',
  },
  {
    key: 'bypassContextMenu',
    label: '解除右键限制',
    desc: '恢复浏览器原生右键菜单（复制、另存图片、检查元素）',
    hot: true,
    group: '核心',
  },
  {
    key: 'bypassUserSelect',
    label: '强制文本可选',
    desc: '覆盖 CSS user-select，允许选中所有文本',
    hot: true,
    group: '核心',
  },
  {
    key: 'removeWatermark',
    label: '去除水印',
    desc: '隐藏页面上的水印图层',
    hot: true,
    group: '核心',
  },
  {
    key: 'keepTableFormat',
    label: '保留表格格式',
    desc: '不拦截飞书原生 copy 事件，复制到 Excel/Word 不失格式',
    hot: false,
    group: '核心',
  },
  {
    key: 'bypassDrag',
    label: '解除拖拽限制',
    desc: '允许拖拽图片和文本',
    hot: true,
    group: '增强',
  },
  {
    key: 'debug',
    label: '调试日志',
    desc: '在控制台输出运行信息（调试时开启）',
    hot: true,
    group: '其他',
  },
];

onMounted(async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
    if (response?.config) {
      config.value = { ...DEFAULT_CONFIG, ...response.config };
    }
  } catch {
    // 降级: 从 storage 直接读取
    const result = await chrome.storage.sync.get('feishu_copy_config');
    if (result.feishu_copy_config) {
      config.value = { ...DEFAULT_CONFIG, ...result.feishu_copy_config };
    }
  }
  loading.value = false;
});

async function toggle(key: keyof FeishuConfig) {
  if (saving.value) return;

  const item = toggles.find((t) => t.key === key);
  if (!item) return;

  saving.value = true;

  try {
    // 先保存到 storage
    await chrome.runtime.sendMessage({
      type: 'SAVE_CONFIG',
      config: { [key]: config.value[key] },
    });

    // 通知当前标签页即时应用
    if (item.hot) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'APPLY_STYLES',
          config: config.value,
        }).catch(() => {
          // content script 可能未加载
        });
      }
    }
  } catch {
    // 降级：直接写 storage
    await chrome.storage.sync.set({
      feishu_copy_config: config.value,
    });
  }

  saving.value = false;
}

const needsReload = computed(() => {
  return toggles.some((t) => !t.hot);
});

async function reloadTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.reload(tab.id);
    window.close();
  }
}

async function resetToDefaults() {
  config.value = { ...DEFAULT_CONFIG };
  await chrome.runtime.sendMessage({
    type: 'SAVE_CONFIG',
    config: DEFAULT_CONFIG,
  });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'APPLY_STYLES',
      config: DEFAULT_CONFIG,
    }).catch(() => {});
  }
}

// 需要引入 computed
import { computed } from 'vue';
</script>

<template>
  <div class="popup">
    <!-- 头部 -->
    <header class="header">
      <div class="header-left">
        <h1 class="title">飞书复制助手</h1>
        <span class="version">v0.1.0</span>
      </div>
      <button class="btn-reset" @click="resetToDefaults" title="恢复默认设置">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 4v6h6M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
    </header>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">加载中...</div>

    <!-- 开关列表 -->
    <div v-else class="toggle-list">
      <div
        v-for="item in toggles"
        :key="item.key"
        class="toggle-item"
        :class="{ disabled: saving }"
      >
        <div class="toggle-info">
          <div class="toggle-label">
            {{ item.label }}
            <span v-if="!item.hot" class="badge-reload" title="修改后需刷新页面生效">
              需刷新
            </span>
          </div>
          <div class="toggle-desc">{{ item.desc }}</div>
        </div>
        <label class="switch">
          <input
            type="checkbox"
            v-model="config[item.key]"
            @change="toggle(item.key)"
          />
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <!-- 底部操作 -->
    <footer v-if="!loading" class="footer" v-show="needsReload">
      <button class="btn-reload" @click="reloadTab">
        🔄 刷新页面试用新设置
      </button>
    </footer>
  </div>
</template>

<style scoped>
.popup {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
}

.version {
  font-size: 11px;
  color: #8f959e;
}

.btn-reset {
  width: 28px;
  height: 28px;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
  color: #646a73;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.btn-reset:hover {
  background: #f5f6f8;
  color: #3370ff;
  border-color: #3370ff;
}

.loading {
  padding: 40px 16px;
  text-align: center;
  color: #8f959e;
  font-size: 13px;
}

.toggle-list {
  flex: 1;
  padding: 8px 0;
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  transition: background 0.15s;
  gap: 12px;
}
.toggle-item:hover {
  background: #f7f8fa;
}
.toggle-item.disabled {
  opacity: 0.6;
}

.toggle-info {
  min-width: 0;
  flex: 1;
}

.toggle-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.toggle-desc {
  font-size: 11px;
  color: #8f959e;
  line-height: 16px;
  margin-top: 2px;
}

.badge-reload {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  color: #b76e00;
  background: #fff4df;
  font-weight: 500;
  flex-shrink: 0;
}

/* 开关样式 */
.switch {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #c9cdd4;
  border-radius: 20px;
  transition: background 0.2s;
}
.slider::before {
  content: "";
  position: absolute;
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 2px rgba(31, 35, 41, 0.22);
}
.switch input:checked + .slider {
  background: #3370ff;
}
.switch input:checked + .slider::before {
  transform: translateX(16px);
}

.footer {
  padding: 10px 16px 16px;
  border-top: 1px solid #f0f0f0;
}

.btn-reload {
  width: 100%;
  height: 34px;
  border: 1px solid #3370ff;
  border-radius: 6px;
  background: #fff;
  color: #3370ff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-reload:hover {
  background: #3370ff;
  color: #fff;
}
</style>
