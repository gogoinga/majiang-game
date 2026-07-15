const LAIZI_TILE = "中";

function isSuitedTile(tile) {
  return /^[1-9][st]$/.test(tile);
}

function buildCounts(tiles) {
  const counts = {};
  tiles.forEach((tile) => {
    counts[tile] = (counts[tile] || 0) + 1;
  });
  return counts;
}

function getTileOrder(counts) {
  return Object.keys(counts).sort((a, b) => {
    if (a === b) return 0;
    if (isSuitedTile(a) && isSuitedTile(b)) {
      const suitCompare = a[1].localeCompare(b[1]);
      if (suitCompare !== 0) return suitCompare;
      return Number(a[0]) - Number(b[0]);
    }
    if (isSuitedTile(a)) return -1;
    if (isSuitedTile(b)) return 1;
    return a.localeCompare(b, "zh-Hans-CN");
  });
}

function splitLaizi(hand) {
  const normalTiles = hand.filter((tile) => tile !== LAIZI_TILE);
  return {
    normalTiles,
    laiziCount: hand.length - normalTiles.length,
  };
}

function isSevenPairs(hand) {
  if (hand.length !== 14) return false;
  const { normalTiles, laiziCount } = splitLaizi(hand);
  const counts = Object.values(buildCounts(normalTiles));
  const singleCount = counts.filter((count) => count % 2 === 1).length;
  if (singleCount > laiziCount) return false;

  const pairCount =
    counts.reduce((sum, count) => sum + Math.floor(count / 2), 0) +
    singleCount +
    Math.floor((laiziCount - singleCount) / 2);
  return pairCount >= 7;
}

function canFormMelds(counts, laiziCount, meldsNeeded) {
  if (meldsNeeded === 0) {
    return Object.values(counts).every((count) => count === 0);
  }

  const nextTile = getTileOrder(counts).find((tile) => counts[tile] > 0);
  if (!nextTile) {
    return (
      laiziCount >= meldsNeeded * 3 &&
      (laiziCount - meldsNeeded * 3) % 3 === 0
    );
  }

  const nextCount = counts[nextTile] || 0;
  const tripletNeed = Math.max(0, 3 - nextCount);
  if (tripletNeed <= laiziCount) {
    counts[nextTile] -= 3 - tripletNeed;
    if (canFormMelds(counts, laiziCount - tripletNeed, meldsNeeded - 1)) {
      counts[nextTile] += 3 - tripletNeed;
      return true;
    }
    counts[nextTile] += 3 - tripletNeed;
  }

  if (isSuitedTile(nextTile)) {
    const rank = Number(nextTile[0]);
    const suit = nextTile[1];
    const next1 = `${rank + 1}${suit}`;
    const next2 = `${rank + 2}${suit}`;
    if (rank <= 7) {
      let usedLaizi = 0;
      const removedTiles = [];
      for (const tile of [nextTile, next1, next2]) {
        if ((counts[tile] || 0) > 0) {
          counts[tile] -= 1;
          removedTiles.push(tile);
        } else {
          usedLaizi += 1;
        }
      }

      if (
        usedLaizi <= laiziCount &&
        canFormMelds(counts, laiziCount - usedLaizi, meldsNeeded - 1)
      ) {
        removedTiles.forEach((tile) => {
          counts[tile] += 1;
        });
        return true;
      }

      removedTiles.forEach((tile) => {
        counts[tile] += 1;
      });
    }
  }

  return false;
}

export function canHuWithExposedSets(hand, exposedSetCount = 0) {
  const meldsNeeded = 4 - exposedSetCount;
  if (meldsNeeded < 0) return false;

  if (exposedSetCount === 0 && isSevenPairs(hand)) {
    return true;
  }

  if (hand.length !== meldsNeeded * 3 + 2) return false;

  const { normalTiles, laiziCount } = splitLaizi(hand);
  const counts = buildCounts(normalTiles);
  for (const [tile, count] of Object.entries(counts)) {
    if (count >= 2) {
      counts[tile] -= 2;
      if (canFormMelds(counts, laiziCount, meldsNeeded)) {
        counts[tile] += 2;
        return true;
      }
      counts[tile] += 2;
    }

    if (count >= 1 && laiziCount >= 1) {
      counts[tile] -= 1;
      if (canFormMelds(counts, laiziCount - 1, meldsNeeded)) {
        counts[tile] += 1;
        return true;
      }
      counts[tile] += 1;
    }
  }

  if (laiziCount >= 2) {
    if (canFormMelds(counts, laiziCount - 2, meldsNeeded)) {
      return true;
    }
  }

  return false;
}
