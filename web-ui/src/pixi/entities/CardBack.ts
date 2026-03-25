import * as PIXI from "pixi.js";

export class CardBack extends PIXI.Sprite {
  constructor() {
    super(PIXI.Texture.from("back"));
    this.anchor.set(0.5);
  }
}
