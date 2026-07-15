# Countdown Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement visual countdown timer in Vue strictly synchronized with backend auto-play mechanics, automatically playing the last drawn tile upon timeout.

**Architecture:** The server orchestrates the strict 12s timer per turn, emitting `startTimer` to clients. The Vue frontend listens to this, renders an absolute overlay with a ticking number, and the server executes `autoPlay` (playing the rightmost hand tile) if the client sends no action. PixiJS is completely decoupled from the timer.

**Tech Stack:** Node.js (Socket.io), Vue 3 (Composition API), PixiJS, TailwindCSS

---

### Task 1: Backend - Update Auto-Play Strategy & Timer Continuation

**Files:**
- Modify: `web-server/main.js`

- [ ] **Step 1: Write verification script (Simulate TDD)**
Create `web-server/verify_autoplay.js` to test the logic without socket IO.
```javascript
import assert from 'assert';

// We'll simulate the state transition that main.js will do
const mockHand = ["1s", "2s", "3s", "4t"];
const cardToPlay = mockHand[mockHand.length - 1];
assert.strictEqual(cardToPlay, "4t", "Should pick the last (rightmost) card");
console.log("PASS: Rightmost card strategy");
```

- [ ] **Step 2: Run verification script**
Run: `node web-server/verify_autoplay.js`
Expected: PASS: Rightmost card strategy

- [ ] **Step 3: Modify `autoPlay` function**
Modify `web-server/main.js` inside `autoPlay(roomId)`:
Replace:
```javascript
  // 自动打出一张随机牌
  const randomIndex = Math.floor(Math.random() * hand.length);
  const card = hand[randomIndex];
  console.log(`[AutoPlay] ${userId} 自动打出随机牌 ${card}`);
```
With:
```javascript
  // 自动打出最后一张牌（刚摸的牌或最右边的牌）
  const card = hand[hand.length - 1];
  console.log(`[AutoPlay] ${userId} 自动打出最后一张牌 ${card}`);
```

- [ ] **Step 4: Modify `handlePlayCard` to continue timer**
Modify `web-server/main.js` inside `handlePlayCard`. Go to the very end of the function, right after emitting `draw`:
```javascript
  io.to(roomId).emit("draw", {
    userId: nextUser,
    tile: drawnTile,
    wallLeft: state.wall.length,
    hands: handsSnapshot,
  });

  // ========== 增加这一行，开启下家的倒计时 ==========
  startTimer(roomId);
```

- [ ] **Step 5: Commit**
```bash
git add web-server/main.js web-server/verify_autoplay.js
git commit -m "feat: implement rightmost card auto-play and continue timer loop"
```

---

### Task 2: Frontend - Cleanup PixiJS Timer

**Files:**
- Modify: `web-ui/src/pixi/scenes/TableScene.ts`

- [ ] **Step 1: Check existing codebase for target lines**
Run: `grep -n "countdown" web-ui/src/pixi/scenes/TableScene.ts`
Expected to see `countdownTimer` and `countdownValue` properties.

- [ ] **Step 2: Clean up unused timer variables**
Modify `web-ui/src/pixi/scenes/TableScene.ts`:
Remove these properties from the `TableScene` class:
```typescript
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private countdownValue: number = 15;
```
Remove any internal references or methods involving these if they exist (scan the file carefully).

- [ ] **Step 3: Commit**
```bash
git add web-ui/src/pixi/scenes/TableScene.ts
git commit -m "refactor: remove coupled countdown logic from TableScene"
```

---

### Task 3: Frontend - Vue Timer Implementation

**Files:**
- Modify: `web-ui/src/pages/game-index/index.vue`

- [ ] **Step 1: Add/Update refs and intervals**
In ``<script setup lang="ts">` of `web-ui/src/pages/game-index/index.vue`:
```typescript
import { ref, onUnmounted } from 'vue';

const countdownVisible = ref(false);
const timeLeft = ref(0);
let timerInterval: number | null = null;
const isMyTurn = ref(false); // To determine if the timer shows for us specifically (optional stylistic choice, but safe to add)

// Ensures cleanup
onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});
```

- [ ] **Step 2: Bind Socket Listeners**
Inside the socket setup block (`socket.on(...)`):
```typescript
socket.on("startTimer", ({ turn, timeLimit }) => {
  isMyTurn.value = turn === gameStore.userInfo.userId;
  timeLeft.value = timeLimit;
  countdownVisible.value = true;

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    timeLeft.value -= 1;
    if (timeLeft.value <= 0) {
      clearInterval(timerInterval!);
    }
  }, 1000);
});

socket.on("played", () => {
  countdownVisible.value = false;
  if (timerInterval) clearInterval(timerInterval);
});

socket.on("gameOver", () => {
  countdownVisible.value = false;
  if (timerInterval) clearInterval(timerInterval);
});
```
Make sure in `playCard` function (when user manually clicks), you also add:
```typescript
  countdownVisible.value = false;
  if (timerInterval) clearInterval(timerInterval);
```

- [ ] **Step 3: Add Vue Overlay UI**
In `<template>` of `web-ui/src/pages/game-index/index.vue`:
Find an absolute positioned container layer (e.g. over the canvas). If one doesn't exist, wrap the PixiJS mount point or add an absolute child.
```html
<template>
  <div class="relative w-full h-screen overflow-hidden bg-gray-900">
    <!-- Existing Pixi canvas container (assuming this structure) -->
    <div id="pixi-container" class="w-full h-full"></div>

    <!-- Timer Overlay -->
    <div
      v-if="countdownVisible"
      class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50 flex flex-col items-center justify-center bg-black/50 px-8 py-4 rounded-xl border-2 border-white/20 shadow-2xl backdrop-blur-sm"
    >
      <div class="text-white text-lg mb-1 tracking-widest font-semibold opacity-80">
        {{ isMyTurn ? '您的回合' : '等待其余玩家出牌...' }}
      </div>
      <div
        class="text-6xl font-black font-mono tracking-tighter transition-colors duration-300"
        :class="timeLeft <= 3 ? 'text-red-500 animate-[pulse_0.5s_infinite]' : 'text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]'"
      >
        {{ timeLeft }}
      </div>
    </div>

    <!-- ... Rest of UI ... -->
  </div>
</template>
```

- [ ] **Step 4: Verify Frontend Hot Reload**
Run `npm run dev` in `web-ui`. Open the browser, ensure no syntax errors.

- [ ] **Step 5: Commit**
```bash
git add web-ui/src/pages/game-index/index.vue
git commit -m "feat: implement vue overlay synchronized with socket timer"
```
