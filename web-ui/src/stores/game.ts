import { reactive } from "vue";

export const gameStore = reactive({
  myId: "", // 当前用户业务 id
  turn: null as string | null, // 当前轮到谁
  banker: "", // 庄家
  seats: [] as string[], // 座位
  bankerIndex: 0, // 庄家索引
  myIndex: 0, // 我索引
  hands: {} as Record<string, string[]>, // 各家手牌
  river: {} as Record<string, string[]>, // 各家牌河
  pengs: {} as Record<string, string[][]>, // 各家碰牌
  gangs: {} as Record<string, { type: string, card: string }[]>, // 各家杠牌
  scores: {} as Record<string, number>, // 各家积分
  nicknames: {} as Record<string, string>, // 各家昵称
  setTurn(uid: string) {
    this.turn = uid;
  },
  reset() {
    this.banker = "";
    this.seats = [];
    this.bankerIndex = 0;
    this.myIndex = 0;
    this.hands = {};
    this.river = {};
    this.pengs = {};
    this.gangs = {};
    this.scores = {};
    this.nicknames = {};
    this.turn = null;
  },
});
