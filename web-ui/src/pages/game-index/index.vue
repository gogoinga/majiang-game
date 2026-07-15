<template>
  <div class="game-page">
    <div
      :inert="hasOpenDialog"
      :aria-hidden="hasOpenDialog ? 'true' : 'false'"
    >
      <!-- Pixi 画布 -->
      <div ref="pixiContainer" class="absolute inset-0" />

      <button
        v-if="!showNicknameDialog && !showRoundEndDialog"
        @click="goBackToLobby"
        class="game-shell-button game-shell-button--back absolute z-[72]"
      >
        返回大厅
      </button>

      <!-- 底部状态栏 -->
      <div
        v-if="!inGame"
        class="compact-status-bar compact-status-bar--idle absolute z-40"
      >
        <span class="compact-status-pill compact-status-pill--wide" :title="roomId">
          <span class="compact-status-pill__label">房间：</span>
          <span class="compact-status-pill__value">{{ roomId }}</span>
        </span>
        <span class="compact-status-pill compact-status-pill--wide" :title="displayName">
          <span class="compact-status-pill__label">当前用户：</span>
          <span class="compact-status-pill__value">{{ displayName }}</span>
        </span>
        <span class="compact-status-pill">
          <span class="compact-status-pill__label">在线：</span>
          <span class="compact-status-pill__value">{{ playerCount }}/4</span>
        </span>
        <span class="compact-status-pill">
          <span class="compact-status-pill__label">已准备：</span>
          <span class="compact-status-pill__value">{{ readyCount }}/4</span>
        </span>

        <button
          @click="handleReady"
          :disabled="isReady"
          class="compact-action-button compact-action-button--ready compact-status-bar__ready"
        >
          {{ isReady ? "已准备" : "准备" }}
        </button>
      </div>

      <!-- 倒数小浮窗 -->
      <!-- Timer Overlay -->
      <div
        v-if="countdownVisible"
        class="compact-countdown-box absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      >
        <div class="compact-countdown-label">
          {{
            promptVisible
              ? "请选择操作..."
              : gameStore.turn === null
                ? "等待其余玩家判断..."
                : isMyTurn
                  ? "您的回合"
                  : "等待其余玩家出牌..."
          }}
        </div>
        <div
          class="compact-countdown-value transition-colors duration-300"
          :class="
            timeLeft <= 3
              ? 'text-red-500 animate-[pulse_0.5s_infinite]'
              : 'text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)]'
          "
        >
          {{ timeLeft }}
        </div>
      </div>

      <!-- 开局提示 -->
      <div
        v-if="gameStart"
        class="absolute inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none"
      >
        <span class="text-3xl leading-none text-center text-white animate-pulse sm:text-5xl"
          >牌局开始！</span
        >
      </div>

      <div
        v-for="badge in scoreBadges"
        :key="badge.uid"
        class="compact-score-badge absolute z-30 pointer-events-none"
        :style="badge.style"
      >
        <div class="compact-score-badge__card">
          <div class="compact-score-badge__name">
            {{ badge.nickname }}
          </div>
          <div class="compact-score-badge__value">
            {{ formatScore(badge.score) }}
          </div>
        </div>
      </div>

      <!-- Action Intercept Overlay -->
      <div
        v-if="promptVisible"
        class="compact-action-bar compact-action-bar--claim absolute z-50"
      >
        <button
          v-if="promptOptions.includes('peng')"
          @click="selectClaimAction('peng')"
          class="compact-action-button compact-action-button--blue"
        >
          碰
        </button>
        <button
          v-if="promptOptions.includes('gang')"
          @click="selectClaimAction('gang')"
          class="compact-action-button compact-action-button--purple"
        >
          杠
        </button>
        <button
          @click="selectClaimAction('pass')"
          class="compact-action-button compact-action-button--gray"
        >
          过
        </button>
      </div>

      <!-- Self Action Overlay -->
      <div
        v-if="selfOptions.length > 0 && isMyTurn"
        class="compact-action-bar compact-action-bar--self absolute z-50"
      >
        <button
          v-for="opt in selfOptions"
          :key="opt.type + (opt.card || '')"
          @click="selectSelfAction(opt.type, opt.card)"
          class="compact-action-button"
          :class="
            opt.type === 'hu'
              ? 'compact-action-button--red'
              : 'compact-action-button--green'
          "
        >
          {{
            opt.type === "hu" ? "胡" : opt.type === "an_gang" ? "暗杠" : "加杠"
          }}
        </button>
        <button
          @click="selfOptions = []"
          class="compact-action-button compact-action-button--gray"
        >
          {{ hasHuOption ? "继续打牌" : "暂不" }}
        </button>
      </div>
    </div>

    <div
      v-if="showNicknameDialog"
      class="overlay-mask absolute inset-0 z-[70] flex items-center justify-center"
    >
      <div
        class="overlay-card overlay-card--nickname"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-dialog-title"
      >
        <div id="nickname-dialog-title" class="overlay-title">输入昵称</div>
        <div class="overlay-copy">
          进入牌局前先给自己起个名字，后面计分和总分都会用这个昵称展示。
        </div>
        <input
          ref="nicknameInputRef"
          v-model.trim="nicknameInput"
          aria-label="昵称"
          maxlength="12"
          placeholder="例如：小李"
          class="overlay-input"
          @keydown.enter="confirmNickname"
        />
        <button
          @click="confirmNickname"
          class="overlay-submit overlay-submit--amber"
        >
          进入牌局
        </button>
      </div>
    </div>

    <div
      v-if="showRoundEndDialog"
      class="overlay-mask absolute inset-0 z-[65] flex items-center justify-center"
    >
      <div
        class="overlay-card overlay-card--round"
        role="dialog"
        aria-modal="true"
        aria-labelledby="round-end-dialog-title"
      >
        <div class="overlay-kicker">ROUND OVER</div>
        <div id="round-end-dialog-title" class="overlay-title overlay-title--result">
          {{ roundWinnerText }}
        </div>
        <div
          v-if="roundBonusTiles.length > 0"
          class="overlay-panel"
        >
          <div class="overlay-panel__title">
            中码展示
          </div>
          <div class="overlay-tiles">
            <img
              v-for="(tile, idx) in roundBonusTiles"
              :key="tile + idx"
              :src="getTileImage(tile)"
              :alt="tile"
              class="overlay-tile-image"
            />
          </div>
          <div class="overlay-panel__score">
            中码 +{{ roundBonusScore }}
          </div>
        </div>
        <div class="overlay-copy overlay-copy--round">
          点击“继续”后等待其他玩家确认，即可开始下一把。
        </div>
        <button
          ref="continueButtonRef"
          @click="handleContinueNextRound"
          :disabled="continueSubmitted"
          class="overlay-submit overlay-submit--emerald"
        >
          {{ continueSubmitted ? "已继续，等待其他玩家..." : "继续" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { createApp } from "@/pixi/app";
import { gameStore } from "@/stores/game";
import { useSocket } from "@/hooks/useSocket";
import { Card, CARD_HEIGHT, CARD_WIDTH } from "@/pixi/entities/Card";
import { getPublicTileUrl, sortTiles } from "@/utils";
console.log("game-gg--");
const USER_ID_STORAGE_KEY = "majiang:userId";
const NICKNAME_STORAGE_KEY = "majiang:nickname";

const createRandomUserId = () => "u-" + Math.random().toString(36).slice(2, 8);
const readStoredValue = (key: string) =>
  typeof window === "undefined" ? "" : window.sessionStorage.getItem(key) || "";

const route = useRoute();
const router = useRouter();
const roomId = computed(() => String(route.params.roomId || ""));
const pixiContainer = ref<HTMLElement>();
const nicknameInputRef = ref<HTMLInputElement>();
const continueButtonRef = ref<HTMLButtonElement>();
const playerCount = ref(0);
const userId = ref(readStoredValue(USER_ID_STORAGE_KEY) || createRandomUserId());
const nicknameInput = ref(readStoredValue(NICKNAME_STORAGE_KEY));
const showNicknameDialog = ref(!nicknameInput.value);
const joinedRoom = ref(false);
const showRoundEndDialog = ref(false);
const continueSubmitted = ref(false);
const roundWinnerText = ref("");
const roundBonusTiles = ref<string[]>([]);
const roundBonusScore = ref(0);
let pixiApp: Awaited<ReturnType<typeof createApp>>["app"] | null = null;
let handleViewportResize: (() => void) | null = null;
let cleanupSocketListeners: (() => void) | null = null;
const viewportSize = ref({ width: 0, height: 0 });
const readyList = ref<string[]>([]); // 已准备的 userId 列表
const readyCount = computed(() => readyList.value.length);
const isReady = computed(() => readyList.value.includes(userId.value));
const inGame = ref(false);
const gameStart = ref(false);
const countdownVisible = ref(false);
const timeLeft = ref(0);
const isMyTurn = computed(() => gameStore.turn === gameStore.myId);
type SelfActionType = "an_gang" | "jia_gang" | "hu";
let turnTimerInterval: number | null = null;
let actionTimerInterval: number | null = null;

const promptOptions = ref<string[]>([]);
const promptCard = ref("");
const promptVisible = ref(false);
const selfOptions = ref<{ type: SelfActionType; card?: string }[]>([]);
const hasHuOption = computed(() =>
  selfOptions.value.some((opt) => opt.type === "hu"),
);
const hasOpenDialog = computed(
  () => showNicknameDialog.value || showRoundEndDialog.value,
);
const displayName = computed(
  () => gameStore.nicknames[gameStore.myId] || nicknameInput.value || userId.value,
);
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
const updateViewportSize = () => {
  if (pixiContainer.value) {
    viewportSize.value = {
      width: pixiContainer.value.clientWidth,
      height: pixiContainer.value.clientHeight,
    };
    return;
  }

  if (typeof window !== "undefined") {
    viewportSize.value = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
};
const scoreBadges = computed(() => {
  const width = viewportSize.value.width || (typeof window !== "undefined" ? window.innerWidth : 0);
  const height =
    viewportSize.value.height || (typeof window !== "undefined" ? window.innerHeight : 0);
  const isCompactLandscape =
    width > height && width <= 960 && height <= 430 && Math.min(width, height) <= 430;
  const handScale = isCompactLandscape ? 0.54 : 0.84;
  const handGap = CARD_WIDTH * handScale * (isCompactLandscape ? 0.54 : 0.76);
  const handWidth = CARD_WIDTH * handScale;
  const handHeight = CARD_HEIGHT * handScale;
  const bottomHandScale = handScale * (isCompactLandscape ? 0.85 : 0.95);
  const bottomHandWidth = CARD_WIDTH * bottomHandScale;
  const bottomHandHeight = CARD_HEIGHT * bottomHandScale;
  const bottomHandGap = bottomHandWidth * (isCompactLandscape ? 0.96 : 0.92);
  const badgeSideGap = clamp(handWidth * 0.34, 0.65 * 16, 0.95 * 16);
  const uids = Object.keys(gameStore.hands);
  return uids.map((uid, idx) => {
    const relIdx = (idx - gameStore.myIndex + 4) % 4;
    const seat = ["bottom", "right", "top", "left"][relIdx] as
      | "bottom"
      | "right"
      | "top"
      | "left";
  const total = Math.max(gameStore.hands[uid]?.length || 13, 1);
  let style: Record<string, string> = {};
  const horizontalStartX = (width - total * handGap) / 2;
  const bottomHorizontalStartX = (width - total * bottomHandGap) / 2;
  const verticalStartY = (height - total * handGap) / 2;
  const leftHandX = handWidth * (isCompactLandscape ? 1.96 : 1.22) + (isCompactLandscape ? 18 : 12);
  const rightHandX =
      width - handWidth * (isCompactLandscape ? 1.96 : 1.22) - (isCompactLandscape ? 18 : 12);
    const topHandY = handHeight * (isCompactLandscape ? 1.12 : 1.1) + (isCompactLandscape ? 14 : 14);
    const bottomHandY =
      height - handHeight * (isCompactLandscape ? 1.12 : 1.1) - (isCompactLandscape ? 18 : 40);

    if (seat === "bottom") {
      style = {
        left: `${Math.max(bottomHorizontalStartX - badgeSideGap, 6)}px`,
        top: `${bottomHandY - bottomHandHeight * 0.02}px`,
        transform: "translate(-100%, -50%)",
      };
    } else if (seat === "right") {
      style = {
        left: `${rightHandX - badgeSideGap}px`,
        top: `${verticalStartY}px`,
        transform: "translate(-100%, -50%)",
      };
    } else if (seat === "top") {
      style = {
        left: `${Math.max(horizontalStartX, 8)}px`,
        top: `${topHandY + handHeight * 0.62}px`,
        transform: "translate(0, -50%)",
      };
    } else {
      style = {
        left: `${leftHandX + badgeSideGap}px`,
        top: `${verticalStartY}px`,
        transform: "translate(0, -50%)",
      };
    }

    return {
      uid,
      nickname: gameStore.nicknames[uid] || uid,
      score: gameStore.scores[uid] ?? 0,
      style,
    };
  });
});

const { connect, on, off, socketId, send } = useSocket();
const formatScore = (score: number) => (score >= 0 ? `+${score}` : `${score}`);
const getTileImage = (tile: string) => getPublicTileUrl(tile);
const focusNicknameInput = async () => {
  await nextTick();
  nicknameInputRef.value?.focus();
};

const focusContinueButton = async () => {
  await nextTick();
  continueButtonRef.value?.focus();
};

const persistIdentity = (nickname: string) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(USER_ID_STORAGE_KEY, userId.value);
  window.sessionStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
};

const clearTurnTimer = () => {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
};

const clearActionTimer = () => {
  if (actionTimerInterval) {
    clearInterval(actionTimerInterval);
    actionTimerInterval = null;
  }
};

const closeClaimPrompt = () => {
  clearActionTimer();
  countdownVisible.value = false;
  promptVisible.value = false;
  promptOptions.value = [];
  promptCard.value = "";
};

const startTurnCountdown = (timeLimit: number) => {
  clearTurnTimer();
  timeLeft.value = timeLimit;
  countdownVisible.value = true;
  turnTimerInterval = window.setInterval(() => {
    timeLeft.value -= 1;
    if (timeLeft.value <= 0) {
      clearTurnTimer();
    }
  }, 1000);
};

const startClaimCountdown = (timeLimit: number) => {
  clearActionTimer();
  timeLeft.value = timeLimit;
  countdownVisible.value = true;
  actionTimerInterval = window.setInterval(() => {
    timeLeft.value -= 1;
    if (timeLeft.value <= 0) {
      clearActionTimer();
      countdownVisible.value = false;
      promptVisible.value = false;
    }
  }, 1000);
};

const selectClaimAction = (action: string) => {
  closeClaimPrompt();
  send("claimAction", { action });
};

const updateSelfOptions = (canHu: boolean = false) => {
  const myId = gameStore.myId;
  const myHand = gameStore.hands[myId] || [];
  const options: { type: SelfActionType; card?: string }[] = [];

  if (canHu) {
    options.push({ type: "hu" });
  }

  const counts: Record<string, number> = {};
  myHand.forEach((c: string) => {
    counts[c] = (counts[c] || 0) + 1;
  });

  for (const [c, count] of Object.entries(counts)) {
    if (count === 4) options.push({ type: "an_gang", card: c });
    const hasPeng = (gameStore.pengs[myId] || []).some(
      (peng: string[]) => peng[0] === c,
    );
    if (count >= 1 && hasPeng) options.push({ type: "jia_gang", card: c });
  }

  selfOptions.value = options;
};

const selectSelfAction = (type: SelfActionType, card?: string) => {
  selfOptions.value = [];
  send("selfAction", { action: type, card });
};

// Ensures cleanup
onUnmounted(() => {
  clearTurnTimer();
  clearActionTimer();
});

const joinRoom = (roomId: string, userId: string, nickname: string) => {
  console.log("joinRoom", roomId, userId);
  joinedRoom.value = true;
  send("joinRoom", { roomId, userId, nickname });
};

const rejoinRoom = () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    showNicknameDialog.value = true;
    joinedRoom.value = false;
    return;
  }

  persistIdentity(nickname);
  gameStore.myId = userId.value;
  gameStore.nicknames = { ...gameStore.nicknames, [userId.value]: nickname };
  showNicknameDialog.value = false;
  if (!roomId.value) return;
  joinRoom(roomId.value, userId.value, nickname);
};

