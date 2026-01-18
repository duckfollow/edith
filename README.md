# 🖤 EDITH

> **EDITH** is a local-first, open-source media platform.  
> Think **Google Photos + S3**, but running entirely on your own machine.

EDITH is a **desktop-installed web application** that lets you store, browse, and manage media files locally with a powerful API — no cloud required.

---

## ✨ Features

### 🖼 Google Photos–like Experience
- Fast media gallery (images & videos)
- Thumbnail & preview generation
- Grouping by date / type
- Virtualized scrolling for large libraries

### 📦 S3-Like Local Storage
- Bucket & object concept
- File CRUD API
- Presigned URLs
- Range request support (video streaming)

### 🔌 Developer Friendly
- REST API + OpenAPI (Swagger)
- JavaScript SDK
- Local-first & self-hosted
- Designed for extensibility

### 🖥 Desktop App
- Installable like Electron apps
- Runs fully offline
- Cross-platform (Windows / macOS / Linux)

---

## 🧠 Philosophy

- **Local-first** — your data stays on your machine
- **Open-source** — transparent & hackable
- **Composable** — usable as a platform, not just an app
- **Future-ready** — cloud, sync, and AI can be added later

---

## 🧱 Tech Stack

| Layer | Tech |
|-----|-----|
| Desktop | **Tauri** |
| Frontend | **Next.js + Tailwind + shadcn/ui** |
| Backend | **NestJS** |
| Database | **SQLite + Prisma** |
| Storage | Native File System (S3-like layout) |
| Media | sharp, ffmpeg |
| Search | Meilisearch (optional) |
| Monorepo | Turborepo |
| Language | TypeScript |

---

## 🗂 Project Structure

edith/
├─ apps/
│ ├─ desktop/ # Tauri desktop app
│ ├─ web/ # Next.js frontend
│ └─ api/ # NestJS local API
├─ packages/
│ ├─ sdk/ # JS SDK
│ └─ types/ # Shared types
└─ docs/


---

## 🚀 Roadmap

### Phase 0 — Foundation
- Vision & scope
- Open-source setup
- README & docs

### Phase 1 — Core Infrastructure
- Monorepo setup
- Local API
- Desktop integration

### Phase 2 — Storage System
- Bucket & object storage
- File CRUD API
- Metadata database

### Phase 3 — Media Processing
- Image thumbnails
- Video previews
- EXIF metadata

### Phase 4 — Gallery UI
- Grid gallery
- Preview modal
- Keyboard navigation

### Phase 5 — API Polish
- Swagger / OpenAPI
- Presigned URLs
- JS SDK

### Phase 6 — Security
- API tokens
- Read / write roles
- Local-only binding

### Phase 7 — Search & Tag
- Filename & metadata search
- Tag system
- Optional full-text search

### Phase 8 — Release
- Cross-platform builds
- Docs & examples
- `v0.1.0` release 🎉

---

## 🔮 Future Ideas

- Folder sync
- Remote access mode
- AI auto-tagging
- Mobile read-only client
- Plugin system

---

## 🛠 Development

> 🚧 EDITH is under active development.

```bash
# install dependencies
pnpm install

# start development
pnpm dev
