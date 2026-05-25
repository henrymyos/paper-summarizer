/**
 * Generate the README screenshots by driving Chromium against the live
 * site with a known visitor_id cookie so the library is populated.
 *
 *   npx tsx scripts/screenshots.ts
 */
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SITE = process.env.SITE_URL ?? "https://paper-summarizer-neon.vercel.app";
const VISITOR_ID =
  process.env.SHOT_VISITOR_ID ?? "803548bc-0b71-4dc6-b0b7-8687be6309fc";

const OUT_DIR = path.resolve(process.cwd(), "docs/screenshots");

async function shot(page: Page, name: string) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  → ${path.relative(process.cwd(), file)}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  await context.addCookies([
    {
      name: "visitor_id",
      value: VISITOR_ID,
      domain: new URL(SITE).hostname,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  await page.goto(SITE, { waitUntil: "networkidle" });
  // Allow the sidebar list to render after fetching documents.
  await page.waitForFunction(
    () => document.querySelectorAll('aside .group p.font-medium').length > 3,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(600);

  console.log("[1/5] overview — library populated");
  await shot(page, "01-overview");

  // Pick the most content-rich doc.
  console.log("[2/5] chat view with persisted conversation");
  const targetTitle = "Disc Devils Constitution";
  await page.getByText(targetTitle, { exact: false }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await shot(page, "02-chat");

  console.log("[3/5] structure tab");
  const structure = page.getByRole("button", { name: /^Structure$/ }).first();
  if (await structure.count()) {
    await structure.click();
    await page.waitForTimeout(500);
    await shot(page, "03-structure");
  } else {
    console.log("  (structure tab not present)");
  }

  console.log("[4/5] references tab");
  const refs = page.getByRole("button", { name: /^References$/ }).first();
  if (await refs.count()) {
    await refs.click();
    await page.waitForTimeout(500);
    await shot(page, "04-references");
  } else {
    console.log("  (references tab not present — that doc has no parsed references)");
  }

  // Back to chat so we can save a passage.
  const chatTab = page.getByRole("button", { name: /^Chat$/ }).first();
  if (await chatTab.count()) {
    await chatTab.click();
    await page.waitForTimeout(300);
  }
  // Click the first citation pill so the source list expands, then save.
  const pill = page
    .locator("button[aria-label^='Source']")
    .first();
  if (await pill.count()) {
    await pill.click();
    await page.waitForTimeout(200);
  }
  const bookmark = page.getByLabel(/Save passage/).first();
  if (await bookmark.count()) {
    await bookmark.click();
    await page.waitForTimeout(400);
  }

  console.log("[5/5] saved passages view");
  await page.getByText("Saved passages", { exact: false }).first().click();
  await page.waitForTimeout(800);
  await shot(page, "05-saved");

  await browser.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
