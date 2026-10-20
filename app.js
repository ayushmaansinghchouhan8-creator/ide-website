"use strict";

const LANG_BY_EXT = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  css: "css",
  scss: "scss",
  html: "html",
  htm: "html",
  md: "markdown",
  txt: "plaintext",
  yml: "yaml",
  yaml: "yaml"
};

const ICONS = {
  dir: "\u{1F4C1}",
  js: "\u{1F4DC}",
  json: "\u{2699}\u{FE0F}",
  css: "\u{1F3A8}",
  html: "\u{1F310}",
  md: "\u{1F4DD}",
  txt: "\u{1F4C4}",
  default: "\u{1F4C4}"
};

const state = {
  editor: null,
  root: "",
  open: new Map(),
  active: null,
  selected: null,
  selectedIsDir: false
};

const el = {
  tree: document.getElementById("tree"),
  tabs: document.getElementById("tabs"),
  editor: document.getElementById("editor"),
  welcome: document.getElementById("welcome"),
  consoleOut: document.getElementById("consoleOut"),
  consolePanel: document.getElementById("consolePanel"),
  runStatus: document.getElementById("runStatus"),
  rootInput: document.getElementById("rootInput"),
  runMode: document.getElementById("runMode"),
  browserPreview: document.getElementById("browserPreview"),
  previewFrame: document.getElementById("previewFrame"),
  toast: document.getElementById("toast")
};

function iconFor(name, isDir) {
  if (isDir) return ICONS.dir;
  const ext = name.split(".").pop().toLowerCase();
  return ICONS[ext] || ICONS.default;
}

function toast(msg, isError) {
  el.toast.textContent = msg;
  el.toast.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.toast.className = "toast"; }, 2600);
}

async function api(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function consoleClear() {
  el.consoleOut.innerHTML = "";
}

function consoleWrite(text, cls) {
  if (cls) {
    const span = document.createElement("span");
    span.className = cls;
    span.textContent = text;
    el.consoleOut.appendChild(span);
  } else {
    el.consoleOut.appendChild(document.createTextNode(text));
  }
  el.consoleOut.scrollTop = el.consoleOut.scrollHeight;
}

function setStatus(text, cls) {
  el.runStatus.textContent = text || "";
  el.runStatus.className = "status" + (cls ? " " + cls : "");
}

function updateRunButtonLabel() {
  const mode = el.runMode.value;
  const btn = document.getElementById("runBtn");
  btn.title = mode === "browser"
    ? "Save & run the active file in the browser (Ctrl+Enter)"
    : "Save & run the active file with Node (Ctrl+Enter)";
}

function languageFor(path) {
  const ext = path.split(".").pop().toLowerCase();
  return LANG_BY_EXT[ext] || "plaintext";
}

async function loadRoot() {
  const { root } = await api("/api/root");
  state.root = root;
  el.rootInput.value = root;
  await refreshTree();
}

async function refreshTree() {
  el.tree.innerHTML = "";
  try {
    await renderDir("", el.tree, 0);
  } catch (err) {
    toast(err.message, true);
  }
}

function makeNode(name, relPath, isDir, depth) {
  const node = document.createElement("div");
  node.className = "node" + (isDir ? "" : " dim");
  node.dataset.path = relPath;
  node.dataset.dir = String(isDir);
  node.style.paddingLeft = 8 + depth * 14 + "px";

  const caret = document.createElement("span");
  caret.className = "caret";
  caret.textContent = isDir ? "\u25B8" : "";
  node.appendChild(caret);

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = iconFor(name, isDir);
  node.appendChild(icon);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = name;
  node.appendChild(label);

  return node;
}

async function renderDir(relPath, container, depth) {
  const { entries } = await api("/api/tree?path=" + encodeURIComponent(relPath));
  for (const entry of entries) {
    const node = makeNode(entry.name, entry.path, entry.dir, depth);
    container.appendChild(node);

    if (entry.dir) {
      let childBox = null;
      let expanded = false;
      node.addEventListener("click", async (e) => {
        e.stopPropagation();
        selectNode(node, true);
        if (!expanded) {
          childBox = document.createElement("div");
          node.after(childBox);
          try {
            await renderDir(entry.path, childBox, depth + 1);
          } catch (err) {
            toast(err.message, true);
          }
          expanded = true;
          node.querySelector(".caret").textContent = "\u25BE";
        } else {
          childBox.style.display = childBox.style.display === "none" ? "" : "none";
          node.querySelector(".caret").textContent = childBox.style.display === "none" ? "\u25B8" : "\u25BE";
        }
      });
      node.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectNode(node, true);
        showContextMenu(e.clientX, e.clientY, entry.path, true);
      });
    } else {
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        selectNode(node, false);
        openFile(entry.path);
      });
      node.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectNode(node, false);
        showContextMenu(e.clientX, e.clientY, entry.path, false);
      });
    }
  }
}

