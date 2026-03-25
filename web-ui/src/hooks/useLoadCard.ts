import * as PIXI from "pixi.js";

// 27 个 key
const suits = ["t", "s"];
const honors = ["东", "南", "西", "北", "中", "发", "白"];
const others = ["back"];
const keys: string[] = [];

suits.forEach((s) => {
  for (let n = 1; n <= 9; n++) keys.push(`${n}${s}`);
});
honors.forEach((h) => keys.push(h));
others.forEach((o) => keys.push(o));

/** 一次性把 27 张牌图加载到 Pixi 缓存 */
export async function loadAllTiles() {
  // 构造 [{ alias:'3t', src:'/tiles/3t.png' }, ...]
  const assets = keys.map((v) => ({
    alias: v,
    src: `/tiles/${v}.png`, // 直接指向 public/tiles/*.png
  }));

  await PIXI.Assets.load(assets);
}

/** 获取已加载的牌纹理 */
export function getTexture(value: string): PIXI.Texture {
  return PIXI.Assets.get(value) || PIXI.Texture.WHITE;
}
