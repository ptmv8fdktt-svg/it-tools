<script setup lang="ts">
/**
 * 离线可用状态提示
 *
 * 校园网不稳定是真实痛点，所以离线能力需要被「显式看见」：
 * 用户必须知道现在用的是缓存版本、功能不会打折、数据也不会外传。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';

const online = ref(true);
const installable = ref(false);
const installed = ref(false);
const dismissed = ref(false);

let deferredPrompt: Event | null = null;

function handleOnline() {
  online.value = true;
}
function handleOffline() {
  online.value = false;
}
function handleBeforeInstall(e: Event) {
  e.preventDefault();
  deferredPrompt = e;
  installable.value = true;
}

async function install() {
  const prompt = deferredPrompt as unknown as { prompt?: () => Promise<void> } | null;
  if (!prompt?.prompt) return;
  await prompt.prompt();
  installable.value = false;
  installed.value = true;
}

onMounted(() => {
  online.value = navigator.onLine;
  installed.value = window.matchMedia('(display-mode: standalone)').matches;

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('beforeinstallprompt', handleBeforeInstall);
});

onUnmounted(() => {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
});

const showInstall = computed(() => installable.value && !installed.value && !dismissed.value);
</script>

<template>
  <!-- 离线状态条 -->
  <div v-if="!online" class="offline-bar">
    <span class="dot" />
    <span>
      当前处于<strong>离线状态</strong> —— 校园网断了也能继续用。所有工具在本地运行，功能完全不受影响。
    </span>
  </div>

  <!-- 安装提示 -->
  <div v-if="showInstall" class="install-bar">
    <span>把校园工具箱装到桌面，之后断网也能一键打开。</span>
    <div class="install-actions">
      <button class="install-btn" @click="install">
        安装
      </button>
      <button class="dismiss-btn" @click="dismissed = true">
        以后再说
      </button>
    </div>
  </div>
</template>

<style scoped>
.offline-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 13px;
  line-height: 1.5;
  background: #fff7e6;
  color: #8a5a00;
  border-bottom: 1px solid #ffe0a3;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d03050;
  flex-shrink: 0;
}

.install-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  font-size: 13px;
  background: #eef8f2;
  color: #14663a;
  border-bottom: 1px solid #c6e9d5;
}

.install-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.install-btn {
  padding: 3px 12px;
  font-size: 12px;
  border-radius: 4px;
  border: none;
  background: #18a058;
  color: #fff;
  cursor: pointer;
}

.install-btn:hover {
  background: #14824a;
}

.dismiss-btn {
  padding: 3px 8px;
  font-size: 12px;
  border-radius: 4px;
  border: 1px solid #c6e9d5;
  background: transparent;
  color: #14663a;
  cursor: pointer;
}
</style>
