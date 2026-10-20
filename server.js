"use strict";

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.JSIDE_PORT || 4173);
const HOST = process.env.JSIDE_HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_ROOT = process.env.JSIDE_ROOT
  ? path.resolve(process.env.JSIDE_ROOT)
  : path.join(__dirname, "workspace");

const RUN_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const IGNORED_DIRS = new Set(["node_modules", ".git", ".vscode", "dist", "build", ".cache"]);

let currentRoot = DEFAULT_ROOT;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

async function ensureDir(dir) {
  try {
    await fsp.mkdir(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function safeJoin(relPath) {
  const clean = String(relPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const target = path.resolve(currentRoot, clean);
  const rootWithSep = currentRoot.endsWith(path.sep) ? currentRoot : currentRoot + path.sep;
  if (target !== currentRoot && !target.startsWith(rootWithSep)) {
    throw new Error("Path escapes workspace root");
  }
  return target;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function listDir(relPath) {
  const abs = safeJoin(relPath);
  const stat = await fsp.stat(abs);
  if (!stat.isDirectory()) throw new Error("Not a directory");
  const dirents = await fsp.readdir(abs, { withFileTypes: true });
  const entries = [];
  for (const d of dirents) {
    if (d.isDirectory() && IGNORED_DIRS.has(d.name)) continue;
    if (d.name === ".DS_Store") continue;
    entries.push({
      name: d.name,
      path: toPosix(path.relative(currentRoot, path.join(abs, d.name))),
      dir: d.isDirectory()
    });
  }
  entries.sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return entries;
}

function runNode(fileRelPath) {
  return new Promise((resolve) => {
    let abs;
    try {
      abs = safeJoin(fileRelPath);
    } catch (err) {
      resolve({ stdout: "", stderr: err.message, code: null });
      return;
    }
    const cwd = path.dirname(abs);
    let child;
    try {
      child = spawn(process.execPath, [abs], {
        cwd,
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: "0" }
      });
    } catch (err) {
      resolve({ stdout: "", stderr: String(err && err.message ? err.message : err), code: null });
      return;
    }

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        stderr += `\n[js-ide] Process timed out after ${RUN_TIMEOUT_MS / 1000}s and was killed.\n`;
        child.kill();
      }
    }, RUN_TIMEOUT_MS);

    child.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    child.on("error", (err) => {
      finished = true;
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(err.message || err), code: null });
    });
    child.on("close", (code) => {
      finished = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (req.method === "GET" && route === "/api/root") {
    return sendJson(res, 200, { root: currentRoot });
  }

  if (req.method === "POST" && route === "/api/open") {
    const body = await parseJsonBody(req);
    const target = path.resolve(String(body.path || ""));
    let stat;
    try {
      stat = await fsp.stat(target);
    } catch {
      return sendError(res, 400, "Folder not found: " + target);
    }
    if (!stat.isDirectory()) return sendError(res, 400, "Not a folder");
    currentRoot = target;
    return sendJson(res, 200, { root: currentRoot });
  }

  if (req.method === "GET" && route === "/api/tree") {
    const rel = url.searchParams.get("path") || "";
    try {
      return sendJson(res, 200, { path: rel, entries: await listDir(rel) });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  if (req.method === "GET" && route === "/api/file") {
    const rel = url.searchParams.get("path");
    if (!rel) return sendError(res, 400, "Missing path");
    try {
      const abs = safeJoin(rel);
      const content = await fsp.readFile(abs, "utf8");
      return sendJson(res, 200, { path: rel, content });
    } catch (err) {
      return sendError(res, 404, err.code === "ENOENT" ? "File not found" : err.message);
    }
  }

  if (req.method === "POST" && route === "/api/file") {
    const body = await parseJsonBody(req);
    if (!body.path) return sendError(res, 400, "Missing path");
    try {
      const abs = safeJoin(body.path);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, String(body.content ?? ""), "utf8");
      return sendJson(res, 200, { ok: true, path: body.path });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  if (req.method === "POST" && route === "/api/create") {
    const body = await parseJsonBody(req);
    if (!body.path) return sendError(res, 400, "Missing path");
    try {
      const abs = safeJoin(body.path);
      if (body.dir) {
        await fsp.mkdir(abs, { recursive: true });
      } else {
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        await fsp.writeFile(abs, "", { flag: "wx" });
      }
      return sendJson(res, 200, { ok: true, path: body.path });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  if (req.method === "POST" && route === "/api/rename") {
    const body = await parseJsonBody(req);
    if (!body.path || !body.to) return sendError(res, 400, "Missing path or to");
    try {
      const from = safeJoin(body.path);
      const to = safeJoin(body.to);
      await fsp.mkdir(path.dirname(to), { recursive: true });
      await fsp.rename(from, to);
      return sendJson(res, 200, { ok: true, path: body.to });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  if (req.method === "POST" && route === "/api/delete") {
    const body = await parseJsonBody(req);
    if (!body.path) return sendError(res, 400, "Missing path");
    try {
      const abs = safeJoin(body.path);
      if (abs === currentRoot) return sendError(res, 400, "Refusing to delete workspace root");
      await fsp.rm(abs, { recursive: true, force: true });
      return sendJson(res, 200, { ok: true, path: body.path });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  if (req.method === "POST" && route === "/api/run") {
    const body = await parseJsonBody(req);
    if (!body.path) return sendError(res, 400, "Missing path");
    const result = await runNode(body.path);
    return sendJson(res, 200, result);
  }

  return sendError(res, 404, "Unknown API route: " + route);
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const abs = path.join(PUBLIC_DIR, rel);
  if (!abs.startsWith(PUBLIC_DIR)) return sendError(res, 403, "Forbidden");
  try {
    const data = await fsp.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": data.length
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== "GET") return sendError(res, 405, "Method not allowed");
    await serveStatic(req, res, url);
  } catch (err) {
    if (!res.headersSent) sendError(res, 500, err.message || "Server error");
    else res.end();
  }
});

(async () => {
  await ensureDir(currentRoot);
  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`\n  js-ide running at ${url}`);
    console.log(`  workspace: ${currentRoot}\n`);
    console.log("  Press Ctrl+C to stop.\n");
  });
})();

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