function selectNode(node, isDir) {
  document.querySelectorAll(".node.selected").forEach((n) => n.classList.remove("selected"));
  node.classList.add("selected");
  state.selected = node.dataset.path;
  state.selectedIsDir = isDir;
}

function baseDirForCreate() {
  if (!state.selected) return "";
  if (state.selectedIsDir) return state.selected;
  const idx = state.selected.lastIndexOf("/");
  return idx === -1 ? "" : state.selected.slice(0, idx);
}

function joinPath(base, name) {
  return base ? base + "/" + name : name;
}

function showContextMenu(x, y, relPath, isDir) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.id = "ctxMenu";
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:#2d2d30;border:1px solid #3c3c3c;border-radius:4px;padding:4px;z-index:200;box-shadow:0 6px 20px #000a;min-width:140px;font-size:12px;`;

  const items = [
    { label: "New File", fn: () => createEntry(false) },
    { label: "New Folder", fn: () => createEntry(true) },
    { sep: true },
    { label: "Rename", fn: () => renameEntry(relPath, isDir) },
    { label: "Delete", fn: () => deleteEntry(relPath, isDir), danger: true }
  ];

  for (const item of items) {
    if (item.sep) {
      const hr = document.createElement("div");
      hr.style.cssText = "height:1px;background:#3c3c3c;margin:4px 0;";
      menu.appendChild(hr);
      continue;
    }
    const btn = document.createElement("div");
    btn.textContent = item.label;
    btn.style.cssText = `padding:6px 10px;border-radius:3px;cursor:pointer;color:${item.danger ? "#f48771" : "#d4d4d4"};`;
    btn.addEventListener("mouseenter", () => { btn.style.background = "#ffffff15"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
    btn.addEventListener("click", () => { closeContextMenu(); item.fn(); });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener("click", closeContextMenu, { once: true }), 0);
}

function closeContextMenu() {
  const m = document.getElementById("ctxMenu");
  if (m) m.remove();
}

function showPrompt(title, initial) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `<h3></h3>`;
    modal.querySelector("h3").textContent = title;

    const input = document.createElement("input");
    input.spellcheck = false;
    input.value = initial || "";
    modal.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    const ok = document.createElement("button");
    ok.className = "btn btn-run";
    ok.textContent = "OK";
    actions.appendChild(cancel);
    actions.appendChild(ok);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    input.focus();
    input.select();

    const done = (val) => { backdrop.remove(); resolve(val); };
    cancel.addEventListener("click", () => done(null));
    ok.addEventListener("click", () => done(input.value.trim() || null));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done(input.value.trim() || null);
      if (e.key === "Escape") done(null);
    });
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) done(null); });
  });
}

async function createEntry(isDir) {
  const name = await showPrompt(isDir ? "New folder name" : "New file name", isDir ? "new-folder" : "script.js");
  if (!name) return;
  const rel = joinPath(baseDirForCreate(), name);
  try {
    await api("/api/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: rel, dir: isDir })
    });
    await refreshTree();
    if (!isDir) openFile(rel);
    toast("Created " + rel);
  } catch (err) {
    toast(err.message, true);
  }
}

async function renameEntry(relPath, isDir) {
  const current = relPath.split("/").pop();
  const name = await showPrompt("Rename to", current);
  if (!name || name === current) return;
  const dir = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
  const to = joinPath(dir, name);
  try {
    await api("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: relPath, to })
    });
    await refreshTree();
    toast("Renamed to " + to);
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteEntry(relPath, isDir) {
  const name = relPath.split("/").pop();
  const ok = await showPrompt(`Delete "${name}"? Type the name to confirm.`, "");
  if (ok !== name) {
    if (ok !== null) toast("Names did not match. Nothing deleted.", true);
    return;
  }
  try {
    await api("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: relPath })
    });
    closeFile(relPath);
    await refreshTree();
    toast("Deleted " + relPath);
  } catch (err) {
    toast(err.message, true);
  }
}

async function openFile(relPath) {
  el.welcome.classList.add("hidden");
  if (state.open.has(relPath)) {
    activate(relPath);
    return;
  }
  try {
    const { content } = await api("/api/file?path=" + encodeURIComponent(relPath));
    const model = monaco.editor.createModel(content, languageFor(relPath));
    const name = relPath.split("/").pop();
    const entry = { path: relPath, name, model, dirty: false, viewState: null };
    model.onDidChangeContent(() => {
      if (!entry.dirty) {
        entry.dirty = true;
        renderTabs();
      }
    });
    state.open.set(relPath, entry);
    renderTabs();
    activate(relPath);
  } catch (err) {
    toast(err.message, true);
  }
}

