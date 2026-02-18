import http from "http";
import path from "path";
import { createReadStream, statSync } from "fs";
import { readdir } from "fs/promises";

const PORT = process.env.PORT ?? 8000;
const ROOT = new URL(".", import.meta.url).pathname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

http
  .createServer((req, res) => {
    let file = req.url === "/" ? "/index.html" : req.url;
    const abs = path.join(ROOT, file);
    const ext = path.extname(abs);
    try {
      const stat = statSync(abs);
      if (!stat.isFile()) throw new Error("not a file");
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      createReadStream(abs).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(PORT, () => console.log(`Serving on port ${PORT}`));
