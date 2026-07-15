# Peng & Gang Mechanics Design Specification
**Date**: 2026-03-27
**Topic**: Mahjong Game Peng (Pung) and Gang (Kong) Mechanics

## 1. Overview
This feature introduces core Mahjong mechanics: "Peng" (matching 3 identical tiles when someone discards), "Ming Gang" (matching 4 identical tiles when someone discards), "An Gang" (concealed matching 4 identical tiles in hand), and "Jia Gang" (promoted Kong by drawing the 4th tile to an existing Peng). This requires a significant refactor to the game state machine to support interrupting the normal flow for "claiming" discarded tiles.

## 2. Design Decisions
- **Interruption Strategy (Static Polling)**: When a player A discards a tile, the server immediately stops, calculates if any player B, C, or D can claim it (Peng/Ming Gang). If yes, the server enters an `actionPrompt` state and waits for 8 seconds. It DOES NOT deal a tile to the next player until the prompt is resolved (either by user clicking 'Pass' or timer expiring).
- **Sub-State Management**: The server must separate the "deal tile" (`nextTurn`) logic from the "discard tile" logic, which are currently rigidly coupled in `handlePlayCard`.
- **Public Areas (`pengs` / `gangs`)**: We will add tracking for public revealed tiles for each user, distinct from `hands` and `river`.

## 3. Backend Changes (`web-server/main.js`)
- **State Additions**:
  - `state.pengs`: `{ userId -> string[][] }` (e.g., `[["1s", "1s", "1s"], ...]`)
  - `state.gangs`: `{ userId -> { type: 'ming'|'an'|'jia', tiles: string[] }[] }`
  - `state.actionPending`: `{ card, fromUserId, options: { userId -> ['peng', 'gang'] } }` – State representing the current waiting period for a claim.

- **`handlePlayCard` Refactor (The Discard Phase)**:
  1. Remove tile from hand, put in river.
  2. Clear current turn timer.
  3. **New Logic:** Evaluate opponents' hands for the discarded tile.
     - Count occurrences of the discarded tile in each opponent's hand.
     - If count == 2 (can Peng) or count == 3 (can Ming Gang), populate `state.actionPending`.
     - Emit `actionPrompt` to the applicable user(s) with available actions and start an 8-second action timer (`startActionTimer`).
     - If no one can claim (or occurrences < 2), immediately call `proceedToNextTurn(state, roomId, userId)`.

- **New Function `proceedToNextTurn` (The Deal Phase)**:
  - Extracts the dealing logic from the old `handlePlayCard`.
  - Determines `nextUser`, pops tile from wall, pushes to `nextUser`'s hand, sets `state.turn`, sets the 12s turn timer, emits `draw`.

- **New Socket Event `claimAction`**:
  - **Payload**: `{ action: 'peng' | 'gang' | 'pass' }`
  - **Logic**:
    - If 'pass' or timer expires: Clear `actionPending`, invoke `proceedToNextTurn` based on the original discarder.
    - If 'peng': Remove 2 tiles from the claimer's hand, push `[card, card, card]` to `state.pengs`. Change `state.turn` to the claimer, do NOT deal a tile, start their turn timer. Broadcast `peng` event.
    - If 'gang' (Ming): Remove 3 tiles, push to `state.gangs`, deal a replacement tile from the end of the wall (or regular wall, depending on strict rules), change turn to claimer, start timer. Broadcast `gang` event.

- **New Socket Event `selfAction` (An Gang / Jia Gang)**:
  - Triggered during the player's OWN turn before discarding.
  - **Payload**: `{ action: 'an_gang' | 'jia_gang', card }`
  - **Logic**:
    - Verifies hand (4 identical for An Gang) or hand + pengs (1 in hand, 3 in pengs for Jia Gang).
    - Updates arrays accordingly.
    - Draws a replacement tile, restarts turn timer. Broadcast `gang` event.

## 4. Frontend Changes (`web-ui`)
- **Action Overlay UI (`index.vue`)**:
  - Add reactive state `pendingActions = ref<string[]>([])` and `actionCard = ref('')`.
  - Listen for `actionPrompt` from server. When received, show large buttons: [碰] [杠] [过] over the UI.
  - Listen for `selfActionPrompt` (calculated locally or received from server) to show [暗杠] / [加杠] during the player's own turn.
  - Clicking these buttons emits `claimAction` or `selfAction` to the server and hides the buttons.
- **Rendering Revealed Tiles (`TableScene.ts`)**:
  - Update PixiJS logic to receive and render `pengs` and `gangs`. These tiles sit in a structured row in front of the player's hidden hand.
  - When `played`, `peng`, or `gang` events arrive, TableScene completely redraws hands, pengs, and gangs based on authoritative server data snapshot.

## 5. Security & Edge Cases
- Ignore claims from players who are not in the `actionPending.options` list.
- If an action timer expires, default to 'pass'.
- Cannot Peng/Gang if Wall is empty (or limit depends on specific rules, usually drawing the last tile prohibits further Kongs).
