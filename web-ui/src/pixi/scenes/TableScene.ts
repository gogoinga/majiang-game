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

const PUBLIC_TILE_SCALE = 0.44;
const HAND_TILE_SCALE = 0.84;
const MOBILE_LANDSCAPE_MAX_EDGE = 430;
const MOBILE_LANDSCAPE_MAX_WIDTH = 960;
const MOBILE_LANDSCAPE_MAX_HEIGHT = 430;
const MOBILE_LANDSCAPE_PUBLIC_SCALE = 0.28;
const MOBILE_LANDSCAPE_HAND_SCALE = 0.54;
const MOBILE_LANDSCAPE_RIVER_SCALE = 0.4;

export class TableScene extends PIXI.Container {
  private screen: PIXI.Rectangle;

  // 各玩家牌河容器（东南西北顺序）
  private riverContainers: Record<string, PIXI.Container> = {};

  private handContainer = new PIXI.Container();

  // 当前出牌玩家的标记
  private turnIndicator: PIXI.Graphics | null = null;

  private otherHandContainers: Record<string, PIXI.Container> = {};

  /* 存 4 家手牌精灵池，key 用 userId */
  private handPools: Record<string, (Card | CardBack)[]> = {};

  // 碰到、杠到的牌池：userId -> Sprite[]
  private publicPools: Record<string, PIXI.Sprite[]> = {};

  constructor(screen: PIXI.Rectangle) {
    super();
    this.screen = screen;
    this.initRiverContainers();
  }

  private destroyDisplayObjects(displayObjects: Array<{ destroy: (...args: any[]) => void }>) {
    displayObjects.forEach((displayObject) => {
      displayObject.destroy({ children: true, texture: false });
    });
  }

  private resetHandContainer() {
    this.destroyDisplayObjects(this.handContainer.removeChildren());
    this.handPools = {};
  }

  private clearTurnIndicator() {
    if (!this.turnIndicator) return;

    const indicator = this.turnIndicator;
    this.turnIndicator = null;

    if (indicator.parent === this) {
      this.removeChild(indicator);
    }

    indicator.destroy({ children: true });
  }

  private getSceneDimensions() {
    const width = this.screen.width || this.width || window.innerWidth;
    const height = this.screen.height || this.height || window.innerHeight;

    return { width, height };
  }

  private getViewportMetrics() {
    const { width, height } = this.getSceneDimensions();
    const isMobileLandscape =
      width > height &&
      width <= MOBILE_LANDSCAPE_MAX_WIDTH &&
      height <= MOBILE_LANDSCAPE_MAX_HEIGHT &&
      Math.min(width, height) <= MOBILE_LANDSCAPE_MAX_EDGE;

    return {
      width,
      height,
      isMobileLandscape,
      publicScale: isMobileLandscape
        ? MOBILE_LANDSCAPE_PUBLIC_SCALE
        : PUBLIC_TILE_SCALE,
      handScale: isMobileLandscape ? MOBILE_LANDSCAPE_HAND_SCALE : HAND_TILE_SCALE,
      riverScale: isMobileLandscape
        ? MOBILE_LANDSCAPE_RIVER_SCALE
        : CARD_RIVER_SCALE,
    };
  }