function activate(relPath) {
  const entry = state.open.get(relPath);
  if (!entry) return;
  if (state.active && state.open.has(state.active)) {
    state.open.get(state.active).viewState = state.editor.saveViewState();
  }
  state.active = relPath;
  state.editor.setModel(entry.model);
  if (entry.viewState) state.editor.restoreViewState(entry.viewState);
  state.editor.focus();
  renderTabs();
}

function closeFile(relPath) {
  const entry = state.open.get(relPath);
  if (entry) {
    entry.model.dispose();
    state.open.delete(relPath);
  }
  if (state.active === relPath) {
    const next = [...state.open.keys()].pop();
    state.active = null;
    if (next) activate(next);
    else {
      state.editor.setModel(null);
      el.welcome.classList.remove("hidden");
    }
  }
  renderTabs();
}

function renderTabs() {
  el.tabs.innerHTML = "";
  for (const [relPath, entry] of state.open) {
    const tab = document.createElement("div");
    tab.className = "tab" + (relPath === state.active ? " active" : "") + (entry.dirty ? " dirty" : "");

    const dot = document.createElement("span");
    dot.className = "dot";
    tab.appendChild(dot);

    const label = document.createElement("span");
    label.textContent = entry.name;
    tab.appendChild(label);

    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "\u00D7";
    close.title = "Close";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      if (entry.dirty && !confirm(`"${entry.name}" has unsaved changes. Close anyway?`)) return;
      closeFile(relPath);
    });
    tab.appendChild(close);

    tab.addEventListener("click", () => activate(relPath));
    el.tabs.appendChild(tab);
  }
}

async function saveActive() {
  const entry = state.open.get(state.active);
  if (!entry) {
    toast("No file open", true);
    return false;
  }
  try {
    await api("/api/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: entry.path, content: entry.model.getValue() })
    });
    entry.dirty = false;
    renderTabs();
    toast("Saved " + entry.name);
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}

async function runActive() {
  const entry = state.open.get(state.active);
  if (!entry) {
    toast("Open a .js file first", true);
    return;
  }
  if (entry.dirty) {
    const saved = await saveActive();
    if (!saved) return;
  }
  const mode = el.runMode.value;
  if (mode === "browser") runInBrowser(entry);
  else runInNode(entry);
}

async function runInNode(entry) {
  el.browserPreview.classList.add("hidden");
  consoleClear();
  setStatus("Running\u2026", "running");
  consoleWrite("$ node " + entry.path + "\n", "meta");
  try {
    const result = await api("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: entry.path })
    });
    if (result.stdout) consoleWrite(result.stdout);
    if (result.stderr) consoleWrite(result.stderr, "stderr");
    if (!result.stdout && !result.stderr) consoleWrite("[no output]\n", "muted");
    const code = result.code;
    if (code === 0) {
      setStatus("Exited 0", "ok");
      consoleWrite("\n\u2713 process exited with code 0\n", "meta");
    } else if (code === null || code === undefined) {
      setStatus("Failed", "err");
      consoleWrite("\n\u2717 process failed to run\n", "stderr");
    } else {
      setStatus("Exited " + code, "err");
      consoleWrite(`\n\u2717 process exited with code ${code}\n`, "stderr");
    }
  } catch (err) {
    setStatus("Error", "err");
    consoleWrite(err.message + "\n", "stderr");
  }
}

function serializeLogArg(value) {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "function") return value.toString();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value instanceof Error) return value.stack || (value.name + ": " + value.message);
  try {
    return JSON.stringify(value, (k, v) => (typeof v === "function" ? String(v) : v));
  } catch {
    return String(value);
  }
}

function escapeClosingScript(code) {
  return code.replace(/<\/script/gi, "<\\/script");
}

