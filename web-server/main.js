import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import { dealHands } from "./createDeck.js";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const rooms = new Map(); // roomId -> { players: Map<socketId, userId>, ready: Set<socketId> }
// 每个房间的游戏状态
const roomState = new Map(); // roomId -> { hands, river, turn, banker, wall, timerId }

// 定时器倒计时时间（秒）
const TURN_TIMEOUT_SECONDS = 12;

function startTimer(roomId) {
  const room = rooms.get(roomId);
  const state = roomState.get(roomId);
  if (!room || !state || !state.turn) return;

  // 清除旧的定时器
  if (state.timerId) {
    clearTimeout(state.timerId);
  }

  // 广播计时器开始
  io.to(roomId).emit("startTimer", {
    turn: state.turn,
    timeLimit: TURN_TIMEOUT_SECONDS
  });

  // 设置自动打牌
  state.timerId = setTimeout(() => {
    autoPlay(roomId);
  }, TURN_TIMEOUT_SECONDS * 1000);
}

function stopTimer(roomId) {
  const state = roomState.get(roomId);
  if (state && state.timerId) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }
}

function autoPlay(roomId) {
  const state = roomState.get(roomId);
  if (!state || !state.turn) return;
  const userId = state.turn;
  const hand = state.hands[userId];
  if (!hand || hand.length === 0) return;
  
  // 自动打出一张随机牌
  const randomIndex = Math.floor(Math.random() * hand.length);
  const card = hand[randomIndex];
  console.log(`[AutoPlay] ${userId} 自动打出随机牌 ${card}`);
  
  handlePlayCard(roomId, userId, card);
}

function handlePlayCard(roomId, userId, card) {
  const room = rooms.get(roomId);
  const state = roomState.get(roomId);
  if (!room || !state) return;

  if (userId !== state.turn) return; // 不是他出牌
  if (!state.hands[userId]?.includes(card)) return; // 手里没这张

  // 停掉当前的定时器
  stopTimer(roomId);

  // 1. 出牌：手牌 → 牌河
  state.hands[userId].splice(state.hands[userId].indexOf(card), 1);
  state.river[userId].push(card);

  // 2. 游戏结束判断（简单示例：手牌空）
  if (state.hands[userId].length === 0) {
    state.banker = userId;
    io.to(roomId).emit("gameOver", { winner: userId, nextBanker: userId });
    room.ready.clear(); // 游戏结束，清空准备状态
    return;
  }

  // 3. 下家摸牌
  const uids = [...room.players.values()];
  const nextIdx = (uids.indexOf(userId) + 1) % 4;
  const nextUser = uids[nextIdx];

  // 4. 牌墙空 → 流局（可换规则）
  if (state.wall.length === 0) {
    io.to(roomId).emit("gameOver", {
      winner: null,
      nextBanker: state.banker,
    }); // 流局
    room.ready.clear(); // 游戏结束，清空准备状态
    return;
  }

  // 5. 给下家发 1 张
  const drawnTile = state.wall.pop();
  state.hands[nextUser].push(drawnTile);

  // 6. 转回合
  state.turn = nextUser;

  // 7. 广播：出牌 + 摸牌 + 新回合（附带完整 hands 作为权威数据源，避免前后端不同步）
  const handsSnapshot = JSON.parse(JSON.stringify(state.hands));
  io.to(roomId).emit("played", {
    userId,
    card,
    nextTurn: nextUser,
    hands: handsSnapshot,
  });
  io.to(roomId).emit("draw", {
    userId: nextUser,
    tile: drawnTile,
    wallLeft: state.wall.length,
    hands: handsSnapshot,
  });

  // 8. 给下家开启新的倒计时
  startTimer(roomId);
}

