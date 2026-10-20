"use strict";

(function () {
  const KEY = "jside.fs.v1";
  const ROOT_LABEL = "Stored in your browser";
  const MAX_FILE_BYTES = 2 * 1024 * 1024;

  const DEFAULTS = {
    "hello.js": [
      "console.log('Hello from the hosted js-ide!');",
      "console.log('Your files are saved in this browser (localStorage).');",
      "",
      "const nums = [1, 2, 3, 4, 5];",
      "const sum = nums.reduce((a, b) => a + b, 0);",
      "console.log('sum =', sum);",
      "",
      "setTimeout(() => console.log('async output still works'), 300);",
      ""
    ].join("\n"),
    "browser-demo.js": [
      "const h = document.createElement('h2');",
      "h.textContent = 'Browser-only code works here';",
      "document.body.appendChild(h);",
      "",
      "let clicks = 0;",
      "const b = document.createElement('button');",
      "b.textContent = 'Click me';",
      "b.addEventListener('click', () => {",
      "  clicks += 1;",
      "  const p = document.createElement('p');",
      "  p.textContent = 'Clicked ' + clicks + ' time' + (clicks === 1 ? '' : 's');",
      "  document.body.appendChild(p);",
      "  console.log('button clicked', clicks);",
      "});",
      "document.body.appendChild(b);",
      "",
      "console.log('viewport:', window.innerWidth + 'x' + window.innerHeight);",
      "console.warn('document, window, navigator all available');",
      ""
    ].join("\n"),
    "lib/math.js": [
      "export function add(a, b) {",
      "  return a + b;",
      "}",
      "",
      "export function factorial(n) {",
      "  let r = 1;",
      "  for (let i = 2; i <= n; i++) r *= i;",
      "  return r;",
      "}",
      ""
    ].join("\n")
  };

  function normalize(p) {
    return String(p || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  }

  function addParentDirs(dirs, filePath) {
    const parts = filePath.split("/");
    parts.pop();
    let acc = "";
    for (const p of parts) {
      acc = acc ? acc + "/" + p : p;
      if (!dirs.includes(acc)) dirs.push(acc);
    }
  }

  function seed() {
    const files = {};
    const dirs = [];
    for (const k of Object.keys(DEFAULTS)) {
      files[k] = DEFAULTS[k];
      addParentDirs(dirs, k);
    }
    return { files, dirs };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.files && typeof parsed.files === "object") {
          return { files: parsed.files, dirs: Array.isArray(parsed.dirs) ? parsed.dirs : [] };
        }
      }
    } catch (e) { /* ignore corrupt state */ }
    const fresh = seed();
    persist(fresh);
    return fresh;
  }

  let fs = load();

  function persist(state) {
    const target = state || fs;
    try {
      localStorage.setItem(KEY, JSON.stringify(target));
    } catch (e) {
      console.warn("js-ide: could not persist files:", e.message);
    }
  }

  function listDir(rel) {
    rel = normalize(rel);
    const prefix = rel ? rel + "/" : "";
    const dirNames = new Set();
    const fileNames = [];

    for (const d of fs.dirs) {
      if (d === rel || !d.startsWith(prefix)) continue;
      const name = d.slice(prefix.length).split("/")[0];
      if (name) dirNames.add(name);
    }
    for (const f of Object.keys(fs.files)) {
      if (!f.startsWith(prefix) && prefix) continue;
      const rest = f.slice(prefix.length);
      const name = rest.split("/")[0];
      if (!name) continue;
      if (rest.includes("/")) dirNames.add(name);
      else fileNames.push(name);
    }

    const entries = [];
    for (const name of dirNames) entries.push({ name, path: rel ? rel + "/" + name : name, dir: true });
    for (const name of fileNames) entries.push({ name, path: rel ? rel + "/" + name : name, dir: false });
    entries.sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return entries;
  }

  function writeFile(path, content) {
    path = normalize(path);
    fs.files[path] = String(content ?? "");
    addParentDirs(fs.dirs, path);
    persist();
  }

  function createFile(path) {
    path = normalize(path);
    if (fs.files[path] === undefined) {
      if (fs.dirs.includes(path)) throw new Error("A folder with that name already exists");
      fs.files[path] = "";
    }
    addParentDirs(fs.dirs, path);
    persist();
  }

  function createDir(path) {
    path = normalize(path);
    if (fs.files[path] !== undefined) throw new Error("A file with that name already exists");
    if (!fs.dirs.includes(path)) fs.dirs.push(path);
    addParentDirs(fs.dirs, path + "/x");
    persist();
  }

  function rename(from, to) {
    from = normalize(from);
    to = normalize(to);
    if (!from || !to) throw new Error("Invalid name");
    if (fs.files[to] !== undefined || fs.dirs.includes(to)) throw new Error("Target already exists");

    if (fs.files[from] !== undefined) {
      fs.files[to] = fs.files[from];
      delete fs.files[from];
    }
    for (const key of Object.keys(fs.files)) {
      if (key.startsWith(from + "/")) {
        fs.files[to + key.slice(from.length)] = fs.files[key];
        delete fs.files[key];
      }
    }
    fs.dirs = fs.dirs.map((d) => {
      if (d === from) return to;
      if (d.startsWith(from + "/")) return to + d.slice(from.length);
      return d;
    });
    addParentDirs(fs.dirs, to + "/x");
    persist();
  }

  function remove(path) {
    path = normalize(path);
    delete fs.files[path];
    for (const key of Object.keys(fs.files)) {
      if (key.startsWith(path + "/")) delete fs.files[key];
    }
    fs.dirs = fs.dirs.filter((d) => d !== path && !d.startsWith(path + "/"));
    persist();
  }

  function exportProject() {
    const payload = { name: "js-ide-project", exportedAt: new Date().toISOString(), files: fs.files, dirs: fs.dirs };
    download("js-ide-project.json", JSON.stringify(payload, null, 2), "application/json");
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importFiles(fileList, baseDir) {
    let count = 0;
    for (const file of fileList) {
      if (file.size > MAX_FILE_BYTES) continue;
      const rel = file.webkitRelativePath || file.name;
      const target = normalize(baseDir ? baseDir + "/" + rel : rel);
      const text = await file.text();
      writeFile(target, text);
      count += 1;
    }
    return count;
  }

  function jsonRes(status, obj) {
    return Promise.resolve(new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" }
    }));
  }

  async function handleApi(url, init) {
    const u = new URL(url, location.origin);
    const route = u.pathname;
    const method = (init && init.method) || "GET";
    let body = {};
    if (init && init.body) {
      try { body = JSON.parse(init.body); } catch (e) { return jsonRes(400, { error: "Invalid JSON" }); }
    }

    try {
      if (route === "/api/root" && method === "GET") {
        return jsonRes(200, { root: ROOT_LABEL });
      }
      if (route === "/api/open" && method === "POST") {
        return jsonRes(200, { root: ROOT_LABEL });
      }
      if (route === "/api/tree" && method === "GET") {
        const rel = u.searchParams.get("path") || "";
        return jsonRes(200, { path: rel, entries: listDir(rel) });
      }
      if (route === "/api/file" && method === "GET") {
        const p = normalize(u.searchParams.get("path"));
        if (fs.files[p] === undefined) return jsonRes(404, { error: "File not found" });
        return jsonRes(200, { path: p, content: fs.files[p] });
      }
      if (route === "/api/file" && method === "POST") {
        if (!body.path) return jsonRes(400, { error: "Missing path" });
        writeFile(body.path, body.content ?? "");
        return jsonRes(200, { ok: true, path: normalize(body.path) });
      }
      if (route === "/api/create" && method === "POST") {
        if (!body.path) return jsonRes(400, { error: "Missing path" });
        if (body.dir) createDir(body.path);
        else createFile(body.path);
        return jsonRes(200, { ok: true, path: normalize(body.path) });
      }
      if (route === "/api/rename" && method === "POST") {
        if (!body.path || !body.to) return jsonRes(400, { error: "Missing path or to" });
        rename(body.path, body.to);
        return jsonRes(200, { ok: true, path: normalize(body.to) });
      }
      if (route === "/api/delete" && method === "POST") {
        if (!body.path) return jsonRes(400, { error: "Missing path" });
        remove(body.path);
        return jsonRes(200, { ok: true, path: normalize(body.path) });
      }
      if (route === "/api/run" && method === "POST") {
        return jsonRes(200, {
          stdout: "",
          stderr: "Node execution is not available in the hosted version. Switch the Run mode to Browser.",
          code: null
        });
      }
      return jsonRes(404, { error: "Unknown route " + route });
    } catch (err) {
      return jsonRes(400, { error: String((err && err.message) || err) });
    }
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    if (url && url.startsWith("/api/")) return handleApi(url, init);
    return realFetch(input, init);
  };

  window.__jsideVFS = {
    exportProject,
    importFiles,
    download,
    reset() { fs = seed(); persist(); },
    files() { return fs.files; }
  };

  function wireWebExtras() {
    const modeSelect = document.getElementById("runMode");
    if (modeSelect) {
      [...modeSelect.options].forEach((o) => { if (o.value === "node") o.remove(); });
      modeSelect.value = "browser";
      localStorage.setItem("jside.runMode", "browser");
    }

    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) exportBtn.addEventListener("click", () => window.__jsideVFS.exportProject());

    const importBtn = document.getElementById("importBtn");
    const importInput = document.getElementById("importInput");
    if (importBtn && importInput) {
      importBtn.addEventListener("click", () => importInput.click());
      importInput.addEventListener("change", async () => {
        if (!importInput.files || !importInput.files.length) return;
        const n = await window.__jsideVFS.importFiles(importInput.files, "");
        importInput.value = "";
        const refresh = document.getElementById("refreshBtn");
        if (refresh) refresh.click();
        console.log("Imported " + n + " file(s) into the browser workspace.");
      });
    }

    const resetBtn = document.getElementById("resetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (!confirm("Reset the browser workspace to the starter files? Your current files will be erased.")) return;
        window.__jsideVFS.reset();
        const refresh = document.getElementById("refreshBtn");
        if (refresh) refresh.click();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireWebExtras);
  } else {
    wireWebExtras();
  }
})();