const confirmNickname = () => {
  const nickname = nicknameInput.value.trim() || `玩家${userId.value.slice(-4)}`;
  nicknameInput.value = nickname;
  rejoinRoom();
};

const handleReady = () => {
  console.log("我按了准备啦～");
  send("ready", {});
};

const handleContinueNextRound = () => {
  if (continueSubmitted.value) return;
  continueSubmitted.value = true;
  handleReady();
};

const leaveCurrentRoom = () => {
  if (!roomId.value) return;
  send("leaveRoom", { roomId: roomId.value });
  gameStore.reset();
  playerCount.value = 0;
  readyList.value = [];
  joinedRoom.value = false;
  inGame.value = false;
};

const goBackToLobby = () => {
  leaveCurrentRoom();
  router.push("/rooms");
};

watch(
  showNicknameDialog,
  (visible) => {
    if (visible) {
      void focusNicknameInput();
    }
  },
  { immediate: true },
);

watch(showRoundEndDialog, (visible) => {
  if (visible) {
    void focusContinueButton();
  }
});

onBeforeRouteLeave((_to, _from, next) => {
  leaveCurrentRoom();
  next();
});

onMounted(async () => {
  if (!roomId.value) {
    router.replace("/rooms");
    return;
  }
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(USER_ID_STORAGE_KEY, userId.value);
    window.localStorage.removeItem(USER_ID_STORAGE_KEY);
    window.localStorage.removeItem(NICKNAME_STORAGE_KEY);
  }
  gameStore.myId = userId.value;
  if (nicknameInput.value.trim()) {
    gameStore.nicknames = {
      ...gameStore.nicknames,
      [userId.value]: nicknameInput.value.trim(),
    };
  }

  if (pixiContainer.value) {
    const { app, tableScene } = await createApp(pixiContainer.value);
    pixiApp = app;
    handleViewportResize = () => {
      app.renderer.resize(pixiContainer.value!.clientWidth, pixiContainer.value!.clientHeight);
      updateViewportSize();
      tableScene.resizeLayout();
    };
    updateViewportSize();
    window.addEventListener("resize", handleViewportResize);
    connect();
    const handleSocketConnect = () => {
      rejoinRoom();
    };
    const handleRoomJoinError = ({ message }: { message?: string }) => {
      window.alert(message || "加入房间失败");
      gameStore.reset();
      router.replace("/rooms");
    };
    const handlePlayerCount = (count: number) => {
      console.log("当前在线人数---", count);
      playerCount.value = count;
    };
    const handleSomeoneReady = (list: string[]) => {
      console.log("已准备的人数列表---", list);
      // 如果自己在 list 里，就置灰按钮
      readyList.value = list;
    };
    const handleDeal = ({
        hands,
        seats,
        river,
        bankerIndex,
        pengs,
        gangs,
        huCandidates,
        scores,
        nicknames,
        turn,
        resumed,
      }: {
        hands: Record<string, string[]>;
        seats: string[];
        river: Record<string, string[]>;
        bankerIndex: number;
        pengs?: Record<string, string[][]>;
        gangs?: Record<string, { type: string; card: string }[]>;
        huCandidates?: Record<string, boolean>;
        scores?: Record<string, number>;
        nicknames?: Record<string, string>;
        turn?: string;
        resumed?: boolean;
      }) => {
      closeClaimPrompt();
      selfOptions.value = [];
      readyList.value = [];
      showRoundEndDialog.value = false;
      continueSubmitted.value = false;
      roundBonusTiles.value = [];
      roundBonusScore.value = 0;
      inGame.value = true;
      gameStart.value = !resumed;
      const userIds = Object.keys(hands);
      const bankerUserId = userIds[bankerIndex];
      const currentTurn = turn ?? bankerUserId ?? null;
      gameStore.turn = currentTurn;
      gameStore.seats = seats;
      gameStore.bankerIndex = bankerIndex;
      gameStore.hands = hands;
      gameStore.river = river;
      gameStore.pengs = pengs || {};
      gameStore.gangs = gangs || {};
      gameStore.scores = scores || {};
      gameStore.nicknames = nicknames || gameStore.nicknames;

      gameStore.myIndex = Object.keys(hands).indexOf(gameStore.myId);
      console.log("发牌", river, hands, bankerIndex, gameStore.myIndex);
      tableScene.renderRiver(gameStore.river);
      tableScene.renderAllHands(hands, gameStore.myIndex, bankerIndex);
      tableScene.renderPublicTiles(
        gameStore.pengs,
        gameStore.gangs,
        gameStore.myIndex,
        bankerIndex,
      );

      if (currentTurn === gameStore.myId) {
        updateSelfOptions(Boolean(huCandidates?.[gameStore.myId]));
      } else {
        selfOptions.value = [];
      }

      if (!resumed) {
        window.setTimeout(() => {
          gameStart.value = false;
        }, 1200);
      }
    };
    const handleStartTimer = ({
      turn,
      timeLimit,
    }: {
      turn: string;
      timeLimit: number;
    }) => {
      closeClaimPrompt();
      clearTurnTimer();
      gameStore.turn = turn;
      console.log("开始计时-----");
      tableScene.showTurnIndicator(turn);
      startTurnCountdown(timeLimit);
    };

    const handlePlayed = ({
      userId,
      card,
      nextTurn,
      hands: backendHands,
      river: backendRiver,
      scores,
    }: {
      userId: string;
      card: string;
      nextTurn?: string;
      hands?: Record<string, string[]>;
      river?: Record<string, string[]>;
      scores?: Record<string, number>;
    }) => {
      clearTurnTimer();
      closeClaimPrompt();
      selfOptions.value = [];
      countdownVisible.value = false;

      console.log("played", userId, card, nextTurn);
      if (backendHands) {
        gameStore.hands = backendHands;
      } else {
        const handIdx = gameStore.hands[userId]?.indexOf(card);
        if (handIdx >= 0) gameStore.hands[userId].splice(handIdx, 1);
      }
      if (backendRiver) {
        gameStore.river = backendRiver;
      } else {
        gameStore.river[userId].push(card);
      }
      if (scores) {
        gameStore.scores = scores;
      }
      tableScene.renderRiver(gameStore.river);
      tableScene.renderHand(userId, gameStore.hands[userId] || []);
      gameStore.turn = nextTurn ?? null;

      if (nextTurn) {
        tableScene.showTurnIndicator(nextTurn);
      } else {
        tableScene.hideTurnIndicator();
      }
    };
    const handleDraw = ({
      userId,
      tile,
      wallLeft,
      hands: backendHands,
      canHu,
    }: {
      userId: string;
      tile: string;
      wallLeft: number;
      hands?: Record<string, string[]>;
      canHu?: boolean;
    }) => {
      if (backendHands) {
        gameStore.hands = backendHands;
      } else {
        gameStore.hands[userId] = gameStore.hands[userId] || [];
        gameStore.hands[userId].push(tile);
        gameStore.hands[userId] = sortTiles(gameStore.hands[userId]);
      }
      tableScene.renderHand(userId, gameStore.hands[userId] || []);
      console.log(
        "摸牌---",
        userId === gameStore.myId ? "我" : "他人",
        tile,
        "剩余牌墙",
        wallLeft,
      );

      if (userId === gameStore.myId) {
        updateSelfOptions(Boolean(canHu));
      }
    };
    const handleGameOver = ({
      winner,
      scores,
      readyUserIds,
      bonusTiles,
      bonusScore,
    }: {
      winner?: string;
      scores?: Record<string, number>;
      readyUserIds?: string[];
      bonusTiles?: string[];
      bonusScore?: number;
    }) => {
      clearTurnTimer();
      closeClaimPrompt();
      selfOptions.value = [];
      countdownVisible.value = false;
      inGame.value = false;
      gameStart.value = false;
      readyList.value = readyUserIds || [];
      continueSubmitted.value = false;
      showRoundEndDialog.value = true;
      if (scores) gameStore.scores = scores;
      roundBonusTiles.value = bonusTiles || [];
      roundBonusScore.value = bonusScore || 0;
      roundWinnerText.value = winner
        ? `${gameStore.nicknames[winner] || winner} 获胜`
        : "本局流局";

      console.log("gameOver", winner);
      tableScene.hideTurnIndicator();
    };
    const handleGlobalActionTimer = ({ timeLimit }: { timeLimit: number }) => {
      clearTurnTimer();
      gameStore.turn = null;
      tableScene.hideTurnIndicator();
      startClaimCountdown(timeLimit);
    };
    const handleActionPrompt = ({
      card,
      options,
      timeLimit,
    }: {
      card: string;
      options: string[];
      timeLimit: number;
    }) => {
      clearTurnTimer();
      gameStore.turn = null;
      tableScene.hideTurnIndicator();
      promptCard.value = card;
      promptOptions.value = options;
      promptVisible.value = true;
      startClaimCountdown(timeLimit);
    };
    const handlePeng = ({
      userId,
      pengs,
      river,
      hands,
    }: {
      userId: string;
      pengs?: Record<string, string[][]>;
      river?: Record<string, string[]>;
      hands?: Record<string, string[]>;
    }) => {
      closeClaimPrompt();
      selfOptions.value = [];
      gameStore.turn = userId;
      console.log("Player Peng:", pengs, river);
      if (pengs) gameStore.pengs = pengs;
      if (river) gameStore.river = river;
      tableScene.renderRiver(gameStore.river);
      tableScene.renderPublicTiles(
        gameStore.pengs,
        gameStore.gangs,
        gameStore.myIndex,
        gameStore.bankerIndex,
      );
      if (hands) {
        gameStore.hands = hands;
        Object.keys(hands).forEach((uid) => {
          tableScene.renderHand(uid, hands[uid]);
        });
      }
    };
    const handleGang = ({
      userId,
      gangs,
      pengs,
      river,
      hands,
      scores,
    }: {
      userId: string;
      gangs?: Record<string, { type: string; card: string }[]>;
      pengs?: Record<string, string[][]>;
      river?: Record<string, string[]>;
      hands?: Record<string, string[]>;
      scores?: Record<string, number>;
    }) => {
      closeClaimPrompt();
      selfOptions.value = [];
      gameStore.turn = userId;
      console.log("Player Gang:", gangs, river);
      if (gangs) gameStore.gangs = gangs;
      if (pengs) gameStore.pengs = pengs;
      if (river) gameStore.river = river;
      if (scores) gameStore.scores = scores;
      tableScene.renderRiver(gameStore.river);
      tableScene.renderPublicTiles(
        gameStore.pengs,
        gameStore.gangs,
        gameStore.myIndex,
        gameStore.bankerIndex,
      );
      if (hands) {
        gameStore.hands = hands;
        Object.keys(hands).forEach((uid) => {
          tableScene.renderHand(uid, hands[uid]);
        });
      }
    };

    on("connect", handleSocketConnect);
    on("roomJoinError", handleRoomJoinError);
    on("playerCount", handlePlayerCount);
    on("someoneReady", handleSomeoneReady);
    on("deal", handleDeal);
    on("startTimer", handleStartTimer);
    on("played", handlePlayed);
    on("draw", handleDraw);
    on("gameOver", handleGameOver);
    on("globalActionTimer", handleGlobalActionTimer);
    on("actionPrompt", handleActionPrompt);
    on("peng", handlePeng);
    on("gang", handleGang);

    cleanupSocketListeners = () => {
      off("connect", handleSocketConnect);
      off("roomJoinError", handleRoomJoinError);
      off("playerCount", handlePlayerCount);
      off("someoneReady", handleSomeoneReady);
      off("deal", handleDeal);
      off("startTimer", handleStartTimer);
      off("played", handlePlayed);
      off("draw", handleDraw);
      off("gameOver", handleGameOver);
      off("globalActionTimer", handleGlobalActionTimer);
      off("actionPrompt", handleActionPrompt);
      off("peng", handlePeng);
      off("gang", handleGang);
    };

    if (socketId.value && nicknameInput.value.trim()) {
      rejoinRoom();
    }
  }
});

