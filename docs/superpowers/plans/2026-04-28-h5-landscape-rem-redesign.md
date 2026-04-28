# H5 Landscape REM Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the lobby page and game page into a compact H5-first landscape layout using a shared `rem` sizing system while preserving current room and gameplay behavior.

**Architecture:** The implementation keeps Pixi as the game-table rendering layer and introduces a unified responsive shell for DOM UI. Global CSS variables and root `rem` sizing drive spacing, typography, panel heights, and button sizes for both pages, while `TableScene` gets narrower mobile-landscape metrics so the canvas and DOM overlays feel like one H5 layout.

**Tech Stack:** Vue 3, Vue Router, Tailwind CSS v4, Vite, Pixi.js

---

## File Structure Map

- `web-ui/src/assets/base.css`
  - Own the global `rem` sizing strategy, shared CSS variables, safe-area paddings, and baseline typography for the H5 shell.
- `web-ui/src/App.vue`
  - Own the global application shell, orientation mask, root overflow behavior, and shared landscape container rules.
- `web-ui/src/pages/room-lobby/index.vue`
  - Own the compact H5 lobby structure, room action bar, card grid, and page-level spacing.
- `web-ui/src/pages/game-index/index.vue`
  - Own all non-Pixi overlays in the match scene: buttons, dialogs, score badges, countdown panel, ready bar, and responsive positioning helpers.
- `web-ui/src/pixi/scenes/TableScene.ts`
  - Own table-space metrics and compact seat/river/public-tile positioning for mobile landscape.

## Verification Strategy

This repo currently has no dedicated UI test runner (`vitest`/`jest`) and already relies on `pnpm --dir web-ui build-only` as the stable automated check. Use:

- `pnpm --dir web-ui build-only` after every task that changes Vue/CSS/Pixi code
- Manual browser checks at:
  - mobile landscape width around `844x390`
  - tablet-ish landscape width around `1024x600`
  - desktop width around `1440x900`

Do not use `pnpm --dir web-ui type-check` as a completion gate unless the pre-existing `web-ui/src/hooks/a.ts` issue is resolved separately.

### Task 1: Build the global H5 landscape shell

**Files:**
- Modify: `web-ui/src/assets/base.css`
- Modify: `web-ui/src/App.vue`
- Test: `pnpm --dir web-ui build-only`

- [ ] **Step 1: Add global `rem` variables and root sizing rules in `web-ui/src/assets/base.css`**

```css
@import "tailwindcss";

:root {
  --app-rem-base: clamp(12px, 1.75vmin, 18px);
  --app-shell-padding: clamp(0.75rem, 1.4vw, 1.25rem);
  --app-panel-radius: 1rem;
  --app-panel-radius-lg: 1.4rem;
  --app-control-height: 2.4rem;
  --app-compact-gap: 0.65rem;
  --app-safe-top: max(env(safe-area-inset-top), 0.5rem);
  --app-safe-right: max(env(safe-area-inset-right), 0.5rem);
  --app-safe-bottom: max(env(safe-area-inset-bottom), 0.5rem);
  --app-safe-left: max(env(safe-area-inset-left), 0.5rem);
}

html {
  font-size: var(--app-rem-base);
}

body {
  min-width: 100vw;
  min-height: 100vh;
  font-family: "Trebuchet MS", "Segoe UI", sans-serif;
}
```

- [ ] **Step 2: Add landscape shell classes in `web-ui/src/App.vue`**

```vue
<div class="root app-shell">
  <RouterView />
  <div v-if="showLandscapeMask" class="landscape-mask">
    <div class="landscape-card">
      ...
    </div>
  </div>
</div>
```

```css
.app-shell {
  width: 100vw;
  min-height: 100vh;
  padding:
    var(--app-safe-top)
    var(--app-safe-right)
    var(--app-safe-bottom)
    var(--app-safe-left);
  background:
    radial-gradient(circle at top, rgba(15, 95, 53, 0.98) 0%, rgba(7, 39, 22, 0.98) 68%),
    rgba(4, 22, 14, 0.98);
}
```

- [ ] **Step 3: Tighten the orientation-mask sizing in `web-ui/src/App.vue` so the modal follows the new shell scale**

```css
.landscape-card {
  width: min(24rem, calc(100vw - 2rem));
  border-radius: 1.5rem;
  padding: 1.5rem 1.25rem;
}

.landscape-title {
  margin-top: 0.625rem;
  font-size: 1.4rem;
}

.landscape-button {
  margin-top: 1rem;
  min-width: 10rem;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
}
```

- [ ] **Step 4: Run the build guard**

Run: `pnpm --dir web-ui build-only`

Expected: `vite build` completes successfully and emits the production bundle.

- [ ] **Step 5: Commit**

```bash
git add web-ui/src/assets/base.css web-ui/src/App.vue
git commit -m "feat: add H5 landscape shell foundation"
```

### Task 2: Refactor the lobby page into a compact H5 landscape layout