io.on("connection", (socket) => {
  socket.on("joinRoom", ({ roomId, userId }) => {
    console.log("joinRoom", roomId, userId);
    socket.join(roomId);
    if (!rooms.has(roomId))
      rooms.set(roomId, { players: new Map(), ready: new Set() });

    // 第一次有人进房，创建状态对象
    if (!roomState.has(roomId)) {
      roomState.set(roomId, {
        hands: {}, // userId -> string[]
        river: {}, // userId -> string[]
        turn: null, // 当前出牌人 userId
        banker: null, // 当前庄家 userId
        wall: [], // 牌墙（剩余牌）
        timerId: null, // 定时器 ID
      });
    }
    const room = rooms.get(roomId);
    room.players.set(socket.id, userId);

    console.log("joinRoom---ready----", room.ready);
    // 广播该玩家已准备
    io.to(roomId).emit(
      "someoneReady",
      [...room.ready].map((id) => room.players.get(id))
    );

    // 告诉房间里所有人当前人数
    io.to(roomId).emit("playerCount", room.players.size);

    // 断线清理
    socket.on("disconnect", () => {
      room.players.delete(socket.id);
      room.ready.delete(socket.id);
      io.to(roomId).emit("playerCount", room.players.size);
    });
  });

  socket.on("ready", () => {
    const roomId = [...socket.rooms].find((r) => r !== socket.id); // 获取所在房间
    if (!roomId) return;
    const room = rooms.get(roomId);
    room.ready.add(socket.id);

    // 广播该玩家已准备
    io.to(roomId).emit(
      "someoneReady",
      [...room.ready].map((id) => room.players.get(id))
    );

    // 4 人均准备且房间正好 4 人
    if (room.players.size === 4 && room.ready.size === 4) {
      // 触发发牌（dealHands 返回 hands 和发牌后剩余的牌作为牌墙，保证每张牌全局唯一）
      const { hands, banker, wall } = dealHands(room, roomState.get(roomId)?.banker);
      // 2. 固定座位顺序：0=东 1=南 2=西 3=北
      const seats = ["东", "南", "西", "北"];
      const bankerIndex = 0; // 庄家永远坐东（第 0 位）

      // 创建玩家座位映射
      const userIds = [...room.players.values()];
      const playerSeats = {};
      userIds.forEach((userId, index) => {
        playerSeats[userId] = seats[index];
      });

      const state = roomState.get(roomId);
      state.hands = hands;

      state.river = Object.fromEntries(
        [...room.players.values()].map((uid) => [uid, []])
      );

      state.turn = banker;
      state.banker = banker; // 设置当前庄家
      state.wall = wall;

      console.log("game start", state);
      io.to(roomId).emit("deal", {
        hands,
        seats,
        playerSeats, // 新增：玩家座位映射
        river: state.river,
        bankerIndex,
        wallCount: wall.length,
      });

      // 清空 ready，避免多发 dealHands 污染数据，导致出现 > 4 张相同牌
      room.ready.clear();

      // 游戏开始，开启倒计时
      startTimer(roomId);
    }
  });

  /* 打出一张牌 */
  socket.on("playCard", ({ card }) => {
    const roomId = [...socket.rooms].find((r) => r !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    const userId = [...room.players.entries()].find(
      ([sockId]) => sockId === socket.id
    )?.[1];
    
    // 调用统一处理函数
    handlePlayCard(roomId, userId, card);
  });

  // 新增：游戏结束事件
  socket.on("gameEnd", ({ winner }) => {
    const roomId = [...socket.rooms].find((r) => r !== socket.id);
    if (!roomId) return;

    const state = roomState.get(roomId);
    if (!state) return;

    // 清空游戏过程中的定时器
    stopTimer(roomId);

    // 设置获胜者为下一局庄家
    state.banker = winner;

    const room = rooms.get(roomId);
    if (room) {
      room.ready.clear();
    }

    // 通知所有玩家游戏结束
    io.to(roomId).emit("gameOver", { winner, nextBanker: winner });
  });
});

server.listen(3000, () => console.log("listening on *:3000"));
