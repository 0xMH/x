import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { readdir } from "fs/promises";
import path from "path";

const QUERY = process.argv[2] ?? "تم تعبئة الكرش";
const IMAGES_DIR = "./images";
const SCROLL_TIMES = 15;
const MIN_BYTES = 5_000;
const IMG_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"]);
const SKIP_HOSTS = ["google.com", "gstatic.com", "googleapis.com", "googleusercontent.com"];

mkdirSync(IMAGES_DIR, { recursive: true });

const url = QUERY.startsWith("http")
  ? QUERY
  : `https://www.google.com/search?q=${encodeURIComponent(QUERY)}&udm=2`;

console.log("Scraping:", url);

const browser = await chromium.launch({
  headless: false,
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
});

const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  viewport: { width: 1440, height: 900 },
});

// intercept image responses directly from the network
const intercepted = new Set();
ctx.on("response", async (res) => {
  const ct = res.headers()["content-type"] ?? "";
  if (!ct.startsWith("image/")) return;
  const resUrl = res.url();
  if (SKIP_HOSTS.some((h) => resUrl.includes(h))) return;
  if (resUrl.startsWith("data:")) return;
  try {
    const body = await res.body();
    if (body.length < MIN_BYTES) return;
    intercepted.add({ url: resUrl, body, ct });
  } catch {}
});

const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(3000);

// also parse "ou" URLs from page source
function extractFromSource(html) {
  const urls = new Set();
  for (const m of html.matchAll(/"ou"\s*:\s*"(https?:\/\/[^"]+)"/g)) {
    urls.add(m[1]);
  }
  for (const m of html.matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif)/gi)) {
    const u = m[0].replace(/[\\,;)]+$/, "");
    const host = u.match(/https?:\/\/([^/]+)/)?.[1] ?? "";
    if (!SKIP_HOSTS.some((h) => host.endsWith(h))) urls.add(u);
  }
  return urls;
}

const sourceUrls = new Set();
for (let i = 0; i < SCROLL_TIMES; i++) {
  await page.keyboard.press("End");
  await page.waitForTimeout(1800);
  const html = await page.content();
  for (const u of extractFromSource(html)) sourceUrls.add(u);

  const btn = await page.$("input[value='Show more results']");
  if (btn) { await btn.click(); await page.waitForTimeout(1200); }

  console.log(`  scroll ${i + 1}/${SCROLL_TIMES}: ${intercepted.size} intercepted, ${sourceUrls.size} from source`);
}

await browser.close();

// save intercepted images first
let saved = 0;
for (const { url: u, body, ct } of intercepted) {
  const ext = ct.split("/")[1]?.split(";")[0]?.trim().replace("jpeg", "jpg") ?? "jpg";
  const dest = path.join(IMAGES_DIR, `img_${String(saved).padStart(4, "0")}.${ext}`);
  writeFileSync(dest, body);
  console.log(`  [${++saved}] intercepted: ${dest} (${Math.round(body.length / 1024)}KB)`);
}

// download remaining source URLs
for (const u of sourceUrls) {
  try {
    const res = await fetch(u);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.startsWith("image/")) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_BYTES) continue;
    const ext = ct.split("/")[1]?.split(";")[0]?.trim().replace("jpeg", "jpg") ?? "jpg";
    const dest = path.join(IMAGES_DIR, `img_${String(saved).padStart(4, "0")}.${ext}`);
    writeFileSync(dest, buf);
    console.log(`  [${++saved}] fetched: ${dest} (${Math.round(buf.length / 1024)}KB)`);
  } catch {}
}

// build index.html
const files = (await readdir(IMAGES_DIR))
  .filter((f) => IMG_EXTS.has(f.split(".").pop()?.toLowerCase() ?? ""))
  .sort();

const imgTags = files.map((f) => `    <img src="images/${f}" loading="lazy">`).join("\n");

writeFileSync(
  "./index.html",
  `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gallery</title>
  <style>
    body { margin: 0; background: #111; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 4px;
      padding: 4px;
    }
    img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
  </style>
</head>
<body>
  <div class="grid">
${imgTags}
  </div>
</body>
</html>
`
);

console.log(`\nBuilt index.html with ${files.length} images`);
