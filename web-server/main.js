import { createServer } from "http";
import express from "express";
import { Server } from "socket.io";
import { dealHands } from "./createDeck.js";
import { canHuWithExposedSets } from "./winCheck.js";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const rooms = new Map(); // roomId -> { players: Map<socketId, userId>, ready: Set<socketId> }
// 每个房间的游戏状态
const roomState = new Map(); // roomId -> { hands, river, turn, banker, wall, timerId }

// 定时器倒计时时间（秒）
const TURN_TIMEOUT_SECONDS = 12;
const CLAIM_TIMEOUT_SECONDS = 8;
const HU_BONUS_DRAW_COUNT = 6;

function clonePayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function maskHandsForUser(hands, visibleUserId) {
  return Object.fromEntries(
    Object.entries(hands || {}).map(([uid, hand]) => [
      uid,
      uid === visibleUserId ? [...hand] : Array(hand.length).fill("1t"),
    ])
  );
}

function personalizePayloadForUser(payload, userId) {
  const personalized = clonePayload(payload);
  if (personalized.hands) {
    personalized.hands = maskHandsForUser(personalized.hands, userId);
  }
  if (personalized.huCandidates) {
    personalized.huCandidates = Object.fromEntries(
      Object.keys(personalized.huCandidates).map((uid) => [
        uid,
        uid === userId ? personalized.huCandidates[uid] : false,
      ])
    );
  }
  if (personalized.userId && personalized.userId !== userId) {
    if ("tile" in personalized) personalized.tile = "";
    if ("canHu" in personalized) personalized.canHu = false;
  }
  return personalized;
}

function emitPersonalizedToRoom(roomId, event, payload) {
  const room = rooms.get(roomId);
  if (!room || !payload || !payload.hands) {
    io.to(roomId).emit(event, payload);
    return;
  }

  for (const [socketId, uid] of room.players.entries()) {
    io.to(socketId).emit(event, personalizePayloadForUser(payload, uid));
  }
}

function getConnectedUserIds(room) {
  if (!room) return [];
  return [...new Set(room.players.values())];
}

function getPlayerOrder(room, state) {
  if (state?.playerOrder?.length) return [...state.playerOrder];
  if (room?.playerOrder?.length) return [...room.playerOrder];
  return getConnectedUserIds(room);
}

function getReadyUserIds(room) {
  if (!room) return [];
  const connectedUserIds = new Set(getConnectedUserIds(room));
  return [...room.ready].filter((userId) => connectedUserIds.has(userId));
}

function getPlayerSeats(userIds) {
  const seats = ["东", "南", "西", "北"];
  return {
    seats,
    playerSeats: Object.fromEntries(
      userIds.map((userId, index) => [userId, seats[index]])
    ),
  };
}

function buildNicknames(room, userIds) {
  return Object.fromEntries(
    userIds.map((uid) => [uid, room.nicknames.get(uid) || uid])
  );
}

function isGameInProgress(state) {
  return Boolean(state && Object.keys(state.hands || {}).length > 0);
}

function getUserIdBySocket(room, socketId) {
  return room?.players.get(socketId);
}

