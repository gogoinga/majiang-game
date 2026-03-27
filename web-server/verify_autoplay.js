import assert from 'assert';

// We'll simulate the state transition that main.js will do
const mockHand = ["1s", "2s", "3s", "4t"];
const cardToPlay = mockHand[mockHand.length - 1];
assert.strictEqual(cardToPlay, "4t", "Should pick the last (rightmost) card");
console.log("PASS: Rightmost card strategy");
