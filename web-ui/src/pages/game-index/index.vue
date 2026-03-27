<template>
  <div class="w-full h-full flex flex-col">
    <!-- Pixi 画布 -->
    <div ref="pixiContainer" class="w-full h-lvh" />

    <!-- 底部状态栏 -->
    <div
      class="h-20 bg-gray-900 text-white flex items-center justify-start gap-6 px-4"
    >
      <span>房间：{{ roomId }}</span>
      <span>当前用户：{{ userId }}</span>
      <span>在线：{{ playerCount }}/4</span>
      <span>已准备：{{ readyCount }}/4</span>

      <button
        @click="handleReady"
        :disabled="isReady"
        class="bg-green-600 px-4 py-2 rounded disabled:bg-gray-500"
      >
        {{ isReady ? "已准备" : "准备" }}
      </button>
    </div>

    <!-- 倒数小浮窗 -->
    <!-- Timer Overlay -->
    <div
      v-if="countdownVisible"
      class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-50 flex flex-col items-center justify-center bg-black/50 px-8 py-4 rounded-xl border-2 border-white/20 shadow-2xl backdrop-blur-sm"
    >
      <div
        class="text-white text-lg mb-1 tracking-widest font-semibold opacity-80"
      >
        {{ isMyTurn ? "您的回合" : "等待其余玩家出牌..." }}
      </div>
      <div
        class="text-6xl font-black font-mono tracking-tighter transition-colors duration-300"
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
    <div v-if="gameStart" class="absolute inset-0 bg-black/50 flex-center">
      <span class="text-5xl text-white animate-pulse">牌局开始！</span>
    </div>

    <!-- Action Intercept Overlay -->
    <div v-if="promptVisible" class="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-50 flex gap-4">
      <button v-if="promptOptions.includes('peng')" @click="selectClaimAction('peng')" class="px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-full border-2 border-white shadow-xl text-xl">碰</button>
      <button v-if="promptOptions.includes('gang')" @click="selectClaimAction('gang')" class="px-6 py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-full border-2 border-white shadow-xl text-xl">杠</button>
      <button @click="selectClaimAction('pass')" class="px-6 py-3 bg-gray-500 hover:bg-gray-400 text-white font-bold rounded-full border-2 border-white shadow-xl text-xl">过</button>
    </div>

    <!-- Self Action Overlay -->
    <div v-if="selfOptions.length > 0 && isMyTurn" class="absolute bottom-32 left-1/4 transform -translate-x-1/2 z-50 flex gap-4">
      <button v-for="opt in selfOptions" :key="opt.type+opt.card" @click="selectSelfAction(opt.type, opt.card)" class="px-6 py-3 bg-green-500 hover:bg-green-400 text-white font-bold rounded-full border-2 border-white shadow-xl text-xl">
        {{ opt.type === 'an_gang' ? '暗杠' : '加杠' }}
      </button>
      <button @click="selfOptions = []" class="px-6 py-3 bg-gray-500 hover:bg-gray-400 text-white font-bold rounded-full border-2 border-white shadow-xl text-xl">暂不</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, onUnmounted } from "vue";
import { createApp } from "@/pixi/app";
import { gameStore } from "@/stores/game";
import { useSocket } from "@/hooks/useSocket";
import { Card } from "@/pixi/entities/Card";
import { sortTiles } from "@/utils";
console.log("game-gg--");
const roomId = "room-xiu";
const pixiContainer = ref<HTMLElement>();
const playerCount = ref(0);
const userId = ref("u-" + Math.random().toString(36).slice(2, 8));
const readyList = ref<string[]>([]); // 已准备的 userId 列表
const readyCount = computed(() => readyList.value.length);
const isReady = computed(() => readyList.value.includes(userId.value));
const gameStart = ref(false);
const countdownVisible = ref(false);
const timeLeft = ref(0);
const isMyTurn = ref(false);
let timerInterval: number | null = null;

const promptOptions = ref<string[]>([]);
const promptCard = ref('');
const promptVisible = ref(false);
const selfOptions = ref<{type: string, card: string}[]>([]); // For An Gang / Jia Gang

const { connect, on, off, socketId, send } = useSocket();

const selectClaimAction = (action: string) => {
  promptVisible.value = false;
  socketId.value && send("claimAction", { action });
};

const selectSelfAction = (type: string, card: string) => {
  selfOptions.value = [];
  socketId.value && send("selfAction", { action: type, card });
};

// Ensures cleanup
onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
});

const joinRoom = (roomId: string, userId: string) => {
  console.log("joinRoom", roomId, userId);
  send("joinRoom", { roomId, userId });
};

const handleReady = () => {
  console.log("我按了准备啦～");
  send("ready", {});
};