**Files:**
- Modify: `web-ui/src/pages/room-lobby/index.vue`
- Test: `pnpm --dir web-ui build-only`

- [ ] **Step 1: Replace the large hero spacing with a low-height landscape header block**

```vue
<div class="lobby-shell">
  <div class="lobby-header">
    <div class="lobby-copy">
      <div class="lobby-kicker">MAJIANG LOBBY</div>
      <h1 class="lobby-title">房间大厅</h1>
      <p class="lobby-description">先创建房间，再让其他玩家挑选同一个房间进入。</p>
    </div>
    <div class="lobby-actions">
      ...
    </div>
  </div>
</div>
```

- [ ] **Step 2: Convert the room-entry controls to a single compact action bar with `rem` heights**

```vue
<div class="lobby-actions">
  <input
    v-model.trim="manualRoomId"
    class="lobby-room-input"
    @keydown.enter="enterManualRoom"
  />
  <button @click="enterManualRoom" class="lobby-secondary-button">进入房间</button>
  <button @click="handleCreateRoom" class="lobby-primary-button">创建房间</button>
</div>
```

```css
.lobby-actions {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) auto auto;
  gap: 0.55rem;
}
```

- [ ] **Step 3: Compress the “可加入房间 / 刷新列表” row and room cards into a denser landscape grid**

```vue
<div class="lobby-section-head">
  <div class="lobby-section-title">可加入房间</div>
  <button @click="requestRoomList" class="lobby-refresh-button">刷新列表</button>
</div>

<div v-else class="room-grid">
  <div v-for="room in rooms" :key="room.roomId" class="room-card">
    ...
  </div>
</div>
```

```css
.room-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: 0.9rem;
}

.room-card {
  border-radius: 1.25rem;
  padding: 0.9rem;
}
```

- [ ] **Step 4: Run the build guard**

Run: `pnpm --dir web-ui build-only`

Expected: `vite build` completes successfully with the updated lobby markup and styles.

- [ ] **Step 5: Manual verify the lobby**

Check:
- At `844x390`, the title, action bar, and at least one row of room cards appear without button text wrapping.
- The room list still scrolls vertically when there are many cards.
- The room-entry input and buttons stay aligned as one compact control group.

- [ ] **Step 6: Commit**

```bash
git add web-ui/src/pages/room-lobby/index.vue
git commit -m "feat: compact the H5 landscape lobby layout"
```

### Task 3: Refactor game-page overlays and badges to the new `rem` system

**Files:**
- Modify: `web-ui/src/pages/game-index/index.vue`
- Test: `pnpm --dir web-ui build-only`

- [ ] **Step 1: Convert top-level absolute controls from Tailwind pixel-heavy classes to compact `rem`-based shell classes**

```vue
<div class="game-shell">
  <div ref="pixiContainer" class="game-canvas" />

  <button @click="goBackToLobby" class="game-back-button">
    返回大厅
  </button>
  ...
</div>
```

```css
.game-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.game-back-button {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 72;
  min-height: 2rem;
  padding: 0 0.9rem;
  border-radius: 999px;
}
```

- [ ] **Step 2: Tighten the nickname dialog and round-end dialog widths, spacing, and typography**

```vue
<div v-if="showNicknameDialog" class="game-mask">
  <div class="game-dialog game-dialog--nickname">
    ...
  </div>
</div>

<div v-if="showRoundEndDialog" class="game-mask">
  <div class="game-dialog game-dialog--round-end">
    ...
  </div>
</div>
```

```css
.game-dialog {
  width: min(22rem, calc(100vw - 1.5rem));
  border-radius: 1.5rem;
  padding: 1.35rem;
}
```

- [ ] **Step 3: Move the ready bar, countdown box, action buttons, and score badges onto shared compact classes**

```vue
<div v-if="!inGame" class="game-ready-bar">...</div>

<div v-if="countdownVisible" class="game-countdown-panel">...</div>

<div v-if="promptVisible" class="game-action-row">...</div>

<div v-for="badge in scoreBadges" :key="badge.uid" class="game-score-badge" :style="badge.style">
  ...
</div>
```

```ts
if (seat === "bottom") {
  style = { left: "16rem", bottom: "7rem" };
} else if (seat === "right") {
  style = { right: "4.4rem", top: "6.2rem" };
}
```

- [ ] **Step 4: Run the build guard**

Run: `pnpm --dir web-ui build-only`

Expected: `vite build` completes successfully and the game page still bundles with the new overlay classes.

- [ ] **Step 5: Manual verify the game overlays**

Check:
- The nickname dialog remains centered and readable at `844x390`.
- The ready bar no longer feels like a desktop footer.
- “碰 / 杠 / 过 / 胡 / 继续” buttons do not wrap.
- Score badges still sit near the correct player positions after the resize listener fires.

- [ ] **Step 6: Commit**

```bash
git add web-ui/src/pages/game-index/index.vue
git commit -m "feat: compact game overlays for H5 landscape"
```

