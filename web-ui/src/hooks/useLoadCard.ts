import * as PIXI from "pixi.js";
import {
  getPublicTileAtlasImageUrl,
  getPublicTileAtlasMetaUrl,
  resolveTileAssetName,
} from "@/utils";

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

type TileAtlasMeta = {
  meta: {
    image: string;
    width: number;
    height: number;
    maxCellWidth: number;
    maxCellHeight: number;
    padding: number;
    columns: number;
    rows: number;
  };
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
};

/** 一次性把 27 张牌图加载到 Pixi 缓存 */
export async function loadAllTiles() {
  const [atlasTexture, atlasMeta] = await Promise.all([
    PIXI.Assets.load(getPublicTileAtlasImageUrl()),
    fetch(getPublicTileAtlasMetaUrl()).then((res) => res.json() as Promise<TileAtlasMeta>),
  ]);

  const source = atlasTexture.source;

  keys.forEach((value) => {
    const assetName = resolveTileAssetName(value);
    const frame = atlasMeta.frames[assetName];

    if (!frame) {
      throw new Error(`[tile-atlas] Missing frame for ${value} -> ${assetName}`);
    }

    const texture = new PIXI.Texture({
      source,
      frame: new PIXI.Rectangle(frame.x, frame.y, frame.w, frame.h),
      orig: new PIXI.Rectangle(0, 0, frame.w, frame.h),
    });

    PIXI.Assets.cache.set(value, texture);
  });
}

/** 获取已加载的牌纹理 */
export function getTexture(value: string): PIXI.Texture {
  return PIXI.Assets.get(value) || PIXI.Texture.WHITE;
}
