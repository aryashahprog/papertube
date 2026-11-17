import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const out = "/home/ubuntu/out/pt";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = "http://localhost:4173/papertube/";
await page.goto(base);
await page
  .getByRole("heading", { name: "What do you want to understand?" })
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
// Exercise live fallback rather than only bundled snapshots.
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
  "PASS: live CRISPR fallback, home shortcut, results, map hover/details, TV controls, 390px mobile; screenshots saved to " +
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
