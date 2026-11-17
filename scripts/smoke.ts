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
  .getByRole("heading", { name: "The must-read papers on any topic." })
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
  return r.fulfill({ json: { meta: { count: 13 }, results: Array.from({ length: 8 }, (_, i) => i + 1).map((n) => ({
    id: `https://openalex.org/recent-${n}`, title: `Recent CRISPR finding ${n}`,
    publication_year: new Date().getFullYear(), publication_date: new Date().toISOString().slice(0, 10), doi: `https://doi.org/10.1234/recent-${n}`,
  })) } });
});
await page.getByRole("button", { name: "Follow topic", exact: true }).click();
await page.getByRole("button", { name: "Following ✓", exact: true }).waitFor();
await page.waitForFunction(() => Array.isArray(JSON.parse(localStorage.getItem("pt-follows")!)[0]?.seenPapers));
assert.equal(await page.locator(".new-papers").count(), 0);
await page.goto(base);
await page.getByRole("heading", { name: "YOUR TOPICS", exact: true }).waitFor();
await page.getByText("13 new", { exact: true }).waitFor();
await page.screenshot({ path: out + "/home-followed.png", fullPage: true });
await page.reload();
await page.getByText("13 new", { exact: true }).waitFor();
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
assert.equal(await page.locator(".new-feed a").count(), 8);
await page.getByText("Top 8 of 13", { exact: false }).waitFor();
assert.match(await page.getByRole("link", { name: "See all ↗" }).getAttribute("href") || "", /from_publication_date/);
assert.equal(recentQueries[0].searchParams.get("search"), recentQueries.at(-1)!.searchParams.get("search"));
assert.equal(recentQueries[0].searchParams.get("filter"), recentQueries.at(-1)!.searchParams.get("filter"));
assert.equal(recentQueries.at(-1)!.searchParams.get("per-page"), "8");
await page.setViewportSize({ width: 1280, height: 1400 });
await page.screenshot({ path: out + "/results-followed-new.png" });
await page.setViewportSize({ width: 1280, height: 1000 });
await page.goto(base);
await page.getByText("5 new", { exact: true }).waitFor();
assert.equal(countRequests, 4);
await page.goto(base + "?q=CRISPR");
await page.reload();
await page.locator(".start-card").first().waitFor();
await page.waitForFunction(() => !document.querySelector(".loading"));
assert.equal(await page.locator(".new-feed a").count(), 0);
await page.getByRole("button", { name: "Following ✓", exact: true }).click();
await page.getByRole("button", { name: "Follow topic", exact: true }).waitFor();
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("pt-follows")!).length), 0);
assert.equal(await page.locator(".new-pill").count(), 0);
console.log("PASS: follow seeding, full total beyond eight, Top 8 of 13 and See all, matching date bounds, failed fetch preserves visit, same-day seen exclusion and unfollow");
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
await page.getByText(/Backup index in use/).waitFor();
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
await page.getByText("No papers found. Try a broader topic.").waitFor();
console.log("PASS: explicit empty and index-error UI states");
await browser.close();