onUnmounted(() => {
  cleanupSocketListeners?.();
  cleanupSocketListeners = null;
  if (handleViewportResize) {
    window.removeEventListener("resize", handleViewportResize);
    handleViewportResize = null;
  }
  if (pixiApp) {
    pixiApp.destroy({ removeView: true }, { children: true, context: true });
    pixiApp = null;
  }
});
</script>

<style scoped>
.game-page {
  position: relative;
  width: 100%;
  height: 100dvh;
  min-height: 100dvh;
  font-size: 16px;
  overflow: hidden;
}

.overlay-mask {
  background: rgba(2, 6, 23, 0.58);
}

.game-shell-button {
  border: 0.0625rem solid rgba(255, 255, 255, 0.2);
  border-radius: 9999rem;
  background: rgba(15, 23, 42, 0.58);
  padding: 0.55rem 0.95rem;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
  color: rgba(255, 255, 255, 0.94);
  box-shadow: 0 0.75rem 2rem rgba(15, 23, 42, 0.22);
  backdrop-filter: blur(0.8rem);
  transition: background-color 150ms ease;
}

.game-shell-button--back {
  left: calc(0.75rem + var(--app-safe-area-left));
  top: calc(0.75rem + var(--app-safe-area-top));
}

.game-shell-button:hover {
  background: rgba(15, 23, 42, 0.76);
}

