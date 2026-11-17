import { test } from "node:test";
import assert from "node:assert/strict";
import { digestTopics } from "./digest-signup";

test("digest topics normalize, deduplicate and sort followed queries", () => {
  const follows = [{ q: " Longevity " }, { q: " CRISPR " }, { q: "crispr" }, { q: "large   language models" }, { q: " " }];
  assert.equal(digestTopics(follows), "crispr|large language models|longevity");
  assert.equal(follows[0].q, " Longevity ");
});
test("digest topics use featured when no queries remain", () => {
  assert.equal(digestTopics([]), "featured");
  assert.equal(digestTopics([{ q: "  " }]), "featured");
});