### Task 4: Retune Pixi table metrics for the compact landscape shell

**Files:**
- Modify: `web-ui/src/pixi/scenes/TableScene.ts`
- Test: `pnpm --dir web-ui build-only`

- [ ] **Step 1: Adjust the mobile-landscape thresholds and scale factors in `getViewportMetrics()`**

```ts
const MOBILE_LANDSCAPE_MAX_EDGE = 560;

return {
  width,
  height,
  isMobileLandscape,
  publicScale: isMobileLandscape ? 0.38 : PUBLIC_TILE_SCALE,
  handScale: isMobileLandscape ? 0.68 : HAND_TILE_SCALE,
  riverScale: isMobileLandscape ? 0.48 : CARD_RIVER_SCALE,
};
```

- [ ] **Step 2: Pull the river and public-tile anchors slightly inward to make room for the tighter DOM overlays**

```ts
this.riverContainers.bottom.x = CARD_WIDTH * (isMobileLandscape ? 4.45 : 5.4);
this.riverContainers.bottom.y = H - CARD_HEIGHT * (isMobileLandscape ? 1.38 : 1.8);

const anchorX = innerWidth - (isMobileLandscape ? 1.1 * tileHeight : 34) - tileHeight;
const anchorY = isMobileLandscape ? 1remToPx(1.1) : 36;
```

Implementation note: keep the anchor math in pixels inside Pixi, but tune the constants to match the visually tighter shell. If a helper is needed, define it in `TableScene.ts` instead of reaching into DOM CSS.

- [ ] **Step 3: Verify `resizeLayout()` still re-renders correctly after the new metrics**

```ts
resizeLayout() {
  this.initRiverContainers();
  if (!Object.keys(gameStore.hands).length) return;
  this.renderRiver(gameStore.river);
  this.renderAllHands(gameStore.hands, gameStore.myIndex, gameStore.bankerIndex);
  this.renderPublicTiles(gameStore.pengs, gameStore.gangs, gameStore.myIndex, gameStore.bankerIndex);
}
```

- [ ] **Step 4: Run the build guard**

Run: `pnpm --dir web-ui build-only`

Expected: `vite build` completes successfully and `TableScene.ts` still compiles.

- [ ] **Step 5: Manual verify the compact table**

Check:
- Bottom hand, side hands, and public meld areas remain fully visible at `844x390`.
- The countdown/action overlays do not cover the bottom hand in a normal turn state.
- River rows still render inside the center table space after resize.

- [ ] **Step 6: Commit**

```bash
git add web-ui/src/pixi/scenes/TableScene.ts
git commit -m "feat: retune Pixi metrics for H5 landscape"
```

### Task 5: Final integration pass and regression check

**Files:**
- Modify: `web-ui/src/assets/base.css`
- Modify: `web-ui/src/App.vue`
- Modify: `web-ui/src/pages/room-lobby/index.vue`
- Modify: `web-ui/src/pages/game-index/index.vue`
- Modify: `web-ui/src/pixi/scenes/TableScene.ts`
- Test: `pnpm --dir web-ui build-only`

- [ ] **Step 1: Run a full production build after all tasks**

Run: `pnpm --dir web-ui build-only`

Expected: a successful `vite build` with no new warnings that indicate broken imports or syntax.

- [ ] **Step 2: Run the complete manual landscape checklist**

Check:
- Lobby page at `844x390`, `1024x600`, `1440x900`
- Game page at the same three sizes
- Portrait mask still appears on mobile portrait
- Returning from room to lobby preserves the compact shell without overflow glitches

- [ ] **Step 3: Make only targeted polish fixes if any verification item fails**

```css
/* Example polish-only adjustments */
.lobby-actions {
  gap: 0.45rem;
}

.game-action-row {
  bottom: 4.8rem;
}
```

Keep this step strictly to spacing, sizing, and alignment corrections discovered during verification. Do not add new behavior.

- [ ] **Step 4: Re-run the build guard after polish**

Run: `pnpm --dir web-ui build-only`

Expected: a second successful `vite build`.

- [ ] **Step 5: Commit**

```bash
git add web-ui/src/assets/base.css web-ui/src/App.vue web-ui/src/pages/room-lobby/index.vue web-ui/src/pages/game-index/index.vue web-ui/src/pixi/scenes/TableScene.ts
git commit -m "feat: finish compact H5 landscape redesign"
```

## Self-Review

### Spec coverage

- Global `rem` shell: covered by Task 1
- Lobby compact landscape layout: covered by Task 2
- Game overlay compact landscape layout: covered by Task 3
- Pixi compact metric tuning: covered by Task 4
- Verification and polish: covered by Task 5

No spec section is currently uncovered.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task names exact files and concrete commands.
- Verification steps are explicit and tied to defined breakpoints.

### Type consistency

- The plan consistently uses the existing file names and current component boundaries.
- New CSS class names are scoped by page (`lobby-*`, `game-*`) or global shell (`app-*`) to avoid naming drift.

