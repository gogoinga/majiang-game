/** 广东麻将 108 张牌型权重 */
const tileOrder: Record<string, number> = {};
// 筒子 1-9
for (let n = 1; n <= 9; n++) tileOrder[n + "t"] = n;
// 条子 1-9
for (let n = 1; n <= 9; n++) tileOrder[n + "s"] = n + 9;
// 字牌
["东", "南", "西", "北", "中", "发", "白"].forEach(
  (v, i) => (tileOrder[v] = i + 19)
);

export function sortTiles(hand: string[]): string[] {
  return hand.sort((a, b) => tileOrder[a] - tileOrder[b]);
}
