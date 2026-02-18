#!/usr/bin/env python3
"""
Scrape Google Images and build index.html gallery.
Usage: uv run scrape.py "your search query"
       uv run scrape.py "https://www.google.com/search?q=...&udm=2"
"""

import asyncio
import sys
import re
from pathlib import Path
from urllib.parse import quote

import httpx
from playwright.async_api import async_playwright

HERE = Path(__file__).parent
IMAGES_DIR = HERE / "images"
IMAGES_DIR.mkdir(exist_ok=True)

IMG_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"}
SCROLL_TIMES = 15
MIN_SIZE = 5_000  # skip tiny images (icons, thumbnails < 5KB)


def make_url(query_or_url: str) -> str:
    if query_or_url.startswith("http"):
        return query_or_url
    return f"https://www.google.com/search?q={quote(query_or_url)}&udm=2"


def load_firefox_cookies():
    try:
        import browser_cookie3
        cj = browser_cookie3.firefox(domain_name=".google.com")
        return [
            {
                "name": c.name,
                "value": c.value,
                "domain": c.domain if c.domain else ".google.com",
                "path": c.path or "/",
            }
            for c in cj
        ]
    except Exception as e:
        print(f"No Firefox cookies: {e}")
        return []


async def collect_image_urls(page) -> set[str]:
    urls: set[str] = set()
    skip_domains = {"google.com", "gstatic.com", "googleapis.com", "googleusercontent.com"}

    for i in range(SCROLL_TIMES):
        await page.keyboard.press("End")
        await page.wait_for_timeout(2000)

        # extract full-size image URLs embedded in Google's JS data
        content = await page.content()

        # pattern 1: "ou":"URL" (original url field in JSON blobs)
        for m in re.finditer(r'"ou"\s*:\s*"(https?://[^"]+)"', content):
            urls.add(m.group(1))

        # pattern 2: standalone https:// image URLs not from google domains
        for m in re.finditer(r'https?://[^\s"\'<>]+\.(?:jpg|jpeg|png|webp|gif)', content, re.IGNORECASE):
            url = m.group(0).rstrip("\\,;)")
            host = re.search(r'https?://([^/]+)', url)
            if host and not any(d in host.group(1) for d in skip_domains):
                urls.add(url)

        # click "Show more results" if present
        btn = await page.query_selector("input[value='Show more results']")
        if btn:
            await btn.click()
            await page.wait_for_timeout(1500)

        print(f"  scroll {i+1}/{SCROLL_TIMES}: {len(urls)} urls found so far")

    return urls


async def download(urls: set[str]) -> int:
    saved = 0
    async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
        for i, url in enumerate(sorted(urls)):
            try:
                r = await client.get(url)
                if len(r.content) < MIN_SIZE:
                    continue
                ct = r.headers.get("content-type", "image/jpeg")
                if "image" not in ct:
                    continue
                ext = ct.split("/")[-1].split(";")[0].strip().replace("jpeg", "jpg")
                if ext not in {"jpg", "png", "gif", "webp", "avif"}:
                    ext = "jpg"
                dest = IMAGES_DIR / f"img_{saved:04d}.{ext}"
                dest.write_bytes(r.content)
                saved += 1
                print(f"  [{saved}] saved {dest.name} ({len(r.content)//1024}KB)")
            except Exception as e:
                print(f"  [skip] {url[:70]}: {e}")
    return saved


async def main(query_or_url: str):
    url = make_url(query_or_url)
    print(f"Scraping: {url}")

    cookies = load_firefox_cookies()
    print(f"Loaded {len(cookies)} Firefox cookies")

    async with async_playwright() as p:
        browser = await p.firefox.launch(headless=False)
        ctx = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) "
                "Gecko/20100101 Firefox/137.0"
            )
        )
        if cookies:
            await ctx.add_cookies(cookies)

        page = await ctx.new_page()
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)

        urls = await collect_image_urls(page)
        await browser.close()

    print(f"\nFound {len(urls)} candidate image URLs")
    saved = await download(urls)
    print(f"Downloaded {saved} images to images/")
    build_html()


def build_html():
    images = sorted(
        p for p in IMAGES_DIR.rglob("*") if p.suffix.lower() in IMG_EXTS
    )
    if not images:
        print("No images to build gallery from.")
        return

    img_tags = "\n".join(
        f'    <img src="images/{p.name}" loading="lazy">'
        for p in images
    )

    html = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gallery</title>
  <style>
    body {{ margin: 0; background: #111; }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 4px;
      padding: 4px;
    }}
    img {{
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      display: block;
    }}
  </style>
</head>
<body>
  <div class="grid">
{img_tags}
  </div>
</body>
</html>
"""
    out = HERE / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"Built index.html with {len(images)} images")


if __name__ == "__main__":
    query = sys.argv[1] if len(sys.argv) > 1 else "تم تعبئة الكرش"
    asyncio.run(main(query))