onMounted(async () => {
  if (pixiContainer.value) {
    const { tableScene } = await createApp(pixiContainer.value);
    connect();
    // 先移除旧监听，防止 HMR/重复挂载导致同一事件被多次处理（如摸牌重复添加）
    off("playerCount");
    off("someoneReady");
    off("deal");
    off("played");
    off("draw");
    off("gameOver");
    off("startTimer");
    // 监听后端事件
    joinRoom(roomId, userId.value); // 2. 立即进房
    gameStore.myId = userId.value; // 3. 记录自己的 userId
    on("playerCount", (count) => {
      console.log("当前在线人数---", count);
      playerCount.value = count;
    });
    on("someoneReady", (list) => {
      console.log("已准备的人数列表---", list);
      // 如果自己在 list 里，就置灰按钮
      readyList.value = list;
    });
    on("deal", ({ hands, seats, river, bankerIndex }) => {
      // 开始牌局：交给 Pixi 渲染
      // gameStore.hands = hands;
      // gameStore.banker = banker;
      promptVisible.value = false;
      selfOptions.value = [];
      // 修复：根据bankerIndex获取对应的userId，而不是直接使用索引
      const userIds = Object.keys(hands);
      const bankerUserId = userIds[bankerIndex];
      gameStore.turn = bankerUserId; // 先轮到庄家
      gameStore.seats = seats;
      gameStore.bankerIndex = bankerIndex;
      gameStore.hands = hands;
      gameStore.river = river;

      gameStore.myIndex = Object.keys(hands).indexOf(gameStore.myId);
      console.log("发牌", river, hands, bankerIndex, gameStore.myIndex);
      tableScene.resetRiver();
      tableScene.renderAllHands(hands, gameStore.myIndex, bankerIndex);
    });
    on("startTimer", ({ turn, timeLimit }) => {
      isMyTurn.value = turn === gameStore.myId;
      timeLeft.value = timeLimit;
      countdownVisible.value = true;
      console.log("开始计时-----");
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = window.setInterval(() => {
        timeLeft.value -= 1;
        if (timeLeft.value <= 0) {
          clearInterval(timerInterval);
        }
      }, 1000);
    });

    on("played", ({ userId, card, nextTurn, hands: backendHands }) => {
      countdownVisible.value = false;
      if (timerInterval) clearInterval(timerInterval);

      console.log("played", userId, card, nextTurn);
      // 优先使用后端下发的完整 hands 作为权威数据源，避免前后端不同步
      if (backendHands) {
        gameStore.hands = backendHands;
      } else {
        const handIdx = gameStore.hands[userId]?.indexOf(card);
        if (handIdx >= 0) gameStore.hands[userId].splice(handIdx, 1);
      }
      gameStore.river[userId].push(card);
      tableScene.addToRiver(userId, card);
      tableScene.renderHand(userId, gameStore.hands[userId] || []);
      gameStore.turn = nextTurn;
      tableScene.showTurnIndicator(nextTurn);
    });
    // 监听摸牌事件（仅下家摸牌，userId 为摸牌者）
    on("draw", ({ userId, tile, wallLeft, hands: backendHands }) => {
      // 优先使用后端下发的完整 hands 作为权威数据源，避免重复添加/少牌
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
        const myHand = gameStore.hands[userId];
        const options: {type: string, card: string}[] = [];

        // Check An Gang
        const counts: Record<string, number> = {};
        myHand.forEach((c: string) => counts[c] = (counts[c] || 0) + 1);
        for (const [c, count] of Object.entries(counts)) {
          if (count === 4) options.push({ type: 'an_gang', card: c });
        }

        selfOptions.value = options;
      }
    });

    on("gameOver", ({ winner }) => {
      countdownVisible.value = false;
      if (timerInterval) clearInterval(timerInterval);

      console.log("gameOver", winner);
      // 游戏结束时隐藏出牌标记
      tableScene.hideTurnIndicator();
      // 可以在这里添加其他游戏结束的逻辑
    });

    on("actionPrompt", ({ card, options, timeLimit }) => {
      promptCard.value = card;
      promptOptions.value = options;
      promptVisible.value = true;
      // Re-use countdown block for the 8s prompt visually
      timeLeft.value = timeLimit;
      countdownVisible.value = true;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = window.setInterval(() => {
        timeLeft.value -= 1;
        if (timeLeft.value <= 0) {
          clearInterval(timerInterval!);
          promptVisible.value = false;
        }
      }, 1000);
    });

    on("peng", ({ userId, card }) => {
       console.log("Player Peng:", userId, card);
       promptVisible.value = false;
    });

    on("gang", ({ userId, card }) => {
       console.log("Player Gang:", userId, card);
       promptVisible.value = false;
    });

  }
});
</script>

<style scoped></style>
