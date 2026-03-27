import * as PIXI from "pixi.js";
import {
  Card,
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_RIVER_SCALE,
} from "@/pixi/entities/Card";
import { CardBack } from "@/pixi/entities/CardBack";
import { gameStore } from "@/stores/game";
import { useSocket } from "@/hooks/useSocket";
import { sortTiles } from "@/utils";

export class TableScene extends PIXI.Container {
  // 各玩家牌河容器（东南西北顺序）
  private riverContainers: Record<string, PIXI.Container> = {};

  private handContainer = new PIXI.Container();

  // 当前出牌玩家的标记
  private turnIndicator: PIXI.Graphics | null = null;

  private otherHandContainers: Record<string, PIXI.Container> = {};

  /* 存 4 家手牌精灵池，key 用 userId */
  private handPools: Record<string, (Card | CardBack)[]> = {};

  constructor(screen: PIXI.Rectangle) {
    super();
    this.initRiverContainers();
  }

  /** 初始化 4 个牌河容器（示例坐标） */
  private initRiverContainers() {
    const W = window.innerWidth,
      H = window.innerHeight;

    // 4 个方位的牌河容器
    this.riverContainers = {
      bottom: new PIXI.Container(),
      right: new PIXI.Container(),
      top: new PIXI.Container(),
      left: new PIXI.Container(),
    };

    // 设置初始位置
    // 下方牌河位置
    this.riverContainers.bottom.x = CARD_WIDTH * 5.4;
    this.riverContainers.bottom.y = H - CARD_HEIGHT * 1.8;
    // 上方牌河位置
    this.riverContainers.top.x = CARD_WIDTH * 5.4;
    this.riverContainers.top.y = CARD_HEIGHT * 1.8;
    // 左侧牌河位置
    this.riverContainers.left.x = CARD_HEIGHT * 1.8;
    this.riverContainers.left.y = CARD_HEIGHT * 2.2;
    // 右侧牌河位置
    this.riverContainers.right.x = W - CARD_HEIGHT * 1.8;
    this.riverContainers.right.y = CARD_HEIGHT * 2.2;

    // 添加到舞台
    Object.values(this.riverContainers).forEach((c) => this.addChild(c));
  }

  /** 把打出的牌移到对应玩家的牌河 */
  moveToRiver(userId: string, cardValue: string) {
    // 根据 userId 找到方位（简化：按数组顺序映射）
    const uids = Object.keys(gameStore.hands);
    const idx = uids.indexOf(userId);
    const pos = ["bottom", "right", "top", "left"][idx];
    const container = this.riverContainers[pos];

    // 创建牌精灵
    const card = new Card(cardValue);
    card.scale.set(0.6); // 牌河里的牌稍小
    card.x = (container.children.length % 10) * 30; // 每行 10 张
    card.y = Math.floor(container.children.length / 10) * 40;
    container.addChild(card);
  }

  resetRiver() {
    Object.values(this.riverContainers).forEach((c) => c.removeChildren());
  }

