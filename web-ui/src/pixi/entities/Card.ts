import * as PIXI from "pixi.js";
import gsap from "gsap";

// import { getTexture } from "@/hooks/useLoadCard";

export const CARD_WIDTH = 60;
export const CARD_HEIGHT = 80;
export const CARD_RIVER_SCALE = 0.66;

export class Card extends PIXI.Sprite {
  public value: string; // '1w', '5s' ...
  buttonMode: boolean;
  riverX: number;
  riverY: number;
  public baseY: number;
  private selected = false;

  onFlyCompleteQueue: (() => void)[] = [];
  /** 全局记录：当前被弹起的牌（最多 1 张） */
  private static curSelected: Card | null = null;
  constructor(value: string) {
    // 初始化时调用一次 loadAllTiles()
    // const texture = getTexture(value);
    super(PIXI.Texture.from(value));
    // super(PIXI.Texture.from(getTexture(value))); // 先都用 1 万占位
    this.value = value;
    this.anchor.set(0.5);
    this.interactive = true;
    this.buttonMode = true;
    this.baseY = this.y;
    this.riverX = -1;
    this.riverY = this.y;
    this.width = CARD_WIDTH;
    this.height = CARD_HEIGHT;
    this.on("click", () => this.select());
    // this.on("click", () => this.deselect());
    console.log("Card", value, this.x, this.y, this.parent);
    // this.on("pointerdown", () => this.emit("clicked", this));
  }

  select() {
    console.log("select", this.selected);
    // 1. 自己就是当前弹起牌 → 直接复位
    if (Card.curSelected && Card.curSelected !== this) {
      Card.curSelected.deselect();
    } else {
      if (this.selected) {
        if (this.riverX === -1) {
          this.deselect();
        } else {
          this.flyToRiver();
        }
        return;
      }
    }

    this.selected = true;

    Card.curSelected = this;
    gsap.to(this, {
      y: this.y - CARD_HEIGHT / 2,

      duration: 0.15,
    });
  }

  deselect() {
    if (!this.selected) return;
    console.log("deselect", this.y);
    this.selected = false;

    gsap.to(this, {
      y: this.baseY,

      duration: 0.15,
    });
  }

  /** 起飞到牌河 */
  flyToRiver() {
    console.log("flyToRiver", this.riverX, this.riverY);

    gsap.to(this, {
      x: this.riverX,
      y: this.riverY,
      rotation: Math.random() * 0.2 - 0.1,
      duration: 0.35,
      ease: "power2.out",
      onComplete: () => {
        this.onFlyCompleteQueue.forEach((cb) => cb());
        this.onFlyCompleteQueue.length = 0;
        this.riverX = -1;
        this.selected = false;
      },
    });
  }
  /** 牌飞完后，调用队列中的回调 */
  onFlyComplete(callback: () => void) {
    this.onFlyCompleteQueue.push(callback);
  }
}
