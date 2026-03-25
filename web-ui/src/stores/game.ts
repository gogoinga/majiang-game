import { reactive } from "vue";

export const gameStore = reactive({
  myId: "", // 当前用户业务 id
  turn: "", // 当前轮到谁
  banker: "", // 庄家
  seats: [] as string[], // 座位
  bankerIndex: 0, // 庄家索引
  myIndex: 0, // 我索引
  hands: {} as Record<string, string[]>, // 各家手牌
  river: {} as Record<string, string[]>, // 各家牌河
  setTurn(uid: string) {
    this.turn = uid;
  },
  reset() {
    this.hands = {};
    this.river = {};
    this.turn = "";
  },
});