function emitRoomSnapshotToSocket(roomId, socketId, userId) {
  const room = rooms.get(roomId);
  const state = roomState.get(roomId);
  if (!room || !state || !isGameInProgress(state)) return;

  const userIds = getPlayerOrder(room, state);
  const { seats, playerSeats } = getPlayerSeats(userIds);
  const nicknames = buildNicknames(room, userIds);
  const bankerIndex = Math.max(0, userIds.indexOf(state.banker));
  const huCandidates = Object.fromEntries(
    userIds.map((uid) => [uid, canCurrentUserHu(state, uid)])
  );

  io.to(socketId).emit("deal", personalizePayloadForUser({
    hands: maskHandsForUser(state.hands, userId),
    seats,
    playerSeats,
    river: clonePayload(state.river),
    pengs: clonePayload(state.pengs),
    gangs: clonePayload(state.gangs),
    scores: clonePayload(state.scores),
    nicknames,
    huCandidates,
    bankerIndex,
    wallCount: state.wall.length,
    turn: state.actionPending ? null : state.turn,
    resumed: true,
  }, userId));

  if (state.roundResult) {
    io.to(socketId).emit(
      "gameOver",
      buildGameOverPayload(
        roomId,
        state.roundResult.winner,
        state.roundResult.nextBanker,
        state.roundResult.bonusTiles || [],
        state.roundResult.bonusScore || 0
      )
    );
    return;
  }

  if (state.actionPending) {
    io.to(socketId).emit("globalActionTimer", {
      timeLimit: CLAIM_TIMEOUT_SECONDS,
    });
    if (state.actionPending.options?.[userId]) {
      io.to(socketId).emit("actionPrompt", {
        card: state.actionPending.card,
        options: state.actionPending.options[userId],
        timeLimit: CLAIM_TIMEOUT_SECONDS,
      });
    }
    return;
  }

  if (state.turn) {
    io.to(socketId).emit("startTimer", {
      turn: state.turn,
      timeLimit: TURN_TIMEOUT_SECONDS,
    });
  }
}

function canCurrentUserHu(state, userId) {
  if (!state?.hands?.[userId]) return false;
  const exposedSetCount =
    (state.pengs?.[userId]?.length || 0) + (state.gangs?.[userId]?.length || 0);
  return canHuWithExposedSets(state.hands[userId], exposedSetCount);
}

function ensureScoresForPlayers(state, playerIds) {
  const existing = state.scores || {};
  state.scores = Object.fromEntries(
    playerIds.map((uid) => [uid, existing[uid] ?? 0])
  );
}

function addScore(state, userId, delta) {
  if (!state.scores[userId]) {
    state.scores[userId] = 0;
  }
  state.scores[userId] += delta;
}

function applyAnGangScore(state, userId) {
  addScore(state, userId, 6);
  Object.keys(state.scores).forEach((uid) => {
    if (uid !== userId) addScore(state, uid, -2);
  });
}

function applyJiaGangScore(state, userId) {
  addScore(state, userId, 3);
  Object.keys(state.scores).forEach((uid) => {
    if (uid !== userId) addScore(state, uid, -1);
  });
}

function applyMingGangScore(state, userId, fromUserId) {
  addScore(state, userId, 3);
  addScore(state, fromUserId, -3);
}

function applyBankerOpeningFollowScore(state, bankerId) {
  addScore(state, bankerId, -3);
  Object.keys(state.scores).forEach((uid) => {
    if (uid !== bankerId) addScore(state, uid, 1);
  });
}

function isHuBonusHit(tile) {
  return ["东", "中"].includes(tile) || /^[1359][st]$/.test(tile);
}

function resolveHuBonus(state, winnerId) {
  if (!state || !winnerId) {
    return { bonusTiles: [], bonusScore: 0 };
  }

  const bonusTiles = state.wall.splice(
    Math.max(0, state.wall.length - HU_BONUS_DRAW_COUNT),
    Math.min(HU_BONUS_DRAW_COUNT, state.wall.length)
  );
  const bonusScore = bonusTiles.filter(isHuBonusHit).length;
  if (bonusScore > 0) {
    addScore(state, winnerId, bonusScore);
  }

  return { bonusTiles, bonusScore };
}

function createEmptyRoom() {
  return {
    players: new Map(),
    ready: new Set(),
    nicknames: new Map(),
    playerOrder: [],
    createdAt: Date.now(),
  };
}

function createEmptyState() {
  return {
    hands: {},
    pengs: {},
    gangs: {},
    scores: {},
    river: {},
    turn: null,
    banker: null,
    wall: [],
    timerId: null,
    actionPending: null,
    playerOrder: [],
    roundResult: null,
    openingFollow: null,
  };
}