.overlay-card {
  width: min(24.5rem, calc(100vw - 1.5rem));
  border: 0.0625rem solid rgba(255, 255, 255, 0.16);
  border-radius: 1.4rem;
  background: rgba(2, 6, 23, 0.92);
  padding: 1.2rem 1.15rem 1.1rem;
  color: white;
  box-shadow: 0 1.25rem 3rem rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(0.9rem);
}

.overlay-card--nickname {
  width: min(23rem, calc(100vw - 1.5rem));
}

.overlay-card--round {
  width: min(22rem, calc(100vw - 1.5rem));
}

.overlay-kicker {
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.28em;
  color: rgba(167, 243, 208, 0.82);
}

.overlay-title {
  font-size: clamp(1.45rem, 2.7vw, 1.9rem);
  font-weight: 900;
  line-height: 1.08;
  letter-spacing: 0.03em;
}

.overlay-title--result {
  margin-top: 0.6rem;
}

.overlay-copy {
  margin-top: 0.38rem;
  font-size: 0.84rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.72);
}

.overlay-copy--round {
  margin-top: 0.72rem;
}

.overlay-input {
  margin-top: 0.95rem;
  width: 100%;
  border: 0.0625rem solid rgba(255, 255, 255, 0.18);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.82rem 0.95rem;
  font-size: 1rem;
  color: white;
  outline: none;
}

