# EDITH branding

The application mark is an original vector illustration of smart glasses: a flat graphite tile (`#1b2228`), thick mint frames (`#72d7b8`), rounded line ends, and pale mint lens highlights (`#b0f0db`). It shares Dum-E’s simple line style and tile shape (`rx=112` on a 512 px canvas), with a distinct EDITH color palette. The upper brow bar is omitted for a cleaner silhouette. The concept takes inspiration from the smart glasses described in the [E.D.I.T.H. reference](https://marvelcinematicuniverse.fandom.com/wiki/E.D.I.T.H.). No downloaded movie artwork is included.

## Sources

- `apps/desktop/public/brand/edith-mark.svg`: scalable desktop / sidebar / login mark.
- `apps/desktop/public/brand/edith-favicon.svg`: simplified small-size variant.
- `scripts/generate-brand-icons.mjs`: reproducible PNG, ICO, ICNS, and Windows tile generation.

Regenerate from the repository root:

```sh
npm ci
npm run icons:generate --workspace appsdesktop
npm run build:web
```

The generator uses Sharp to rasterize the SVG sources and Tauri's icon generator for native assets. It updates the desktop icon set and a 16/32/48/64 px PNG-frame favicon ICO, without adding mobile projects. The HTML includes SVG and PNG/ICO fallbacks; the existing raster fallback URLs have a new cache key.

## Desktop appearance

The native app and development Dock icon load `src-tauri/icons/icon.icns`. Rebuild and restart the native app after regenerating icons:

```sh
npm run dev:desktop
# Or create a packaged application:
npm run build --workspace appsdesktop -- --bundles app
```

An already installed application contains its previous icon until it is replaced with a newly built bundle. Sidebar and login mark changes are included in the frontend build. User avatars and the text-only EDITH loading animation remain separate UI elements.
