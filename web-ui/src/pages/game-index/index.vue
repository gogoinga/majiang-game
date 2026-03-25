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
    <div
      v-if="countdownVisible"
      class="absolute top-24 right-8 bg-black/70 text-white px-6 py-4 rounded-xl shadow-lg border-2 border-yellow-500 whitespace-nowrap flex flex-col items-center justify-center pointer-events-none z-50 transition-opacity"
    >
      <div class="text-sm mb-1 text-gray-300">
        {{ turnUserId === userId ? '请您出牌' : '等待玩家出牌' }}
      </div>
      <div class="text-4xl font-bold font-mono" :class="timeLeft <= 3 ? 'text-red-500 animate-[pulse_0.5s_infinite]' : 'text-yellow-400'">
        {{ timeLeft }}s
      </div>
    </div>

    <!-- 开局提示 -->
    <div v-if="gameStart" class="absolute inset-0 bg-black/50 flex-center">
      <span class="text-5xl text-white animate-pulse">牌局开始！</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
const turnUserId = ref("");
let timerInterval: number | null = null;

const { connect, on, off, socketId, send } = useSocket();

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
    on("played", ({ userId, card, nextTurn, hands: backendHands }) => {
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
    });

    on("gameOver", ({ winner }) => {
      console.log("gameOver", winner);
      // 游戏结束时隐藏出牌标记
      tableScene.hideTurnIndicator();
      // 可以在这里添加其他游戏结束的逻辑
    });
  }
});
</script>

<style scoped></style>