.overlay-input::placeholder {
  color: rgba(255, 255, 255, 0.34);
}

.overlay-input:focus {
  border-color: rgb(252 211 77);
}

.overlay-submit {
  margin-top: 0.95rem;
  width: 100%;
  border-radius: 1rem;
  padding: 0.82rem 1rem;
  font-size: 1rem;
  font-weight: 900;
  line-height: 1.1;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.overlay-submit:disabled {
  cursor: not-allowed;
  background: rgb(71 85 105);
  color: rgba(255, 255, 255, 0.72);
}

.overlay-submit--amber {
  background: rgb(251 191 36);
  color: rgb(15 23 42);
}

.overlay-submit--amber:hover {
  background: rgb(252 211 77);
}

.overlay-submit--emerald {
  background: rgb(16 185 129);
  color: rgb(15 23 42);
}

.overlay-submit--emerald:hover {
  background: rgb(52 211 153);
}

.overlay-panel {
  margin-top: 0.9rem;
  border: 0.0625rem solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.05);
  padding: 0.8rem;
}

.overlay-panel__title {
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.24em;
  color: rgba(253, 230, 138, 0.85);
}

.overlay-tiles {
  margin-top: 0.65rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
}

.overlay-tile-image {
  height: 3.35rem;
  width: auto;
  border-radius: 0.65rem;
  box-shadow: 0 0.75rem 1.5rem rgba(15, 23, 42, 0.28);
}