  private getHandLayout(total: number = 13) {
    const { width, height, isMobileLandscape, handScale, riverScale, publicScale } =
      this.getViewportMetrics();
    const handWidth = CARD_WIDTH * handScale;
    const handHeight = CARD_HEIGHT * handScale;
    const handGap = handWidth * (isMobileLandscape ? 0.54 : 0.76);
    const bottomHandScale = handScale * (isMobileLandscape ? 0.85 : 0.95);
    const bottomHandWidth = CARD_WIDTH * bottomHandScale;
    const bottomHandHeight = CARD_HEIGHT * bottomHandScale;
    const bottomHandGap = bottomHandWidth * (isMobileLandscape ? 0.96 : 0.92);
    const riverTileWidth = CARD_WIDTH * riverScale;
    const riverTileHeight = CARD_HEIGHT * riverScale;
    const publicTileWidth = CARD_WIDTH * publicScale;
    const publicTileHeight = CARD_HEIGHT * publicScale;
    const leftHandX =
      handWidth * (isMobileLandscape ? 1.96 : 1.22) + (isMobileLandscape ? 18 : 12);
    const rightHandX =
      width - handWidth * (isMobileLandscape ? 1.96 : 1.22) - (isMobileLandscape ? 18 : 12);
    const topHandY =
      handHeight * (isMobileLandscape ? 1.12 : 1.1) + (isMobileLandscape ? 14 : 14);
    const bottomHandY =
      height -
      bottomHandHeight * (isMobileLandscape ? 1.12 : 1.1) -
      (isMobileLandscape ? 18 : 40);
    const horizontalStartX = (width - total * handGap) / 2;
    const horizontalEndX = horizontalStartX + (total - 1) * handGap;
    const bottomHorizontalStartX = (width - total * bottomHandGap) / 2;
    const bottomHorizontalEndX = bottomHorizontalStartX + (total - 1) * bottomHandGap;
    const verticalStartY = (height - total * handGap) / 2;
    const verticalEndY = verticalStartY + (total - 1) * handGap;

    return {
      width,
      height,
      isMobileLandscape,
      handWidth,
      handHeight,
      handGap,
      bottomHandWidth,
      bottomHandHeight,
      bottomHandGap,
      riverTileWidth,
      riverTileHeight,
      publicTileWidth,
      publicTileHeight,
      leftHandX,
      rightHandX,
      topHandY,
      bottomHandY,
      horizontalStartX,
      horizontalEndX,
      bottomHorizontalStartX,
      bottomHorizontalEndX,
      verticalStartY,
      verticalEndY,
    };
  }

  resizeLayout() {
    this.initRiverContainers();
    if (!Object.keys(gameStore.hands).length) return;

    this.renderRiver(gameStore.river);
    this.renderAllHands(gameStore.hands, gameStore.myIndex, gameStore.bankerIndex);
    this.renderPublicTiles(
      gameStore.pengs,
      gameStore.gangs,
      gameStore.myIndex,
      gameStore.bankerIndex
    );

    if (gameStore.turn) {
      this.showTurnIndicator(gameStore.turn);
    } else {
      this.hideTurnIndicator();
    }
  }

  renderPublicTiles(
    pengs: Record<string, string[][]>,
    gangs: Record<string, {type: string, card: string}[]>,
    myIndex: number,
    bankerIndex: number
  ) {
    const { publicScale } = this.getViewportMetrics();
    // 销毁旧精灵
    Object.values(this.publicPools).forEach(pool => {
      pool.forEach(sp => {
        if (sp.parent) sp.parent.removeChild(sp);
        sp.destroy({ texture: false });
      });
    });
    this.publicPools = {};
    const uids = Object.keys(gameStore.hands);
    if (!uids.length) return;

    for (let i = 0; i < 4; i++) {
      const uid = uids[i];
      if (!uid) continue;
      this.publicPools[uid] = [];
      const userPengs = pengs && pengs[uid] ? pengs[uid] : [];
      const userGangs = gangs && gangs[uid] ? gangs[uid] : [];
      const handCount = Math.max(gameStore.hands[uid]?.length || 13, 1);
      
      const relIdx = (i - myIndex + 4) % 4; // 视角旋转
      const seat = ["bottom", "right", "top", "left"][relIdx];

      let tileCount = 0;

      // 渲染碰牌 (3张)
      userPengs.forEach((cardGroup) => {
        // cardGroup is an array like ["4s", "4s", "4s"]
        const cardStr = Array.isArray(cardGroup) ? cardGroup[0] : cardGroup;
        for(let j=0; j<3; j++) {
            const sp = new Card(cardStr);
            sp.anchor.set(0.5);
            sp.eventMode = "none";
            sp.width = CARD_WIDTH * publicScale;
            sp.height = CARD_HEIGHT * publicScale;
            this.layoutPublicTile(sp, seat, tileCount, handCount, j === 1);
            this.addChild(sp);
            this.publicPools[uid].push(sp);
            tileCount++;
        }
      });
      
      // 渲染杠牌 (4张)
      userGangs.forEach((gangOpt) => {
        const cardVal = gangOpt.card;
        const isAn = gangOpt.type === 'an' || gangOpt.type === 'an_gang';
        for(let j=0; j<4; j++) {
            // 暗杠的独立规则：前 3 张（底下的牌）固定背面，第 4 张（叠在中间的牌）翻出来朝上。
            const sp = isAn && j < 3 ? new CardBack() : new Card(cardVal);
            sp.anchor.set(0.5);
            sp.eventMode = "none";
            sp.width = CARD_WIDTH * publicScale;
            sp.height = CARD_HEIGHT * publicScale;
            // 第4张叠在中间张（j=1的头上）
            this.layoutPublicTile(
              sp,
              seat,
              j === 3 ? tileCount - 2 : tileCount,
              handCount,
              false,
              j === 3,
            );
            this.addChild(sp);
            this.publicPools[uid].push(sp);
            if (j < 3) {
              tileCount++;
            }
        }
      });
    }
  }

