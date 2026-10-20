# IDE Website

A browser-based IDE website inspired by Online IDE Pro. Write, run, and preview JavaScript
directly in your browser, with an optional Node.js execution mode.

## Features

- Monaco-based code editor with syntax highlighting for many languages
- File explorer, tabs, create/rename/delete files and folders
- Run JavaScript in a sandboxed browser iframe (console + live preview)
- Optional Node.js execution via the included server
- Browser-only (static) build with localStorage workspace, import/export, reset
- Keyboard shortcuts: Ctrl+S save, Ctrl+Enter run

## Run locally

Full version (Node + browser):

```
https://ayushmaansinghchouhan8-creator.github.io/ide-website/
```

Browser-only (static) version:

```
https://ayushmaansinghchouhan8-creator.github.io/ide-website/
```

## Project layout

- `server.js` - Node backend + static server
- `public/` - editor UI for the server-backed version
- `web/` - fully static, browser-only version
- `workspace/` - starter files