function ensureRoomEntry(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createEmptyRoom());
  }
  if (!roomState.has(roomId)) {
    roomState.set(roomId, createEmptyState());
  }

  return {
    room: rooms.get(roomId),
    state: roomState.get(roomId),
  };
}

function generateRoomId() {
  let roomId = "";
  do {
    roomId = `mj-${Math.random().toString(36).slice(2, 8)}`;
  } while (rooms.has(roomId));
  return roomId;
}

function buildRoomList() {
  return [...rooms.entries()]
    .map(([roomId, room]) => {
      const state = roomState.get(roomId);
      const playerCount = getConnectedUserIds(room).length;
      const readyCount = state?.roundResult
        ? getReadyUserIds(room).length
        : isGameInProgress(state)
          ? playerCount
          : getReadyUserIds(room).length;
      return {
        roomId,
        playerCount,
        readyCount,
        inGame: isGameInProgress(state),
        createdAt: room.createdAt,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function emitRoomList(targetSocketId = null) {
  const payload = buildRoomList();
  if (targetSocketId) {
    io.to(targetSocketId).emit("roomList", payload);
    return;
  }
  io.emit("roomList", payload);
}

function broadcastRoomPresence(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  io.to(roomId).emit("someoneReady", getReadyUserIds(room));
  io.to(roomId).emit("playerCount", getConnectedUserIds(room).length);
  emitRoomList();
}

function clearActionPendingTimer(state) {
  if (state?.actionPending?.timerId) {
    clearTimeout(state.actionPending.timerId);
    state.actionPending.timerId = null;
  }
}

function buildGameOverPayload(roomId, winner, nextBanker, bonusTiles = [], bonusScore = 0) {
  const room = rooms.get(roomId);
  const state = roomState.get(roomId);
  return {
    winner,
    nextBanker,
    scores: clonePayload(state?.scores || {}),
    readyUserIds: room ? getReadyUserIds(room) : [],
    bonusTiles,
    bonusScore,
  };
}

function emitGameOver(roomId, winner, nextBanker, bonusTiles = [], bonusScore = 0) {
  const state = roomState.get(roomId);
  if (!state) return;

  stopTimer(roomId);
  clearActionPendingTimer(state);
  state.turn = null;
  state.actionPending = null;
  state.roundResult = { winner, nextBanker, bonusTiles, bonusScore };

  io.to(roomId).emit(
    "gameOver",
    buildGameOverPayload(roomId, winner, nextBanker, bonusTiles, bonusScore)
  );
}

function updateOpeningFollowState(state, userId, card) {
  const openingFollow = state?.openingFollow;
  if (!openingFollow || openingFollow.settled) return;

  if (userId === openingFollow.bankerId) {
    if (!openingFollow.targetCard) {
      openingFollow.targetCard = card;
    }
    return;
  }

  if (!openingFollow.targetCard || openingFollow.firstDiscards[userId]) return;

  openingFollow.firstDiscards[userId] = card;
  if (card !== openingFollow.targetCard) {
    openingFollow.settled = true;
    return;
  }

  if (openingFollow.followers.every((uid) => openingFollow.firstDiscards[uid])) {
    applyBankerOpeningFollowScore(state, openingFollow.bankerId);
    openingFollow.settled = true;
  }
}

function cleanupRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (getConnectedUserIds(room).length > 0) {
    broadcastRoomPresence(roomId);
    return;
  }

  const state = roomState.get(roomId);
  stopTimer(roomId);
  clearActionPendingTimer(state);
  rooms.delete(roomId);
  roomState.delete(roomId);
  emitRoomList();
}

function detachSocketFromRoom(roomId, socketId, preserveReady = false) {
  const room = rooms.get(roomId);
  const state = roomState.get(roomId);
  if (!room) return;

  const userId = room.players.get(socketId);
  room.players.delete(socketId);

  const socket = io.sockets.sockets.get(socketId);
  socket?.leave(roomId);

  const userStillConnected =
    userId && getConnectedUserIds(room).includes(userId);
  if (userId && !preserveReady && !userStillConnected) {
    room.ready.delete(userId);
  }
  if (userId && !userStillConnected && !isGameInProgress(state)) {
    room.nicknames.delete(userId);
    room.playerOrder = room.playerOrder.filter((uid) => uid !== userId);
  }

  cleanupRoomIfEmpty(roomId);
}

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
  
  // 自动打出最后一张牌（刚摸的牌或最右边的牌）
  const card = hand[hand.length - 1];
  console.log(`[AutoPlay] ${userId} 自动打出最后一张牌 ${card}`);
  
  handlePlayCard(roomId, userId, card);
}

function emitToUserInRoom(roomId, userId, event, payload) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const [socketId, uid] of room.players.entries()) {
    if (uid === userId) {
      io.to(socketId).emit(event, payload);
    }
  }
}

