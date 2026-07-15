// 生成整副 108 张牌
export function createDeck() {
  const suits = ["t", "s"]; // 筒、条
  const honors = ["东", "南", "西", "北", "中", "发", "白"];
  const deck = [];

  // 筒、条 1-9
  suits.forEach((s) => {
    for (let n = 1; n <= 9; n++) {
      for (let i = 0; i < 4; i++) deck.push(n + s);
    }
  });

  // 字牌
  honors.forEach((h) => {
    for (let i = 0; i < 4; i++) deck.push(h);
  });

  return deck;
}

// 洗牌
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// 发 3 家 13 张，让庄家多 1 张，牌墙为发牌后剩余的牌
export function dealHands(room, previousBanker = null) {
  const deck = shuffle(createDeck()); // 108 张
  const userIds = room.playerOrder?.length
    ? [...room.playerOrder]
    : [...room.players.values()]; // 顺序固定

  // 如果有上一局的庄家，则将其移到第一个位置作为新庄家
  if (previousBanker && userIds.includes(previousBanker)) {
    const bankerIndex = userIds.indexOf(previousBanker);
    // 将庄家移到数组的第一个位置
    const reorderedUserIds = [
      previousBanker,
      ...userIds.filter((uid) => uid !== previousBanker),
    ];

    const hands = {};
    for (let i = 0; i < 4; i++) {
      const count = i === 0 ? 14 : 13; // 第 0 位是庄家
      hands[reorderedUserIds[i]] = deck.splice(0, count); // 直接拿牌
    }

    // 牌墙 = 发牌后剩余的牌（保证每张牌全局唯一）
    return { hands, banker: previousBanker, wall: deck };
  } else {
    // 没有指定庄家或庄家不在当前玩家中，按默认顺序
    const hands = {};
    for (let i = 0; i < 4; i++) {
      const count = i === 0 ? 14 : 13; // 第 0 位是庄家
      hands[userIds[i]] = deck.splice(0, count); // 直接拿牌
    }

    // 牌墙 = 发牌后剩余的牌
    return { hands, banker: userIds[0], wall: deck };
  }
}