  private layoutPublicTile(
    sp: PIXI.Sprite,
    seat: string,
    tileCount: number,
    handCount: number,
    isMiddle: boolean,
    isStacked: boolean = false
  ) {
     const {
       isMobileLandscape,
       publicTileWidth: tileWidth,
       publicTileHeight: tileHeight,
       handWidth,
       handHeight,
       bottomHandWidth,
       bottomHandHeight,
       leftHandX,
       rightHandX,
       topHandY,
       bottomHandY,
       horizontalStartX,
       bottomHorizontalEndX,
       verticalEndY,
     } = this.getHandLayout(handCount);
     const tileGap = isMobileLandscape ? 1 : 2;
     const tileSpan = tileWidth + tileGap;
     const groupIndex = Math.floor(tileCount / 3);
     const tileIndex = tileCount % 3;
     const groupColumn = Math.floor(groupIndex / 2);
     const groupRow = groupIndex % 2;
     const horizontalGroupWidth = tileWidth * 3 + tileGap * 2;
     const verticalGroupHeight = tileWidth * 3 + tileGap * 2;
     const horizontalGroupStep = horizontalGroupWidth + (isMobileLandscape ? 4 : 8);
     const horizontalRowStep = tileHeight + (isMobileLandscape ? 5 : 8);
     const sideGroupStep = tileHeight + (isMobileLandscape ? 4 : 8);
     const sideRowStep = verticalGroupHeight + (isMobileLandscape ? 5 : 8);

     let baseX = 0;
     let baseY = 0;
     let stackX = 0;
     let stackY = 0;

     if (seat === "bottom") {
         const anchorX = bottomHorizontalEndX + bottomHandWidth * 1.1;
         const anchorY = bottomHandY + bottomHandHeight * 0.12;
         baseX = anchorX + groupColumn * horizontalGroupStep + tileWidth / 2 + tileIndex * tileSpan;
         baseY = anchorY + groupRow * horizontalRowStep;
         stackY = isStacked ? (isMobileLandscape ? -6 : -10) : 0;
         sp.rotation = 0;
     } else if (seat === "right") {
         const anchorX = rightHandX + handHeight * 1.12;
         const anchorY = verticalEndY - verticalGroupHeight + tileWidth / 2;
         baseX = anchorX + groupColumn * sideGroupStep;
         baseY = anchorY + groupRow * sideRowStep + tileIndex * tileSpan;
         stackX = isStacked ? (isMobileLandscape ? 6 : 10) : 0;
         sp.rotation = isStacked ? 0 : -Math.PI / 2;
     } else if (seat === "top") {
         const anchorX = horizontalStartX - handWidth * 0.95 - horizontalGroupWidth;
         const anchorY = topHandY + handHeight * 0.08;
         baseX = anchorX - groupColumn * horizontalGroupStep + tileWidth / 2 + tileIndex * tileSpan;
         baseY = anchorY + groupRow * horizontalRowStep;
         stackY = isStacked ? (isMobileLandscape ? 6 : 10) : 0;
         sp.rotation = Math.PI;
     } else if (seat === "left") {
         const anchorX = leftHandX - handHeight * 1.12;
         const anchorY = verticalEndY - verticalGroupHeight + tileWidth / 2;
         baseX = anchorX - groupColumn * sideGroupStep;
         baseY = anchorY + groupRow * sideRowStep + tileIndex * tileSpan;
         stackX = isStacked ? (isMobileLandscape ? -6 : -10) : 0;
         sp.rotation = isStacked ? Math.PI : Math.PI / 2;
     }

     sp.x = baseX + stackX;
     sp.y = baseY + stackY;
  }

