import assert from "assert";
import { canHuWithExposedSets } from "./winCheck.js";

assert.strictEqual(
  canHuWithExposedSets(
    ["1s", "2s", "3s", "4s", "5s", "6s", "1t", "2t", "3t", "东", "东", "东", "中", "中"],
    0
  ),
  true
);

assert.strictEqual(
  canHuWithExposedSets(
    ["1s", "2s", "3s", "4s", "5s", "6s", "1t", "2t", "3t", "中", "中"],
    1
  ),
  true
);

assert.strictEqual(
  canHuWithExposedSets(
    ["1s", "1s", "2s", "2s", "3s", "3s", "4t", "4t", "5t", "5t", "东", "东", "中", "中"],
    0
  ),
  true
);

assert.strictEqual(
  canHuWithExposedSets(
    ["1s", "1s", "1s", "2s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "中", "发"],
    0
  ),
  false
);

assert.strictEqual(
  canHuWithExposedSets(
    ["1s", "2s", "3s", "4s", "5s", "6s", "1t", "2t", "3t", "东", "东", "东", "发", "中"],
    0
  ),
  true
);

assert.strictEqual(
  canHuWithExposedSets(
    ["1s", "2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "发", "发", "东", "中", "中"],
    0
  ),
  true
);

assert.strictEqual(
  canHuWithExposedSets(
    ["1s", "1s", "2s", "4s", "5s", "7s", "8s", "东", "南", "西", "北", "发", "中", "白"],
    0
  ),
  false
);

console.log("PASS: Hu calculation");
