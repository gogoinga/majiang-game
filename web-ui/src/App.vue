<template>
  <div class="root">
    <div
      :inert="showLandscapeMask"
      :aria-hidden="showLandscapeMask ? 'true' : 'false'"
    >
      <RouterView />
    </div>
    <div
      v-if="showLandscapeMask"
      class="landscape-mask"
      role="dialog"
      aria-modal="true"
      aria-labelledby="landscape-dialog-title"
    >
      <div class="landscape-card">
        <div class="landscape-icon">↻</div>
        <div id="landscape-dialog-title" class="landscape-title">请横屏体验</div>
        <div class="landscape-text">
          当前玩法已按手机横屏布局优化。
          <br />
          请将手机旋转到横屏后继续。
        </div>
        <button
          ref="landscapeButtonRef"
          class="landscape-button"
          @click="handleTryLandscape"
        >
          点击尝试横屏
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterView } from "vue-router";

const isPortrait = ref(false);
const isMobileDevice = ref(false);
const landscapeButtonRef = ref<HTMLButtonElement>();

const updateOrientationState = () => {
  if (typeof window === "undefined") return;
  isPortrait.value = window.innerHeight > window.innerWidth;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const isPhoneSizedViewport =
    Math.min(window.innerWidth, window.innerHeight) <= 480 &&
    Math.max(window.innerWidth, window.innerHeight) <= 960;

  isMobileDevice.value = isCoarsePointer && isPhoneSizedViewport;
};

const tryLockLandscape = async () => {
  if (typeof window === "undefined") return;

  const orientationApi = screen.orientation as ScreenOrientation & {
    lock?: (orientation: "landscape") => Promise<void>;
  };

  if (orientationApi?.lock) {
    try {
      await orientationApi.lock("landscape");
    } catch {
      // iOS Safari 等环境不支持强制锁横屏，退化为提示遮罩
    }
  }
};

const showLandscapeMask = computed(() => isMobileDevice.value && isPortrait.value);

const handleTryLandscape = () => {
  void tryLockLandscape();
  updateOrientationState();
};

watch(showLandscapeMask, async (visible) => {
  if (!visible) return;
  await nextTick();
  landscapeButtonRef.value?.focus();
});

onMounted(() => {
  updateOrientationState();
  void tryLockLandscape();
  window.addEventListener("resize", updateOrientationState);
  window.addEventListener("orientationchange", updateOrientationState);
  document.addEventListener("visibilitychange", tryLockLandscape);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateOrientationState);
  window.removeEventListener("orientationchange", updateOrientationState);
  document.removeEventListener("visibilitychange", tryLockLandscape);
});
</script>

<style scoped>
.root {
  width: 100%;
  min-height: 100dvh;
  font-size: 1rem;
  color: var(--color-text);
  background: var(--color-background);
  overflow-x: hidden;
  padding-bottom: var(--app-safe-area-bottom);
}

.landscape-mask {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding:
    calc(var(--app-shell-padding) + var(--app-safe-area-top))
    calc(var(--app-shell-padding) + var(--app-safe-area-right))
    calc(var(--app-shell-padding) + var(--app-safe-area-bottom))
    calc(var(--app-shell-padding) + var(--app-safe-area-left));
  background:
    radial-gradient(circle at top, rgba(18, 95, 60, 0.98) 0%, rgba(7, 39, 22, 0.98) 68%),
    rgba(4, 22, 14, 0.98);
}

.landscape-card {
  width: min(22rem, calc(100vw - (var(--app-shell-padding) * 2)));
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--app-panel-radius);
  padding: 1.75rem 1.5rem;
  text-align: center;
  color: #f4fff8;
  background: rgba(0, 0, 0, 0.22);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--app-compact-gap);
}

.landscape-icon {
  font-size: 3rem;
  line-height: 1;
}

.landscape-title {
  font-size: 1.75rem;
  font-weight: 800;
}

.landscape-text {
  font-size: 1rem;
  line-height: 1.55;
  color: rgba(244, 255, 248, 0.78);
}

.landscape-button {
  min-width: 9.5rem;
  min-height: var(--app-control-height);
  border: 0;
  border-radius: 999px;
  padding: 0 1.1rem;
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1;
  color: #032012;
  background: #f5c84b;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