  /** 初始化 4 个牌河容器（示例坐标） */
  private initRiverContainers() {
    const {
      width: W,
      height: H,
      handHeight,
      bottomHandHeight,
      leftHandX,
      rightHandX,
      topHandY,
      bottomHandY,
      riverTileWidth,
      riverTileHeight,
    } = this.getHandLayout();
    const horizontalCards = this.getRiverCardsPerLine("bottom");
    const verticalCards = this.getRiverCardsPerLine("left");

    // 4 个方位的牌河容器
    if (!Object.keys(this.riverContainers).length) {
      this.riverContainers = {
        bottom: new PIXI.Container(),
        right: new PIXI.Container(),
        top: new PIXI.Container(),
        left: new PIXI.Container(),
      };

      Object.values(this.riverContainers).forEach((c) => this.addChild(c));
    }

    // 设置初始位置
    this.riverContainers.bottom.x = W / 2 - ((horizontalCards - 1) * riverTileWidth) / 2;
    this.riverContainers.bottom.y = bottomHandY - bottomHandHeight * 1.48;
    this.riverContainers.top.x = W / 2 - ((horizontalCards - 1) * riverTileWidth) / 2;
    this.riverContainers.top.y = topHandY + handHeight * 1.48;
    this.riverContainers.left.x = leftHandX + handHeight * 1.72;
    this.riverContainers.left.y = H / 2 - ((verticalCards - 1) * riverTileWidth) / 2;
    this.riverContainers.right.x = rightHandX - handHeight * 1.72;
    this.riverContainers.right.y = H / 2 - ((verticalCards - 1) * riverTileWidth) / 2;
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
    card.eventMode = "none";
    const { riverScale } = this.getViewportMetrics();
    card.scale.set(riverScale); // 牌河里的牌稍小
    card.x = (container.children.length % 10) * 30; // 每行 10 张
    card.y = Math.floor(container.children.length / 10) * 40;
    container.addChild(card);
  }

  resetRiver() {
    Object.values(this.riverContainers).forEach((container) => {
      container.removeChildren().forEach((child) => {
        child.destroy({ texture: false });
      });
    });
  }

  renderRiver(river: Record<string, string[]>) {
    this.resetRiver();
    const uids = Object.keys(gameStore.hands);

    uids.forEach((uid, idx) => {
      const relIdx = (idx - gameStore.myIndex + 4) % 4;
      const seat = ["bottom", "right", "top", "left"][relIdx];
      const container = this.riverContainers[seat];
      const cards = river?.[uid] || [];

      cards.forEach((cardValue, slotIdx) => {
        const sp = new Card(cardValue);
        sp.anchor.set(0.5);
        sp.eventMode = "none";
        const { riverScale } = this.getViewportMetrics();
        sp.width = CARD_WIDTH * riverScale;
        sp.height = CARD_HEIGHT * riverScale;

        const { x, y } = this.getRiverSlot(seat, slotIdx);
        sp.x = x;
        sp.y = y;

        switch (seat) {
          case "bottom":
            sp.rotation = 0;
            break;
          case "top":
            sp.rotation = Math.PI;
            break;
          case "right":
            sp.rotation = -Math.PI / 2;
            break;
          case "left":
            sp.rotation = Math.PI / 2;
            break;
          default:
            sp.rotation = 0;
        }

        container.addChild(sp);
      });
    });
  }

