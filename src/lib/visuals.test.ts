import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { paperFigure, paperSketch } from "./visuals";
import type { Dataset } from "./pipeline";

test("original figures require an exact paper title, not a shared topic", () => {
  const figure = paperFigure({ title: "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding" });
  assert.ok(figure);
  assert.equal(figure.label, "Figure 1 · Devlin et al.");
  assert.ok(figure.source.startsWith("https://arxiv.org/"));
  assert.equal(paperFigure({ title: "A survey of BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding" }), undefined);
});

test("all featured papers have a nonempty, accessible visual fallback without network requests", () => {
  const dir = new URL("../../public/data/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const data: Dataset = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    for (const paper of data.papers) {
      const sketch = paperSketch(paper);
      assert.ok(sketch.description, paper.title);
      assert.ok(sketch.labels.length > 0 && sketch.labels.length <= 3, paper.title);
      assert.ok(sketch.labels.every(Boolean), paper.title);
      if (sketch.kind === "concepts") {
        assert.match(sketch.description, /not a summary of the findings/);
        const titleWords = paper.title.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);
        assert.deepEqual(sketch.labels.join(" ").split(" "), titleWords);
      }
    }
  }
});

test("sketch selection follows the paper, not the user's query or unrelated homonyms", () => {
  assert.equal(paperSketch({ title: "Attention deficit in children" }).kind, "concepts");
  assert.equal(paperSketch({ title: "Power transformers and electrical insulation" }).kind, "concepts");
  assert.equal(paperSketch({ title: "Diffusion models of decision making" }).kind, "concepts");
  assert.equal(paperSketch({ title: "Text-to-image generation with diffusion models" }).kind, "diffusion");
  assert.equal(paperSketch({ title: "Evaluating Retrieval Quality in Retrieval-Augmented Generation" }).kind, "retrieval");
  assert.equal(paperSketch({ title: "Quantum error correction" }).kind, "quantum");
});