  /**
   * 显示当前轮到谁出牌的标志
   * @param userId 当前出牌玩家的ID
   */
  showTurnIndicator(userId: string) {
    // 移除现有的标记
    if (this.turnIndicator) {
      this.removeChild(this.turnIndicator);
      this.turnIndicator = null;
    }

    // 根据userId找到玩家的位置
    const uids = Object.keys(gameStore.hands);
    const playerIndex = uids.indexOf(userId);

    // 如果找不到玩家，直接返回
    if (playerIndex === -1) return;

    // 计算相对于当前玩家的位置
    const myIndex = gameStore.myIndex;
    const relativeIndex = (playerIndex - myIndex + 4) % 4;
    const seat = ["bottom", "right", "top", "left"][relativeIndex];

    // 创建新的标记
    this.turnIndicator = new PIXI.Graphics();
    this.turnIndicator.beginFill(0x00ff00, 0.7); // 半透明绿色
    this.turnIndicator.drawCircle(0, 0, 20);
    this.turnIndicator.endFill();

    // 添加文本
    const text = new PIXI.Text({
      text: "出牌",
      style: {
        fontSize: 16,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    text.anchor.set(0.5);
    this.turnIndicator.addChild(text);

    // 根据座位位置设置标记的位置
    switch (seat) {
      case "bottom":
        this.turnIndicator.x = window.innerWidth / 2;
        this.turnIndicator.y = window.innerHeight - CARD_HEIGHT * 2 - 50;
        break;
      case "right":
        this.turnIndicator.x = window.innerWidth - CARD_WIDTH * 2 - 10;
        this.turnIndicator.y = window.innerHeight / 2;
        break;
      case "top":
        this.turnIndicator.x = window.innerWidth / 2;
        this.turnIndicator.y = CARD_HEIGHT * 2;
        break;
      case "left":
        this.turnIndicator.x = CARD_WIDTH * 2 + 10;
        this.turnIndicator.y = window.innerHeight / 2;
        break;
    }

    this.addChild(this.turnIndicator);
  }

  /**
   * 隐藏出牌标记
   */
  hideTurnIndicator() {
    if (this.turnIndicator) {
      this.removeChild(this.turnIndicator);
      this.turnIndicator = null;
    }
  }

  /** 渲染 4 家手牌：自己正面，其他背面 */
  /** 渲染 4 家手牌：自己永远在下方 */
  /** 渲染 4 家手牌：自己永远在下方，庄家带红色“庄”字 */
  renderAllHands(
    hands: Record<string, string[]>, // 4 家手牌
    myIndex: number, // 自己坐在后端顺序的第几位
    bankerIndex: number // 庄家在第几位
  ) {
    this.handContainer.removeChildren();

    // 4 个方位相对于「我」的旋转偏移
    const layout = [
      { seat: "bottom", rot: 0 },
      { seat: "right", rot: Math.PI / 2 },
      { seat: "top", rot: Math.PI },
      { seat: "left", rot: -Math.PI / 2 },
    ];
    // 初始化 4 家手牌精灵池
    Object.keys(hands).forEach((uid) => {
      this.handPools[uid] = [];
    });

    for (let i = 0; i < 4; i++) {
      const relIdx = (i - myIndex + 4) % 4; // 视角旋转
      const { seat, rot } = layout[relIdx];
      const uid = Object.keys(hands)[i];
      const cards = hands[uid];
      const isMe = i === myIndex;
      const isBanker = i === bankerIndex;
      const sorted = sortTiles(cards); // ★ 先排序
      /* 1. 画手牌 */
      sorted.forEach((val, k) => {
        const sp = isMe ? new Card(val) : new CardBack();
        if (isMe) {
          sp.on("pointerdown", () => this.onCardClick(sp as Card));
        }
        sp.anchor.set(0.5);
        this.layoutCard(sp, seat, k, cards.length);
        this.handContainer.addChild(sp);

        this.handPools[uid].push(sp);
      });
      console.log("mark", isBanker, myIndex, seat, this.handPools);
      /* 2. 庄家标记（红色“庄”字）- PixiJS v8 新语法 */
      if (isBanker) {
        const mark = new PIXI.Text({
          text: "庄",
          style: { fontSize: 24, fill: 0xff0000 },
        });
        mark.anchor.set(0.5);

        // 放在手牌区外侧
        if (seat === "bottom") {
          mark.x = window.innerWidth - CARD_WIDTH * 9;
          mark.y = window.innerHeight - CARD_HEIGHT - 120;
        } else if (seat === "top") {
          mark.x = window.innerWidth - CARD_WIDTH * 9;
          mark.y = CARD_HEIGHT * 2;
        } else if (seat === "right") {
          mark.x = window.innerWidth - CARD_WIDTH * 2;
          mark.y = window.innerHeight - CARD_HEIGHT * 6;
        } else if (seat === "left") {
          mark.x = CARD_WIDTH * 2;
          mark.y = window.innerHeight - CARD_HEIGHT * 6;
        }
        this.handContainer.addChild(mark);
        this.addChild(this.handContainer);
      }
    }

    // 显示当前出牌玩家的标志
    this.showTurnIndicator(gameStore.turn);
  }

  /** 把后端发来的手牌渲染出来 */
  renderHand(userId: string, newTiles: string[]) {
    const sorted = sortTiles(newTiles);
    const pool = this.handPools[userId];
    if (!pool) return; // 安全

    const isMe = userId === gameStore.myId;
    // 根据 userId 计算旋转后的座位方位（与 renderAllHands 一致）
    const uids = Object.keys(gameStore.hands);
    const idx = uids.indexOf(userId);
    if (idx === -1) return;
    const relIdx = (idx - gameStore.myIndex + 4) % 4;
    const seat = ["bottom", "right", "top", "left"][relIdx];

    /* 1. 数量对齐：多删少补 */
    while (pool.length > sorted.length) {
      const sp = pool.pop()!;
      this.handContainer.removeChild(sp);
      sp.destroy({ texture: false });
    }
    while (pool.length < sorted.length) {
      const sp = isMe ? new Card("") : new CardBack();
      sp.anchor.set(0.5);
      if (isMe) sp.on("pointerdown", () => this.onCardClick(sp as Card));
      this.handContainer.addChild(sp);
      pool.push(sp);
    }

    /* 2. 更新纹理 & 位置（复用 layoutCard 保证与 renderAllHands 布局一致） */
    sorted.forEach((val, k) => {
      const sp = pool[k];
      if (isMe) {
        (sp as Card).texture = PIXI.Texture.from(val); // 换图
        (sp as Card).value = val;
      }
      this.layoutCard(sp, seat, k, sorted.length);
    });
  }

  /** 统一摆牌：横向或竖向居中（支持 Card 与 CardBack） */
  private layoutCard(
    sp: PIXI.Sprite & { baseY?: number },
    seat: string,
    idx: number,
    total: number
  ) {
    const W = window.innerWidth,
      H = window.innerHeight;
    const cw = CARD_WIDTH,
      ch = CARD_HEIGHT;
    const gap = cw * 0.8;

    sp.width = cw;
    sp.height = ch;

    switch (seat) {
      case "bottom": // 横向
        sp.x = (W - total * gap) / 2 + idx * gap;
        sp.y = H - ch - 50;

        break;
      case "top": // 横向 倒牌
        sp.x = (W - total * gap) / 2 + (total - 1 - idx) * gap;
        sp.y = ch;
        sp.rotation = Math.PI;
        break;
      case "right": // 竖向
        sp.rotation = Math.PI / 2;
        sp.x = W - cw;
        sp.y = (H - total * gap) / 2 + idx * gap;
        break;
      case "left": // 竖向
        sp.rotation = -Math.PI / 2;
        sp.x = cw;
        sp.y = (H - total * gap) / 2 + (total - 1 - idx) * gap;
        break;
    }
    sp.baseY = sp.y;
  }

  private onCardClick(card: Card) {
    console.log("onCardClick", gameStore.turn, gameStore.myId);
    if (gameStore.turn !== gameStore.myId) return; // 不是轮到自己
    const { playCard } = useSocket(); // 直接解构出来
    // 计算牌河落点（示例：自家牌河第 n 张）
    const riverIdx = gameStore.river?.[gameStore.myId]?.length || 0;
    const { x: tx, y: ty } = this.getRiverSlot("bottom", riverIdx);
    console.log("onCardClick", tx, ty);
    card.riverX = tx;
    card.riverY = ty;
    // 先让牌飞
    card.onFlyComplete(() => {
      // 飞行结束 → 从手牌容器移除
      this.handContainer.removeChild(card);
      // 从精灵池和 store 中移除，并重新绘制手牌以消除缺口
      const pool = this.handPools[gameStore.myId];
      if (pool) {
        const idx = pool.indexOf(card);
        if (idx >= 0) pool.splice(idx, 1);
      }
      const handIdx = gameStore.hands[gameStore.myId]?.indexOf(card.value);
      if (handIdx >= 0) {
        gameStore.hands[gameStore.myId].splice(handIdx, 1);
      }
      this.renderHand(gameStore.myId, gameStore.hands[gameStore.myId] || []);
      // 通知后端
      playCard(card.value);
    });
  }

  /** 获取牌河第 idx 张的落位坐标
   *  @param seat    视角旋转后的方位 bottom|top|left|right
   *  @param idx     这张牌在牌河里的序号（0 开始）
   *  @param cardSize CARD_WIDTH 或 CARD_HEIGHT（看横竖）
   *  @param gap     想离本侧手牌多远（像素）
   */

  private getRiverSlot(seat: string, idx: number) {
    const cardsPerRow = 10; // 每行最多10张牌
    const row = Math.floor(idx / cardsPerRow);
    const col = idx % cardsPerRow; // 在当前行中的列位置
    console.log("getRiverSlot", seat, idx, row, col);
    switch (seat) {
      case "bottom": {
        return {
          x: col * CARD_WIDTH * CARD_RIVER_SCALE, // 从行头开始，根据列位置计算x
          y: -(CARD_HEIGHT * CARD_RIVER_SCALE * (3 - row)), // 每行向上偏移
        };
      }
      case "top": {
        return {
          x: col * CARD_WIDTH * CARD_RIVER_SCALE, // 从行头开始，根据列位置计算x
          y: CARD_HEIGHT * CARD_RIVER_SCALE * (3 - row), // 每行向下偏移
        };
      }
      case "right": {
        return {
          x: -(CARD_WIDTH * CARD_RIVER_SCALE * (3 - row)), // 每行向左偏移
          y: col * CARD_WIDTH * CARD_RIVER_SCALE, // 从行头开始，根据列位置计算y
        };
      }
      case "left": {
        return {
          x: CARD_WIDTH * (3 - row) * CARD_RIVER_SCALE, // 每行向右偏移
          y: col * CARD_WIDTH * CARD_RIVER_SCALE, // 从行头开始，根据列位置计算y
        };
      }
      default:
        return { x: 0, y: 0 };
    }
  }

  addToRiver(userId: string, cardValue: string) {
    const uids = Object.keys(gameStore.hands);
    const idx = uids.indexOf(userId);
    const relIdx = (idx - gameStore.myIndex + 4) % 4;
    const seat = ["bottom", "right", "top", "left"][relIdx];
    const container = this.riverContainers[seat];
    const slotIdx = container.children.length;

    const sp = new Card(cardValue);
    sp.anchor.set(0.5);
    sp.width = CARD_WIDTH * CARD_RIVER_SCALE;
    sp.height = CARD_HEIGHT * CARD_RIVER_SCALE;

    const { x, y } = this.getRiverSlot(seat, slotIdx);
    sp.x = x;
    sp.y = y;
    // 根据座位方向设置牌的朝向，使其正对手牌
    switch (seat) {
      case "bottom":
        sp.rotation = 0; // 底部玩家：牌正面朝上
        break;
      case "top":
        sp.rotation = Math.PI; // 顶部玩家：牌正面朝下（旋转180度）
        break;
      case "right":
        sp.rotation = -Math.PI / 2; // 右侧玩家：牌正面朝左（逆时针旋转90度）
        break;
      case "left":
        sp.rotation = Math.PI / 2; // 左侧玩家：牌正面朝右（顺时针旋转90度）
        break;
      default:
        sp.rotation = 0;
    }

    console.log("addToRiver", x, y);
    container.addChild(sp);

    // 显示当前出牌玩家的标志
    this.showTurnIndicator(gameStore.turn);
  }

  /** 刷新某家手牌数量（仅背面展示） */
  public refreshOtherHandCount(userId: string, newCount: number) {
    const uids = Object.keys(gameStore.hands);
    const idx = uids.indexOf(userId);
    const relIdx = (idx - gameStore.myIndex + 4) % 4;
    const seat = ["bottom", "right", "top", "left"][relIdx];
    const cnt = this.otherHandContainers[seat];
    if (!cnt) return;

    /* 1. 删掉多余精灵 */
    while (cnt.children.length > newCount)
      cnt.removeChildAt(cnt.children.length - 1);

    /* 2. 补齐新增精灵 */
    while (cnt.children.length < newCount) {
      const back = new CardBack();
      back.scale.set(0.6);
      back.anchor.set(0.5);
      const k = cnt.children.length;
      this.layoutCard(back, seat, k, newCount); // 复用原坐标函数
      cnt.addChild(back);
    }
  }
}