function proceedToNextTurn(roomId, fromUserId) {
  const room = rooms.get(roomId);
  const state = roomState.get(roomId);
  if (!room || !state) return;

  const uids = getPlayerOrder(room, state);
  const nextIdx = (uids.indexOf(fromUserId) + 1) % 4;
  const nextUser = uids[nextIdx];

  if (state.wall.length === 0) {
    room.ready.clear();
    emitRoomList();
    emitGameOver(roomId, null, state.banker);
    return;
  }

  const drawnTile = state.wall.pop();
  state.hands[nextUser].push(drawnTile);
  state.turn = nextUser;
  const canHu = canCurrentUserHu(state, nextUser);

  const handsSnapshot = JSON.parse(JSON.stringify(state.hands));
  emitPersonalizedToRoom(roomId, "draw", {
    userId: nextUser,
    tile: drawnTile,
    wallLeft: state.wall.length,
    hands: handsSnapshot,
    canHu,
  });

  startTimer(roomId);
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
  updateOpeningFollowState(state, userId, card);

  // 2. 游戏结束判断（简单示例：手牌空）
  if (state.hands[userId].length === 0) {
    state.banker = userId;
    room.ready.clear(); // 游戏结束，清空准备状态
    emitRoomList();
    emitGameOver(roomId, userId, userId);
    return;
  }

  // 3. 检查其他人是否有碰/明杠
  const options = {};
  const uids = getPlayerOrder(room, state);
  for (const uid of uids) {
    if (uid === userId) continue;
    const count = state.hands[uid].filter(c => c === card).length;
    const userOptions = [];
    if (count >= 2) userOptions.push('peng');
    if (count === 3) userOptions.push('gang');
    if (userOptions.length > 0) options[uid] = userOptions;
  }

  const handsSnapshot = JSON.parse(JSON.stringify(state.hands));
  const riverSnapshot = JSON.parse(JSON.stringify(state.river));
  emitPersonalizedToRoom(roomId, "played", {
    userId,
    card,
    hands: handsSnapshot,
    river: riverSnapshot,
    scores: state.scores,
    nextTurn: null // null indicates waiting for actions
  });

  if (Object.keys(options).length > 0) {
    // 等待截牌
    state.actionPending = { card, fromUserId: userId, options, timerId: null };

    // 先广播全房进入认领阶段，再给可操作玩家定向发弹窗
    io.to(roomId).emit("globalActionTimer", { timeLimit: CLAIM_TIMEOUT_SECONDS });

    // 通知相关玩家
    for (const [uid, ops] of Object.entries(options)) {
      emitToUserInRoom(roomId, uid, "actionPrompt", {
        card,
        options: ops,
        timeLimit: CLAIM_TIMEOUT_SECONDS,
      });
    }

    // 设置8秒等待自动过
    state.actionPending.timerId = setTimeout(() => {
      if (state.actionPending) {
        const fromUser = state.actionPending.fromUserId;
        state.actionPending = null;
        proceedToNextTurn(roomId, fromUser);
      }
    }, CLAIM_TIMEOUT_SECONDS * 1000);
  } else {
    // 没人能碰/杠，直接进入下家回合
    proceedToNextTurn(roomId, userId);
  }
}

