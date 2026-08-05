# Config example

Full configuration reference for [frame-master-plugin-inline-css](https://github.com/shpaw415/frame-master-plugin-inline-css).

### 1. Configure the plugin (`frame-master.config.ts`)

```typescript
import type { FrameMasterConfig } from "frame-master/server/types";
import InlineCss from "frame-master-plugin-inline-css";
import { join } from "node:path";

export default {
  HTTPServer: { port: 3000 },
  plugins: [
    InlineCss({
      // Fetch and inline http(s) stylesheets (Google Fonts, CDNs, …).
      // Default: true
      inlineRemote: true,

      // Disk cache for remote CSS (written in every env; preferred in non-production).
      // Default: ".frame-master/cache/remote-css"
      cacheDir: ".frame-master/cache/remote-css",

      // Prefer cached remote CSS when present.
      // Default: true when NODE_ENV !== "production", else false
      preferCache: process.env.NODE_ENV !== "production",

      // Extra roots for root-relative paths like `/assets/app.css`
      // (resolved under these dirs, not the OS filesystem root).
      // Default: [process.cwd(), dirname(htmlPath)]
      resolveRoots: [process.cwd(), join(process.cwd(), "public")],

      // User-Agent sent when fetching remote stylesheets.
      // Default: plugin UA string
      userAgent:
        "Mozilla/5.0 (compatible; frame-master-plugin-inline-css/0.1)",

      // Warning logger for missing local files / failed remote fetches.
      // Default: console.warn
      warn: (message) => console.warn("[inline-css]", message),
    }),
  ],
} satisfies FrameMasterConfig;
```

### 2. Options summary

| Option         | Type                      | Default                                 | Description                                            |
| -------------- | ------------------------- | --------------------------------------- | ------------------------------------------------------ |
| `inlineRemote` | `boolean`                 | `true`                                  | Fetch and inline `http(s)` stylesheets.                |
| `cacheDir`     | `string`                  | `.frame-master/cache/remote-css`        | Disk cache for remote CSS.                             |
| `preferCache`  | `boolean`                 | `true` when `NODE_ENV !== "production"` | Use cached remote CSS when present.                    |
| `resolveRoots` | `string[]`                | `[cwd, htmlDir]`                        | Roots for root-relative paths (`/assets/x.css`).       |
| `userAgent`    | `string`                  | plugin UA                               | User-Agent for remote fetches.                         |
| `warn`         | `(message: string) => void` | `console.warn`                        | Logger for missing files / fetch errors.               |

Unresolved links (missing file / failed fetch with no cache) are left unchanged.

### 3. Local-only inlining (no remote fetch)

```typescript
InlineCss({
  inlineRemote: false,
});
```

Remote `<link rel="stylesheet" href="https://…">` tags stay as links; local CSS still inlines.

### 4. Root-relative CSS paths

HTML:

```html
<link rel="stylesheet" href="/static/style.css" />
```

Config (ensure `/static/…` resolves under your project, not `/static` on disk):

```typescript
InlineCss({
  resolveRoots: [process.cwd()],
});
```

### 5. Per-tag opt-out

```html
<!-- stays external -->
<link rel="stylesheet" href="./static/deferred.css" data-no-inline-css />

<!-- still inlined -->
<link rel="stylesheet" href="./static/critical.css" />
<link rel="stylesheet" href="/assets/theme.css" />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Inter"
/>
```

`data-no-inline-css` is presence-only (value is ignored).

### 6. What the build rewrites to

**Before**

```html
<link rel="stylesheet" href="./static/style.css" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto" />
```

**After**

```html
<style data-inline-css data-href="./static/style.css">
  /* file contents */
</style>
<style
  data-inline-css
  data-href="https://fonts.googleapis.com/css2?family=Roboto"
>
  /* fetched css */
</style>
```

Original CSS files on disk are **kept** for other plugins and tooling.