.overlay-panel__score {
  margin-top: 0.65rem;
  text-align: center;
  font-size: 0.88rem;
  font-weight: 800;
  color: rgb(253 230 138);
}

.compact-status-bar {
  display: flex;
  width: fit-content;
  max-width: min(calc(100vw - 1rem - var(--app-safe-area-inline)), 44rem);
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 0.0625rem solid rgba(255, 255, 255, 0.16);
  border-radius: 9999rem;
  background: rgba(17, 24, 39, 0.9);
  padding: 0.45rem 0.55rem;
  color: white;
  box-shadow: 0 0.9rem 2.4rem rgba(15, 23, 42, 0.3);
  backdrop-filter: blur(0.9rem);
}

.compact-status-bar--idle {
  left: calc(0.5rem + var(--app-safe-area-left));
  right: calc(0.5rem + var(--app-safe-area-right));
  bottom: calc(0.7rem + var(--app-safe-area-bottom));
  margin-inline: auto;
}

.compact-status-pill {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.1rem;
  min-width: 0;
  border-radius: 9999rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.42rem 0.6rem;
  font-size: 0.7rem;
  line-height: 1;
}

.compact-status-pill--wide {
  max-width: 11.5rem;
}

.compact-status-pill__label {
  flex: 0 0 auto;
  white-space: nowrap;
}

