import { strict as assert } from "node:assert";
import { test } from "node:test";
import { tourPosition } from "./tv-position";

test("tour positions are one-based and bounded", () => {
  assert.equal(tourPosition("4", 15), 3);
  assert.equal(tourPosition("99", 15), 14);
  assert.equal(tourPosition("1", 0), 0);
});
test("missing and invalid positions start at the beginning", () => {
  for (const value of [null, "", "0", "-2", "1.5", "NaN", "Infinity"]) {
    assert.equal(tourPosition(value, 15), 0);
  }
});
