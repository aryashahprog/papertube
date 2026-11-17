import { strict as assert } from "node:assert";
import { test } from "node:test";
import { slideDuration } from "./tv";

test("slide duration counts title and takeaway words", () => {
  assert.equal(slideDuration("one two three four five", "six seven eight nine ten"), 6300);
});
test("slide duration handles empty text and clamps long text", () => {
  assert.equal(slideDuration("", ""), 6000);
  assert.equal(slideDuration("word ".repeat(100), ""), 15000);
});