io.on("connection", (socket) => {
  emitRoomList(socket.id);

  socket.on("requestRoomList", () => {
    emitRoomList(socket.id);
  });

  socket.on("createRoom", () => {
    const roomId = generateRoomId();
    ensureRoomEntry(roomId);
    emitRoomList();
    io.to(socket.id).emit("roomCreated", { roomId });
  });

  socket.on("joinRoom", ({ roomId, userId, nickname }) => {
    if (!roomId || !userId) return;

    for (const joinedRoomId of [...socket.rooms].filter(
      (joinedId) => joinedId !== socket.id && joinedId !== roomId
    )) {
      detachSocketFromRoom(joinedRoomId, socket.id);
    }

    const { room, state } = ensureRoomEntry(roomId);
    const playerOrder = getPlayerOrder(room, state);

    if (isGameInProgress(state) && !playerOrder.includes(userId)) {
      io.to(socket.id).emit("roomJoinError", {
        message: "该房间正在牌局中，当前只能原房间玩家重连进入。",
      });
      emitRoomList(socket.id);
      return;
    }

    if (!isGameInProgress(state) && room.playerOrder.length >= 4 && !room.playerOrder.includes(userId)) {
      io.to(socket.id).emit("roomJoinError", {
        message: "该房间已经满员了，请选择其他房间。",
      });
      emitRoomList(socket.id);
      return;
    }

    socket.join(roomId);

    for (const [existingSocketId, existingUserId] of room.players.entries()) {
      if (existingUserId === userId && existingSocketId !== socket.id) {
        room.players.delete(existingSocketId);
        const existingSocket = io.sockets.sockets.get(existingSocketId);
        existingSocket?.leave(roomId);
      }
    }

    if (
      !room.playerOrder.includes(userId) &&
      (!isGameInProgress(state) || state.playerOrder.includes(userId))
    ) {
      room.playerOrder.push(userId);
    }

    room.players.set(socket.id, userId);
    room.nicknames.set(userId, nickname || room.nicknames.get(userId) || userId);

    broadcastRoomPresence(roomId);
    emitRoomSnapshotToSocket(roomId, socket.id, userId);
  });

  socket.on("leaveRoom", ({ roomId }) => {
    if (!roomId) return;
    detachSocketFromRoom(roomId, socket.id);
  });

  socket.on("ready", () => {
    const roomId = [...socket.rooms].find((r) => r !== socket.id); // 获取所在房间
    if (!roomId) return;
    const room = rooms.get(roomId);
    const state = roomState.get(roomId);
    if (!room || !state) return;
    const userId = getUserIdBySocket(room, socket.id);
    if (!userId) return;
    room.ready.add(userId);

    // 广播该玩家已准备
    broadcastRoomPresence(roomId);

    // 4 人均准备且房间正好 4 人
    if (getConnectedUserIds(room).length === 4 && getReadyUserIds(room).length === 4) {
      // 触发发牌（dealHands 返回 hands 和发牌后剩余的牌作为牌墙，保证每张牌全局唯一）
      const { hands, banker, wall } = dealHands(room, state?.banker);
      const userIds = Object.keys(hands);
      const { seats, playerSeats } = getPlayerSeats(userIds);
      const bankerIndex = 0; // 庄家永远坐东（第 0 位）

      const nicknames = buildNicknames(room, userIds);

      ensureScoresForPlayers(state, userIds);
      state.hands = hands;
      state.playerOrder = [...userIds];
      room.playerOrder = [...userIds];
      state.river = Object.fromEntries(userIds.map((uid) => [uid, []]));
      state.pengs = Object.fromEntries(userIds.map((uid) => [uid, []]));
      state.gangs = Object.fromEntries(userIds.map((uid) => [uid, []]));
      state.actionPending = null;
      state.openingFollow = {
        bankerId: banker,
        targetCard: null,
        followers: userIds.filter((uid) => uid !== banker),
        firstDiscards: {},
        settled: false,
      };

      state.turn = banker;
      state.banker = banker; // 设置当前庄家
      state.wall = wall;
      state.roundResult = null;
      const huCandidates = Object.fromEntries(
        userIds.map((uid) => [uid, canCurrentUserHu(state, uid)])
      );

      emitPersonalizedToRoom(roomId, "deal", {
        hands,
        seats,
        playerSeats, // 新增：玩家座位映射
        river: state.river,
        pengs: state.pengs,
        gangs: state.gangs,
        scores: state.scores,
        nicknames,
        huCandidates,
        bankerIndex,
        wallCount: wall.length,
        turn: banker,
      });

      // 清空 ready，避免多发 dealHands 污染数据，导致出现 > 4 张相同牌
      room.ready.clear();
      emitRoomList();

      // 游戏开始，开启倒计时
      startTimer(roomId);
    }
  });

  /* 打出一张牌 */
  socket.on("playCard", ({ card }) => {
    const roomId = [...socket.rooms].find((r) => r !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    const userId = getUserIdBySocket(room, socket.id);

    // 调用统一处理函数
    handlePlayCard(roomId, userId, card);
  });

  socket.on("claimAction", ({ action }) => { // action: 'peng', 'gang', or 'pass'
    const roomId = [...socket.rooms].find(r => r !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    const userId = getUserIdBySocket(room, socket.id);
    const state = roomState.get(roomId);
    if (!room || !state || !state.actionPending) return;

    // Ignore if user isn't prompted
    const allowedActions = state.actionPending.options[userId];
    if (!allowedActions) return;
    if (action !== 'pass' && !allowedActions.includes(action)) return;

    clearTimeout(state.actionPending.timerId);
    const card = state.actionPending.card;
    const fromUser = state.actionPending.fromUserId;

    if (action === 'pass') {
      // 简单处理：只要有人点过，就默认放弃抢牌，继续流程 (若有多人抢牌需更复杂投票逻辑，目前简化版)
      state.actionPending = null;
      proceedToNextTurn(roomId, fromUser);
      return;
    }

    // Remove card from river of fromUser
    const riverIdx = state.river[fromUser].lastIndexOf(card);
    if (riverIdx !== -1) state.river[fromUser].splice(riverIdx, 1);

    if (action === 'peng') {
      // 扣除两张手牌
      for(let i=0; i<2; i++) state.hands[userId].splice(state.hands[userId].indexOf(card), 1);
      state.pengs[userId].push([card, card, card]);

      state.actionPending = null;
      state.turn = userId; // 拿牌者获得回合，不发牌

      emitPersonalizedToRoom(roomId, "peng", {
        userId,
        card,
        pengs: state.pengs,
        river: state.river,
        hands: state.hands,
      });
      startTimer(roomId);
    }
    else if (action === 'gang') {
      // 扣除三张手牌
      for(let i=0; i<3; i++) state.hands[userId].splice(state.hands[userId].indexOf(card), 1);
      state.gangs[userId].push({ type: 'ming', card });
      applyMingGangScore(state, userId, fromUser);

      state.actionPending = null;
      state.turn = userId; // 获得回合

      emitPersonalizedToRoom(roomId, "gang", {
        userId,
        card,
        gangs: state.gangs,
        river: state.river,
        hands: state.hands,
        scores: state.scores,
      });

      // 杠完必须多摸一张牌
      if (state.wall.length === 0) {
        room.ready.clear();
        emitRoomList();
        emitGameOver(roomId, null, state.banker);
        return;
      }
      const drawnTile = state.wall.pop();
      state.hands[userId].push(drawnTile);
      emitPersonalizedToRoom(roomId, "draw", {
        userId,
        tile: drawnTile,
        wallLeft: state.wall.length,
        hands: state.hands,
        canHu: canCurrentUserHu(state, userId),
      });
      startTimer(roomId);
    }
  });

  socket.on("selfAction", ({ action, card }) => { // action: 'an_gang', 'jia_gang', or 'hu'
    const roomId = [...socket.rooms].find(r => r !== socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    const userId = getUserIdBySocket(room, socket.id);
    const state = roomState.get(roomId);
    if (!room || !state || state.turn !== userId) return;

    if (action === 'hu') {
      if (!canCurrentUserHu(state, userId)) return;
      addScore(state, userId, 2);
      state.banker = userId;
      const { bonusTiles, bonusScore } = resolveHuBonus(state, userId);
      room.ready.clear();
      emitRoomList();
      emitGameOver(roomId, userId, userId, bonusTiles, bonusScore);
      return;
    }

    if (action === 'an_gang') {
      const count = state.hands[userId].filter(c => c === card).length;
      if (count !== 4) return;
      for(let i=0; i<4; i++) state.hands[userId].splice(state.hands[userId].indexOf(card), 1);
      state.gangs[userId].push({ type: 'an', card });
      applyAnGangScore(state, userId);
    }
    else if (action === 'jia_gang') {
      const inHandParams = state.hands[userId].filter(c => c === card).length;
      const pengIndex = state.pengs[userId].findIndex(p => p[0] === card);
      if (inHandParams < 1 || pengIndex === -1) return;

      state.hands[userId].splice(state.hands[userId].indexOf(card), 1);
      state.pengs[userId].splice(pengIndex, 1);
      state.gangs[userId].push({ type: 'jia', card });
      applyJiaGangScore(state, userId);
    } else {
      return;
    }

    emitPersonalizedToRoom(roomId, "gang", {
      userId,
      card,
      getType: action,
      gangs: state.gangs,
      pengs: state.pengs,
      hands: state.hands,
      scores: state.scores,
    });
    stopTimer(roomId);

    // 摸杠上花
    if (state.wall.length === 0) {
      room.ready.clear();
      emitRoomList();
      emitGameOver(roomId, null, state.banker);
      return;
    }
    const drawnTile = state.wall.pop();
    state.hands[userId].push(drawnTile);
    emitPersonalizedToRoom(roomId, "draw", {
      userId,
      tile: drawnTile,
      wallLeft: state.wall.length,
      hands: state.hands,
      canHu: canCurrentUserHu(state, userId),
    });
    startTimer(roomId);
  });

  // 新增：游戏结束事件
  socket.on("gameEnd", ({ winner }) => {
    const roomId = [...socket.rooms].find((r) => r !== socket.id);
    if (!roomId) return;

    const state = roomState.get(roomId);
    if (!state) return;

    // 设置获胜者为下一局庄家
    state.banker = winner;
    let bonusTiles = [];
    let bonusScore = 0;
    if (winner) {
      addScore(state, winner, 2);
      const bonusResult = resolveHuBonus(state, winner);
      bonusTiles = bonusResult.bonusTiles;
      bonusScore = bonusResult.bonusScore;
    }

    const room = rooms.get(roomId);
    if (room) {
      room.ready.clear();
    }
    emitRoomList();

    // 通知所有玩家游戏结束
    emitGameOver(roomId, winner, winner, bonusTiles, bonusScore);
  });

  socket.on("disconnecting", () => {
    for (const roomId of [...socket.rooms].filter((r) => r !== socket.id)) {
      detachSocketFromRoom(roomId, socket.id, true);
    }
  });
});

server.listen(3000, () => console.log("listening on *:3000"));
