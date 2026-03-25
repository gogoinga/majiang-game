import * as PIXI from "pixi.js";
import { TableScene } from "./scenes/TableScene";
import { loadAllTiles } from "@/hooks/useLoadCard";

export async function createApp(container: HTMLElement) {
  // 1. 创建 Application 实例（此时没有 renderer）
  const app = new PIXI.Application();
  // 2. 显式初始化（传入配置）
  await app.init({
    width: container.clientWidth,
    height: container.clientHeight,
    backgroundColor: 0x006400,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  await loadAllTiles();
  // 3. 把 canvas 放进 DOM
  container.appendChild(app.canvas);
  // 把 app.screen 传给场景
  const tableScene = new TableScene(app.screen);
  app.stage.addChild(tableScene);

  return { app, tableScene };
}
