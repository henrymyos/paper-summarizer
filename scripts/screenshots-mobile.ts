/**
 * Mobile screenshots — drives Chromium at a phone-size viewport against
 * the live site so we can see where things overflow.
 */
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SITE = process.env.SITE_URL ?? "https://paper-summarizer-neon.vercel.app";
const VISITOR_ID =
  process.env.SHOT_VISITOR_ID ?? "803548bc-0b71-4dc6-b0b7-8687be6309fc";

const OUT_DIR = path.resolve(process.cwd(), "docs/screenshots/mobile");

async function shot(page: Page, name: string) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  → ${path.relative(process.cwd(), file)}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 size
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
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
  await page.waitForTimeout(800);

  console.log("[1] mobile — closed sidebar, empty state");
  await shot(page, "01-empty");

  console.log("[2] mobile — open sidebar (drawer)");
  const hamburger = page.getByLabel(/Open sidebar/).first();
  await hamburger.click();
  await page.waitForTimeout(400);
  await shot(page, "02-drawer");

  console.log("[3] mobile — selected doc, chat header with tabs");
  await page.getByText("Disc Devils Constitution").first().click();
  await page.waitForTimeout(1000);
  await shot(page, "03-chat");

  console.log("[4] mobile — structure tab");
  const structure = page.getByRole("button", { name: /^Structure$/ }).first();
  if (await structure.count()) {
    await structure.click();
    await page.waitForTimeout(500);
    await shot(page, "04-structure");
  }

  console.log("[5] mobile — saved passages");
  await page.getByLabel(/Open sidebar/).first().click();
  await page.waitForTimeout(300);
  await page.getByText("Saved passages", { exact: false }).first().click();
  await page.waitForTimeout(700);
  await shot(page, "05-saved");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
