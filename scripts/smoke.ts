import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const out = "/home/ubuntu/shots";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 1000 },
  reducedMotion: "reduce",
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://localhost:4173/papertube/";
await page.goto(base);
await page
  .getByRole("heading", { name: "Your topics", exact: true })
  .waitFor();
await page.screenshot({ path: out + "/home.png", fullPage: true });
await page.keyboard.press("/");
assert.equal(
  await page
    .getByRole("textbox")
    .evaluate((el) => el === document.activeElement),
  true,
);
await page.goto(base + "?q=CRISPR");
await page.locator(".start-card").first().waitFor({ timeout: 60000 });
let countRequests = 0;
let failRecent = false;
let seedRequest = true;
const recentQueries: URL[] = [];
await page.route("https://api.openalex.org/**", (r) => {
  if (seedRequest) {
    seedRequest = false;
    return r.fulfill({ json: { meta: { count: 0 }, results: [] } });
  }
  countRequests++;
  recentQueries.push(new URL(r.request().url()));
  if (failRecent) return r.fulfill({ status: 503, body: "unavailable" });
  const titles = ["Immune gene expression in pancreatic cancer", "CRISPR-Cas9 editing improves drought resistance in rice", "Benchmarking CRISPR base editors in human cells", "CRISPR screens identify targets in glioblastoma", "Delivery of CRISPR ribonucleoproteins using lipid nanoparticles", "High-fidelity CRISPR genome editing in stem cells", "CRISPR gene drives for mosquito control", "Language development in children"];
  return r.fulfill({ json: { meta: { count: 4830 }, results: titles.map((title, i) => ({
    id: `https://openalex.org/recent-${i}`, title,
    publication_year: new Date().getFullYear(), publication_date: new Date().toISOString().slice(0, 10), doi: `https://doi.org/10.1234/recent-${i}`,
  })) } });
});
await page.getByRole("button", { name: "Follow topic", exact: true }).click();
await page.getByRole("button", { name: "Following ✓", exact: true }).waitFor();
await page.waitForFunction(() => Array.isArray(JSON.parse(localStorage.getItem("pt-follows")!)[0]?.seenPapers));
assert.equal(await page.locator(".new-papers").count(), 0);
await page.goto(base);
await page.getByRole("heading", { name: "Your topics", exact: true }).waitFor();
await page.getByText("5 new", { exact: true }).waitFor();
await page.screenshot({ path: out + "/home-followed.png", fullPage: true });
await page.reload();
await page.getByText("5 new", { exact: true }).waitFor();
assert.equal(countRequests, 1);
await page.evaluate(() => {
  const follows = JSON.parse(localStorage.getItem("pt-follows")!);
  follows[0].seenIds = follows[0].seenIds.slice(2);
  localStorage.setItem("pt-follows", JSON.stringify(follows));
});
const previousVisit = await page.evaluate(() => JSON.parse(localStorage.getItem("pt-follows")!)[0].lastSeenAt);
failRecent = true;
await page.route("https://api.crossref.org/**", (r) => r.fulfill({ status: 503, body: "unavailable" }));
await page.goto(base + "?q=CRISPR");
await page.getByRole("button", { name: "Following ✓", exact: true }).waitFor();
await page.waitForFunction(() => !document.querySelector(".loading"));
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("pt-follows")!)[0].lastSeenAt), previousVisit);
failRecent = false;
await page.unroute("https://api.crossref.org/**");
await page.goto(base + "?q=CRISPR");
await page.getByRole("heading", { name: "New since your last visit" }).waitFor();
assert.equal(await page.locator(".new-feed a").count(), 5);
assert.equal(await page.getByText(/Top 8 of/).count(), 0);
assert.doesNotMatch(await page.locator(".new-feed").innerText(), /Immune gene expression|Language development/);
assert.match(await page.getByRole("link", { name: "See all ↗" }).getAttribute("href") || "", /^https:\/\/openalex\.org\/works\?.*publication_date/);
assert.equal(recentQueries[0].searchParams.get("search"), recentQueries.at(-1)!.searchParams.get("search"));
assert.equal(recentQueries[0].searchParams.get("filter"), recentQueries.at(-1)!.searchParams.get("filter"));
assert.equal(recentQueries.at(-1)!.searchParams.get("per-page"), "50");
assert.match(recentQueries.at(-1)!.searchParams.get("filter")!, /title_and_abstract.search:crispr/i);
await page.setViewportSize({ width: 1280, height: 1400 });
await page.screenshot({ path: out + "/results-followed-new.png" });
await page.setViewportSize({ width: 1280, height: 1000 });
await page.goto(base);
await page.getByText("1 new", { exact: true }).waitFor();
assert.equal(countRequests, 4);
await page.goto(base + "?q=CRISPR");
await page.waitForFunction(() => JSON.parse(localStorage.getItem("pt-follows")!)[0].seenIds.length === 6);
await page.reload();
await page.locator(".start-card").first().waitFor();
await page.waitForFunction(() => !document.querySelector(".loading"));
assert.equal(await page.locator(".new-feed a").count(), 0);
await page.getByRole("button", { name: "Following ✓", exact: true }).click();
await page.getByRole("button", { name: "Follow topic", exact: true }).waitFor();
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("pt-follows")!).length), 0);
assert.equal(await page.locator(".new-pill").count(), 0);
console.log("PASS: on-topic five-paper digest matches badge, ignores raw 4830 total and unrelated titles, matching date bounds, failed fetch preserves visit, seen exclusion and unfollow");
await page.screenshot({ path: out + "/results.png", fullPage: true });
await page.locator('svg g[role="button"]').last().hover();
await page.getByRole("tooltip").waitFor();
await page.screenshot({ path: out + "/map-hover.png", fullPage: true });
await page.locator('svg g[role="button"]').last().click();
await page.getByRole("dialog", { name: "Paper details" }).waitFor();
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "▶ Play", exact: true }).click();
await page.locator(".tv-slide").waitFor();
assert.equal(await page.locator(".tv-no-abstract").count(), 0);
await page.keyboard.press("Space");
await page.keyboard.press("ArrowRight");
assert.match(await page.locator(".tv-control-row").innerText(), /02 \/ 15/);
await page.screenshot({ path: out + "/tv-mode.png", fullPage: true });
await page.keyboard.press("Escape");
assert.equal(await page.locator(".tv").count(), 0);
const quality: Record<string, unknown> = {};
for (const q of ["CRISPR", "diffusion models", "transformers"]) {
  await page.goto(base + "?q=" + encodeURIComponent(q));
  await page.locator(".start-card").first().waitFor();
  assert.doesNotMatch(
    await page.locator(".start-grid").innerText(),
    /No abstract available/,
  );
  quality[q] = await page.locator(".start-card").evaluateAll((cards) =>
    cards.map((c) => ({
      title: c.querySelector(".title-button")?.textContent,
      takeaway:
        c.querySelector(".takeaway")?.textContent ||
        c.querySelector(".citation-summary")?.textContent,
    })),
  );
}
console.log(JSON.stringify(quality, null, 2));
await writeFile(out + "/top-five.json", JSON.stringify(quality, null, 2));
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "?q=CRISPR");
await page.locator(".start-card").first().waitFor();
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await page.screenshot({ path: out + "/mobile.png", fullPage: true });
// Exercise fallback with a local fixture; avoid spending shared API quota.
await page.unroute("https://api.openalex.org/**");
await page.route("https://api.openalex.org/**", (r) => r.fulfill({ status: 503, body: "unavailable" }));
const fixture = JSON.parse(await readFile("public/data/crispr.json", "utf8"));
await page.route("https://api.crossref.org/**", (r) => r.fulfill({ json: { message: {
  "total-results": fixture.papers.length,
  items: fixture.papers.map((p: any) => ({ DOI: p.doi || p.id, title: [p.title], published: { "date-parts": [[p.year]] }, "is-referenced-by-count": p.citations, abstract: p.abstract, score: p.relevance || 1 })),
} } }));
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(base);
await page.evaluate(() => sessionStorage.clear());
await page.route("**/data/crispr.json", (r) =>
  r.fulfill({ status: 404, body: "" }),
);
await page.goto(base + "?q=CRISPR");
await page.locator(".start-card").first().waitFor({ timeout: 90000 });
await page.locator(".backup").filter({ hasText: /^Crossref$/ }).waitFor();
console.log(
  "PASS: fixture CRISPR fallback, home shortcut, results, map hover/details, TV controls, 390px mobile; screenshots saved to " +
    out,
);
assert.deepEqual(errors, []);
console.log("PASS: no browser runtime errors");
await page.route("https://api.openalex.org/**", (r) =>
  r.fulfill({ status: 503, body: "unavailable" }),
);
await page.route("https://api.crossref.org/**", (r) =>
  r.fulfill({ status: 503, body: "unavailable" }),
);
await page.goto(base + "?q=smoke-error-case");
await page.getByRole("alert").waitFor();
await page.route("https://api.crossref.org/**", (r) =>
  r.fulfill({ json: { message: { items: [], "total-results": 0 } } }),
);
await page.goto(base + "?q=smoke-empty-case");
await page.getByText("No papers mention “smoke-empty-case”.").waitFor();
console.log("PASS: explicit empty and index-error UI states");
await browser.close();