function buildBrowserDoc(code) {
  const shim = [
    "(function(){",
    "  var send=function(type,args){ try{ parent.postMessage({__jside:true,type:'console',level:type,args:args},'*'); }catch(e){} };",
    "  var fmt=function(v){",
    "    if(typeof v==='string') return v;",
    "    if(v===undefined) return 'undefined';",
    "    if(v===null) return 'null';",
    "    if(typeof v==='function') return v.toString();",
    "    if(v instanceof Error) return v.stack||(v.name+': '+v.message);",
    "    try{ return JSON.stringify(v,function(k,val){return typeof val==='function'?String(val):val;}); }catch(e){ return String(v); }",
    "  };",
    "  ['log','info','warn','error','debug'].forEach(function(m){",
    "    var orig=console[m];",
    "    console[m]=function(){ send(m, Array.prototype.map.call(arguments, fmt)); if(orig) try{orig.apply(console,arguments);}catch(e){} };",
    "  });",
    "  window.onerror=function(msg,src,line,col){ send('error',[msg+(line?('  (line '+line+')'):'')]); return true; };",
    "  window.addEventListener('unhandledrejection',function(e){ var r=e.reason; send('error',['Unhandled promise rejection: '+((r&&r.message)||r)]); });",
    "})();"
  ].join("\n");

  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><style>body{font-family:Segoe UI,system-ui,sans-serif;color:#1e1e1e;background:#fff;margin:8px;}</style></head><body>"
    + "<script>" + shim + "</" + "script>"
    + "<script>" + escapeClosingScript(code) + "</" + "script>"
    + "</body></html>";
}

function runInBrowser(entry) {
  consoleClear();
  setStatus("Running in browser\u2026", "running");
  el.browserPreview.classList.remove("hidden");
  el.consolePanel.classList.remove("collapsed");
  consoleWrite("$ browser: " + entry.path + "\n", "meta");
  el.previewFrame.srcdoc = buildBrowserDoc(entry.model.getValue());
}

function onPreviewMessage(event) {
  const data = event.data;
  if (!data || data.__jside !== true || data.type !== "console") return;
  const text = Array.isArray(data.args) ? data.args.join(" ") : String(data.args);
  if (data.level === "error") {
    setStatus("Runtime error", "err");
    consoleWrite(text + "\n", "stderr");
  } else if (data.level === "warn") {
    consoleWrite(text + "\n", "warn");
  } else {
    consoleWrite(text + "\n");
  }
}

function bindToolbar() {
  document.getElementById("runBtn").addEventListener("click", runActive);
  document.getElementById("saveBtn").addEventListener("click", saveActive);
  document.getElementById("refreshBtn").addEventListener("click", refreshTree);
  document.getElementById("newFileBtn").addEventListener("click", () => createEntry(false));
  document.getElementById("newFolderBtn").addEventListener("click", () => createEntry(true));
  document.getElementById("clearConsoleBtn").addEventListener("click", consoleClear);
  document.getElementById("toggleConsoleBtn").addEventListener("click", () => {
    el.consolePanel.classList.toggle("collapsed");
  });
  document.getElementById("reloadPreviewBtn").addEventListener("click", () => {
    if (el.runMode.value === "browser") runActive();
  });
  document.getElementById("closePreviewBtn").addEventListener("click", () => {
    el.browserPreview.classList.add("hidden");
  });

  const savedMode = localStorage.getItem("jside.runMode");
  if (savedMode === "node" || savedMode === "browser") el.runMode.value = savedMode;
  el.runMode.addEventListener("change", () => {
    localStorage.setItem("jside.runMode", el.runMode.value);
    updateRunButtonLabel();
  });
  updateRunButtonLabel();

  document.getElementById("openBtn").addEventListener("click", async () => {
    const p = el.rootInput.value.trim();
    if (!p) return;
    try {
      const { root } = await api("/api/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p })
      });
      state.root = root;
      el.rootInput.value = root;
      state.open.forEach((entry) => entry.model.dispose());
      state.open.clear();
      state.active = null;
      state.editor.setModel(null);
      el.welcome.classList.remove("hidden");
      renderTabs();
      await refreshTree();
      toast("Opened " + root);
    } catch (err) {
      toast(err.message, true);
    }
  });

  el.rootInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("openBtn").click();
  });
}

function bindShortcuts() {
  window.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveActive();
    } else if (ctrl && e.key === "Enter") {
      e.preventDefault();
      runActive();
    } else if (ctrl && e.key.toLowerCase() === "b") {
      e.preventDefault();
      el.consolePanel.classList.toggle("collapsed");
    }
  });
}

function boot() {
  require.config({
    paths: { vs: "vs" }
  });
  require(["vs/editor/editor.main"], async () => {
    state.editor = monaco.editor.create(el.editor, {
      value: "",
      theme: "vs-dark",
      automaticLayout: true,
      fontSize: 14,
      fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      padding: { top: 10 }
    });
    bindToolbar();
    bindShortcuts();
    window.addEventListener("message", onPreviewMessage);
    setStatus("");
    try {
      await loadRoot();
    } catch (err) {
      toast("Could not load workspace: " + err.message, true);
    }
  });
}

if (window.require) boot();
else window.addEventListener("load", boot);