.compact-status-pill__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-countdown-box {
  display: flex;
  min-width: 10rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  border: 0.0625rem solid rgba(255, 255, 255, 0.18);
  border-radius: 1rem;
  background: rgba(2, 6, 23, 0.56);
  padding: 0.75rem 1rem;
  box-shadow: 0 1rem 2.2rem rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(0.75rem);
}

.compact-countdown-label {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.82);
}

.compact-countdown-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono,
    Courier New, monospace;
  font-size: clamp(2.1rem, 6vw, 3.1rem);
  font-weight: 900;
  line-height: 0.92;
  letter-spacing: -0.06em;
}

.compact-score-badge__card {
  min-width: 3.75rem;
  border: 0.0625rem solid rgba(209, 250, 229, 0.42);
  border-radius: 0.82rem;
  background: rgba(6, 95, 70, 0.68);
  padding: 0.3rem 0.42rem;
  text-align: center;
  box-shadow: 0 0.75rem 1.6rem rgba(6, 78, 59, 0.22);
  backdrop-filter: blur(0.65rem);
}

.compact-score-badge__name {
  max-width: 4.3rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.46rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: rgba(236, 253, 245, 0.9);
}

.compact-score-badge__value {
  margin-top: 0.16rem;
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 0.125rem 0.375rem rgba(6, 78, 59, 0.22);
}