  private getRiverCardsPerLine(seat: string) {
    const {
      width,
      height,
      riverTileWidth,
      handHeight,
      leftHandX,
      rightHandX,
      horizontalStartX,
      horizontalEndX,
    } = this.getHandLayout();
    const tileSpan = riverTileWidth;

    if (seat === "bottom" || seat === "top") {
      const availableWidth = Math.max(width * 0.22, horizontalEndX - horizontalStartX + handHeight * 1.1);
      return Math.max(4, Math.min(10, Math.floor(availableWidth / tileSpan)));
    }

    const availableHeight = Math.max(height * 0.28, height - handHeight * 3);
    const sideAvailableWidth = Math.max((rightHandX - leftHandX) * 0.24, handHeight * 2.8);
    return Math.max(
      4,
      Math.min(8, Math.floor(Math.min(availableHeight, sideAvailableWidth * 2.2) / tileSpan))
    );
  }

  /**
   * 显示当前轮到谁出牌的标志
   * @param userId 当前出牌玩家的ID
   */
  showTurnIndicator(userId: string) {
    // 移除现有的标记
    this.clearTurnIndicator();

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
    this.turnIndicator.drawCircle(0, 0, 16);
    this.turnIndicator.endFill();

    // 添加文本
    const text = new PIXI.Text({
      text: "出牌",
      style: {
        fontSize: 13,
        fill: 0xffffff,
        fontWeight: "bold",
      },
    });
    text.anchor.set(0.5);
    this.turnIndicator.addChild(text);

    // 根据座位位置设置标记的位置
    const {
      width,
      height,
      handWidth,
      handHeight,
      bottomHandHeight,
      leftHandX,
      rightHandX,
      topHandY,
      bottomHandY,
    } = this.getHandLayout();
    switch (seat) {
      case "bottom":
        this.turnIndicator.x = width / 2;
        this.turnIndicator.y = bottomHandY - bottomHandHeight * 1.08;
        break;
      case "right":
        this.turnIndicator.x = rightHandX - handWidth * 0.82;
        this.turnIndicator.y = height / 2;
        break;
      case "top":
        this.turnIndicator.x = width / 2;
        this.turnIndicator.y = topHandY + handHeight * 1.08;
        break;
      case "left":
        this.turnIndicator.x = leftHandX + handWidth * 0.82;
        this.turnIndicator.y = height / 2;
        break;
    }

    this.addChild(this.turnIndicator);
  }

  /**
   * 隐藏出牌标记
   */
  hideTurnIndicator() {
    this.clearTurnIndicator();
  }

  /** 渲染 4 家手牌：自己正面，其他背面 */
  /** 渲染 4 家手牌：自己永远在下方 */
  /** 渲染 4 家手牌：自己永远在下方，庄家带红色“庄”字 */
  renderAllHands(
    hands: Record<string, string[]>, // 4 家手牌
    myIndex: number, // 自己坐在后端顺序的第几位
    bankerIndex: number // 庄家在第几位
  ) {
    this.resetHandContainer();

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
          sp.eventMode = "static";
          sp.on("pointertap", () => this.onCardClick(sp as Card));
        }
        sp.anchor.set(0.5);
        this.layoutCard(sp, seat, k, cards.length);
        this.handContainer.addChild(sp);

