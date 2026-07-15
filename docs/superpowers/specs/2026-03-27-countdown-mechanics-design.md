# Countdown Mechanics Design Specification
**Date**: 2026-03-27
**Topic**: Mahjong Game Countdown & Auto-Play Mechanics

## 1. Overview
This feature implements a countdown timer for players' turns in the Mahjong game. If a player fails to play a tile within the time limit (12 seconds), the system will automatically play a tile for them. The countdown UI will be displayed using Vue's overlay on top of the PixiJS canvas.

## 2. Design Decisions
- **Auto-Play Strategy**: Scheme A (摸打). When time expires, the system will automatically play the last tile in the player's hand array (which corresponds to the tile they just drew, or the rightmost tile if it's the beginning of the game).
- **Frontend Strategy**: Option 1 (Vue Overlay). Total reliance on Vue (`index.vue`) for the countdown timer interval and UI rendering to stay decoupled from the PixiJS rendering loop.

## 3. Backend Changes (`web-server/main.js`)
- **`autoPlay(roomId)`**:
  - Change tile selection from random (`Math.random()`) to strict right-most tile: `const card = hand[hand.length - 1];`.
  - Trigger `handlePlayCard` with this selected tile.
- **`handlePlayCard(roomId, userId, card)`**:
  - Unchanged: Stops current timer, processes tile, checks for game over/draw.
  - **New addition**: After completing the logic to pass the turn to the next player (`state.turn = nextUser`) and broadcasting `played`/`draw` events, it MUST call `startTimer(roomId)` for the new turn.
- **`startTimer`/`stopTimer`**:
  - Keep logic intact but maintain robust state exception handling in case a room becomes void. Ensure `stopTimer` is consistently called during `gameEnd` or disconnects where appropriate.

## 4. Frontend Changes (`web-ui`)
- **PixiJS Cleanup (`web-ui/src/pixi/scenes/TableScene.ts`)**:
  - Remove all unused timer concepts (`countdownTimer`, `countdownValue`).
- **Vue Integration (`web-ui/src/pages/game-index/index.vue`)**:
  - Socket listener for `startTimer`: When received, it updates the `timeLeft` ref and `countdownVisible = true`, starting a local `setInterval` (decrementing every 1 second).
  - Add visual styling for urgency: `<= 3s` triggers red text and a CSS pulse animation (`text-red-500 animate-[pulse_0.5s_infinite]`).
  - Stop the local timer when the user plays a tile directly, or when `played` / `gameOver` broadcasts are received.
  - Implement memory safety by ensuring the Vue local interval clears itself in `onUnmounted`.

## 5. Data Flow
1. **Server** (`handlePlayCard` or Game Start) -> Emits `startTimer({turn, timeLimit})`.
2. **Client** -> Receives `startTimer`. Updates Vue UI and starts local descending ticking.
3. **Client** (Time expires on server) -> **Server** `autoPlay` function fires -> **Server** emits `played` and process state.
4. **Client** -> Receives `played` -> Stops local countdown UI -> **Server** emits `startTimer` for the next player immediately after.