.compact-action-bar {
  display: flex;
  width: fit-content;
  max-width: min(calc(100vw - 1rem - var(--app-safe-area-inline)), 26rem);
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.45rem;
  white-space: nowrap;
}

.compact-action-bar--claim,
.compact-action-bar--self {
  left: calc(0.5rem + var(--app-safe-area-left));
  right: calc(0.5rem + var(--app-safe-area-right));
  bottom: calc(4.75rem + var(--app-safe-area-bottom));
  margin-inline: auto;
}

.compact-action-button {
  flex: 0 0 auto;
  white-space: nowrap;
  border: 0.0625rem solid rgba(255, 255, 255, 0.9);
  border-radius: 9999rem;
  padding: 0.62rem 1rem;
  font-size: 0.96rem;
  font-weight: 800;
  line-height: 1;
  color: white;
  box-shadow: 0 0.9rem 1.8rem rgba(15, 23, 42, 0.26);
  transition: background-color 150ms ease;
}

.compact-action-button--ready {
  border-color: rgba(167, 243, 208, 0.45);
  background: rgb(22 163 74);
  padding-inline: 0.92rem;
  font-size: 0.78rem;
}

.compact-status-bar__ready {
  flex: 0 0 auto;
}

.compact-action-button--ready:disabled {
  background: rgb(100 116 139);
}

.compact-action-button--blue {
  background: rgb(59 130 246);
}

.compact-action-button--blue:hover {
  background: rgb(96 165 250);
}

.compact-action-button--purple {
  background: rgb(168 85 247);
}

.compact-action-button--purple:hover {
  background: rgb(192 132 252);
}

.compact-action-button--gray {
  background: rgb(107 114 128);
}

.compact-action-button--gray:hover {
  background: rgb(156 163 175);
}

.compact-action-button--green {
  background: rgb(34 197 94);
}

.compact-action-button--green:hover {
  background: rgb(74 222 128);
}

.compact-action-button--red {
  background: rgb(220 38 38);
}

.compact-action-button--red:hover {
  background: rgb(239 68 68);
}

@media (min-width: 640px) {
  .game-shell-button {
    padding: 0.62rem 1.1rem;
    font-size: 0.82rem;
  }

  .game-shell-button--back {
    left: calc(1rem + var(--app-safe-area-left));
    top: calc(1rem + var(--app-safe-area-top));
  }

  .overlay-card {
    padding: 1.35rem 1.3rem 1.25rem;
  }

  .compact-status-pill {
    font-size: 0.74rem;
  }

  .compact-action-bar {
    gap: 0.6rem;
  }

  .compact-action-button {
    padding: 0.7rem 1.15rem;
    font-size: 1rem;
  }
}

@media (max-width: 560px) {
  .compact-status-bar {
    width: min(calc(100vw - 1rem - var(--app-safe-area-inline)), 26rem);
    flex-wrap: wrap;
    justify-content: flex-start;
    border-radius: 1.1rem;
    padding: 0.5rem;
  }

  .compact-status-pill {
    flex: 1 1 calc(50% - 0.24rem);
    min-width: 0;
  }

  .compact-status-pill--wide {
    max-width: none;
  }

  .compact-status-bar__ready {
    margin-left: auto;
  }
}
</style>