        this.handPools[uid].push(sp);
      });
      console.log("mark", isBanker, myIndex, seat, this.handPools);
      /* 2. 庄家标记（红色“庄”字）- PixiJS v8 新语法 */
      if (isBanker) {
        const {
          isMobileLandscape,
          handWidth,
          handHeight,
          bottomHandWidth,
          bottomHandHeight,
          leftHandX,
          rightHandX,
          topHandY,
          bottomHandY,
          horizontalStartX,
          bottomHorizontalStartX,
          verticalStartY,
        } = this.getHandLayout(cards.length || 13);
        const mark = new PIXI.Text({
          text: "庄",
          style: { fontSize: isMobileLandscape ? 15 : 24, fill: 0xff0000 },
        });
        mark.anchor.set(0.5);

        // 放在手牌区外侧
        if (seat === "bottom") {
          mark.x = Math.max(bottomHorizontalStartX - bottomHandWidth * 0.62, 12);
          mark.y = bottomHandY - bottomHandHeight * 0.1;
        } else if (seat === "top") {
          mark.x = horizontalStartX + handWidth * 0.24;
          mark.y = topHandY + handHeight * 0.14;
        } else if (seat === "right") {
          mark.x = rightHandX - handWidth * 0.62;
          mark.y = verticalStartY + handWidth * 0.18;
        } else if (seat === "left") {
          mark.x = leftHandX - handWidth * 0.62;
          mark.y = verticalStartY + handWidth * 0.18;
        }
        this.handContainer.addChild(mark);
      }
    }

    if (!this.handContainer.parent) {
      this.addChild(this.handContainer);
    }

    // 显示当前出牌玩家的标志
    if (gameStore.turn) {
      this.showTurnIndicator(gameStore.turn);
    } else {
      this.hideTurnIndicator();
    }
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
      if (isMe) {
        sp.eventMode = "static";
        sp.on("pointertap", () => this.onCardClick(sp as Card));
      }
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
    const {
      width: W,
      height: H,
      handWidth: cw,
      handHeight: ch,
      handGap: gap,
      bottomHandWidth,
      bottomHandHeight,
      bottomHandGap,
      leftHandX,
      rightHandX,
      topHandY,
      bottomHandY,
    } = this.getHandLayout(total);

    switch (seat) {
      case "bottom": // 横向
        sp.width = bottomHandWidth;
        sp.height = bottomHandHeight;
        sp.x = (W - total * bottomHandGap) / 2 + idx * bottomHandGap;
        sp.y = bottomHandY;

        break;
      case "top": // 横向 倒牌
        sp.width = cw;
        sp.height = ch;
        sp.x = (W - total * gap) / 2 + (total - 1 - idx) * gap;
        sp.y = topHandY;
        sp.rotation = Math.PI;
        break;
      case "right": // 竖向
        sp.width = cw;
        sp.height = ch;
        sp.rotation = Math.PI / 2;
        sp.x = rightHandX;
        sp.y = (H - total * gap) / 2 + idx * gap;
        break;
      case "left": // 竖向
        sp.width = cw;
        sp.height = ch;
        sp.rotation = -Math.PI / 2;
        sp.x = leftHandX;
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
    if (!card.isSelected()) {
      card.select();
      return;
    }

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
    card.flyToRiver();
  }

  /** 获取牌河第 idx 张的落位坐标
   *  @param seat    视角旋转后的方位 bottom|top|left|right
   *  @param idx     这张牌在牌河里的序号（0 开始）
   *  @param cardSize CARD_WIDTH 或 CARD_HEIGHT（看横竖）
   *  @param gap     想离本侧手牌多远（像素）
   */

  private getRiverSlot(seat: string, idx: number) {
    const { riverScale } = this.getViewportMetrics();
    const cardsPerRow = this.getRiverCardsPerLine(seat);
    const row = Math.floor(idx / cardsPerRow);
    const col = idx % cardsPerRow; // 在当前行中的列位置
    console.log("getRiverSlot", seat, idx, row, col);
    switch (seat) {
      case "bottom": {
        return {
          x: col * CARD_WIDTH * riverScale, // 从行头开始，根据列位置计算x
          y: -(CARD_HEIGHT * riverScale * row), // 以底部容器为基准逐行向上
        };
      }
      case "top": {
        return {
          x: col * CARD_WIDTH * riverScale, // 从行头开始，根据列位置计算x
          y: CARD_HEIGHT * riverScale * row, // 以顶部容器为基准逐行向下
        };
      }
      case "right": {
        return {
          x: -(CARD_WIDTH * riverScale * row), // 以右侧容器为基准逐列向左
          y: col * CARD_WIDTH * riverScale, // 从行头开始，根据列位置计算y
        };
      }
      case "left": {
        return {
          x: CARD_WIDTH * row * riverScale, // 以左侧容器为基准逐列向右
          y: col * CARD_WIDTH * riverScale, // 从行头开始，根据列位置计算y
        };
      }
      default:
        return { x: 0, y: 0 };
    }
  }

  addToRiver(userId: string, cardValue: string) {
    const nextRiver = {
      ...gameStore.river,
      [userId]: [...(gameStore.river[userId] || []), cardValue],
    };
    this.renderRiver(nextRiver);
    // 显示当前出牌玩家的标志
    if (gameStore.turn) {
      this.showTurnIndicator(gameStore.turn);
    }
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
