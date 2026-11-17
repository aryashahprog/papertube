import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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
      const figure = paperFigure(paper);
      if (figure?.src.startsWith("figures/")) {
        assert.ok(existsSync(new URL(`../../public/${figure.src}`, import.meta.url)), figure.src);
      }
    }
  }
});

test("sketch selection follows the paper, not the user's query or unrelated homonyms", () => {
  assert.equal(paperSketch({ title: "Attention deficit in children" }).kind, "study");
  assert.equal(paperSketch({ title: "Power transformers and electrical insulation" }).kind, "electrical");
  assert.equal(paperSketch({ title: "Vegetable oils for liquid-filled transformers" }).kind, "electrical");
  assert.equal(paperSketch({ title: "Monolithic transformers for silicon RF IC design" }).kind, "electrical");
  assert.equal(paperSketch({ title: "Transformers for image recognition" }).kind, "attention");
  assert.equal(paperSketch({ title: "Diffusion models of decision making" }).kind, "study");
  assert.equal(paperSketch({ title: "Text-to-image generation with diffusion models" }).kind, "diffusion");
  assert.equal(paperSketch({ title: "Evaluating Retrieval Quality in Retrieval-Augmented Generation" }).kind, "retrieval");
  assert.equal(paperSketch({ title: "Quantum error correction" }).kind, "quantum");
});

test("classic must-reads have their own original figures, including DDPM and DiT", () => {
  for (const title of [
    "Denoising Diffusion Probabilistic Models",
    "Scalable Diffusion Models with Transformers",
    "Denoising Diffusion Implicit Models",
    "Improved Denoising Diffusion Probabilistic Models",
    "Diffusion Models Beat GANs on Image Synthesis",
    "Swin Transformer: Hierarchical Vision Transformer using Shifted Windows",
    "LoRA: Low-Rank Adaptation of Large Language Models",
    "Quantum error correction below the surface code threshold",
    "Suppressing quantum errors by scaling a surface code logical qubit",
    "A Programmable Dual-RNA–Guided DNA Endonuclease in Adaptive Bacterial Immunity",
    "Multiplex Genome Engineering Using CRISPR/Cas Systems",
    "Production, use, and fate of all plastics ever made",
  ]) {
    const figure = paperFigure({ title });
    assert.ok(figure, title);
    assert.ok(existsSync(new URL(`../../public/${figure.src}`, import.meta.url)), title);
    assert.match(figure.label, /Figure \d+ · /);
    assert.match(figure.source, /^https:\/\/(arxiv.org|pmc.ncbi.nlm.nih.gov)\//);
  }
  assert.notEqual(paperFigure({ title: "Denoising Diffusion Probabilistic Models" })?.src,
    paperFigure({ title: "Scalable Diffusion Models with Transformers" })?.src);
  assert.notEqual(paperFigure({ title: "Quantum error correction below the surface code threshold" })?.src,
    paperFigure({ title: "Suppressing quantum errors by scaling a surface code logical qubit" })?.src);
});

test("fallbacks explain a mechanism or study design, never chunks of a title", () => {
  const dit = paperSketch({ title: "Scalable Diffusion Models with Transformers" });
  assert.equal(dit.kind, "dit");
  assert.deepEqual(dit.labels, ["Noisy patches", "Transformer", "Predict noise"]);
  assert.equal(paperSketch({ title: "Semaglutide in adults: a randomised placebo-controlled trial" }).kind, "trial");
  assert.equal(paperSketch({ title: "GLP-1 receptor agonists: a systematic review and meta-analysis" }).kind, "review");
  assert.equal(paperSketch({ title: "GLP-1 receptor agonists: a systematic review of randomized controlled trials in patients with diabetes" }).kind, "review");
  assert.equal(paperSketch({ title: "Semaglutide in adults: a meta-analysis of placebo-controlled trials" }).kind, "review");
  assert.equal(paperSketch({ title: "Glucagon-like peptide-1 receptor: mechanisms and advances in therapy" }).kind, "receptor");
  assert.equal(paperSketch({ title: "Hallmarks of aging: An expanding universe" }).kind, "aging");
  assert.equal(paperSketch({ title: "The Value of Health and Longevity" }).kind, "study");
  assert.equal(paperSketch({ title: "Randomized algorithms for matrices" }).kind, "study");
  assert.deepEqual(paperSketch({ title: "A completely unfamiliar subject with a very long title" }).labels, ["Research"]);
});
