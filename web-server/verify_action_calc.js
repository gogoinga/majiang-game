import assert from 'assert';

function getPlayOptions(hand, playedCard) {
  const count = hand.filter(c => c === playedCard).length;
  const options = [];
  if (count >= 2) options.push('peng');
  if (count === 3) options.push('gang');
  return options;
}

assert.deepStrictEqual(getPlayOptions(["1s", "1s", "2s"], "1s"), ["peng"]);
assert.deepStrictEqual(getPlayOptions(["1s", "1s", "1s"], "1s"), ["peng", "gang"]);
assert.deepStrictEqual(getPlayOptions(["2s", "3s"], "1s"), []);
console.log("PASS: Action calculation");
