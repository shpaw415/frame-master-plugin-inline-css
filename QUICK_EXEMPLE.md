# Quick example

Minimal setup for [frame-master-plugin-inline-css](https://github.com/shpaw415/frame-master-plugin-inline-css).

### 1. Install

```bash
bun add frame-master-plugin-inline-css
```

### 2. Enable the plugin (`frame-master.config.ts`)

```typescript
import type { FrameMasterConfig } from "frame-master/server/types";
import InlineCss from "frame-master-plugin-inline-css";

export default {
  HTTPServer: { port: 3000 },
  plugins: [
    InlineCss(), // defaults are enough for most projects
  ],
} satisfies FrameMasterConfig;
```

### 3. Link stylesheets in HTML as usual

```tsx
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Inline CSS demo</title>
    <link rel="stylesheet" href="./static/style.css" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Roboto"
    />
  </head>
  <body>
    <h1>Hello</h1>
  </body>
</html>
```

### 4. Build

```bash
bun frame-master build
```

At build time, matching `<link rel="stylesheet">` tags become `<style data-inline-css>` tags (local files + remote CSS by default). Original `.css` files on disk are kept.

### Optional: skip one stylesheet

```tsx
<link rel="stylesheet" href="./static/deferred.css" data-no-inline-css />
```

That link is left as an external stylesheet; other links still inline.
