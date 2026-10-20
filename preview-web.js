"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PREVIEW_PORT || 4180);
const ROOT = path.join(__dirname, "web");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const abs = path.join(ROOT, rel);
  if (!abs.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(abs).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  web preview: http://127.0.0.1:${PORT}\n  serving: ${ROOT}\n`);
});
