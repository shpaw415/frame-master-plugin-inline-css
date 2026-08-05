# frame-master-plugin-inline-css

A [Frame-Master](https://github.com/shpaw415/frame-master) plugin that inlines CSS from `<link rel="stylesheet">` into `<style>` tags during the build **`finally("html")`** hook.

This removes FOUC / style flicker caused by waiting on stylesheet loads on first paint.

## Installation

```bash
bun add frame-master-plugin-inline-css
```

## Usage

```ts
// frame-master.config.ts
import InlineCss from "frame-master-plugin-inline-css";

export default {
  plugins: [
    InlineCss({
      // optional
      inlineRemote: true,
      cacheDir: ".frame-master/cache/remote-css",
    }),
  ],
};
```

### Before

```tsx
<link rel="stylesheet" href="./static/style.css" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto" />
```

### After

```tsx
<style data-inline-css data-href="./static/style.css">/* file contents */</style>
<style data-inline-css data-href="https://fonts.googleapis.com/css2?family=Roboto">/* fetched css */</style>
```

Original CSS files on disk are **kept** so other plugins and tooling can still inspect them.

### Opt out per link

Add **`data-no-inline-css`** on a specific `<link>` to leave it as an external stylesheet (presence is enough; the value is ignored):

```tsx
<!-- stays as a <link> -->
<link rel="stylesheet" href="./static/deferred.css" data-no-inline-css />

<!-- still inlined -->
<link rel="stylesheet" href="./static/critical.css" />
```

## How it works

1. Runs in Bun’s build pipeline via Frame-Master plugin chaining: `build.finally("html", …)`.
2. Pre-resolves every stylesheet `href` (local file read / remote fetch).
3. Uses **`HTMLRewriter`** to replace matching `<link rel="stylesheet">` elements with `<style>` tags.
4. Remote responses are written under `cacheDir`. In non-production (`NODE_ENV !== "production"`), cached files are preferred for faster rebuilds / dev.

## Options

| Option         | Type       | Default                                 | Description                                            |
| -------------- | ---------- | --------------------------------------- | ------------------------------------------------------ |
| `inlineRemote` | `boolean`  | `true`                                  | Fetch and inline `http(s)` stylesheets.                |
| `cacheDir`     | `string`   | `.frame-master/cache/remote-css`        | Disk cache for remote CSS.                             |
| `preferCache`  | `boolean`  | `true` when `NODE_ENV !== "production"` | Use cached remote CSS when present.                    |
| `resolveRoots` | `string[]` | `[cwd, htmlDir]`                        | Extra roots for root-relative paths (`/assets/x.css`). |
| `userAgent`    | `string`   | plugin UA                               | User-Agent used for remote fetches.                    |
| `warn`         | `fn`       | `console.warn`                          | Warning logger for missing files / fetch errors.       |

Unresolved links (missing file / failed fetch with no cache) are left unchanged.

| Attribute            | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `data-no-inline-css` | On a `<link rel="stylesheet">`, skips inlining for **that tag only**. |

## Publishing

Publishes via **npm Trusted Publishing (OIDC)** — no `NPM_TOKEN` secret.

1. On npm, open the package → **Settings** → **Trusted Publisher** → GitHub Actions:
   - **Organization or user:** `shpaw415`
   - **Repository:** `frame-master-plugin-inline-css`
   - **Workflow filename:** `publish.yml`
2. Bump `version` in `package.json`, commit, and push to `main`
3. Workflow runs tests, publishes if the version is new, and creates tag `vX.Y.Z`

## License

MIT
