# my-image-resizer – Image optimizer (Cloudflare Workers)

Resize images on the fly via a single URL. The worker fetches the origin image, scales it to the requested width (aspect ratio preserved), and serves it with long-lived cache headers.

## Usage

```
https://myworker.<your-subdomain>.workers.dev/<width>/<full-image-url>
```

**Examples**

- `https://myworker.xxx/500/https://example.com/photo.jpg` → image scaled to 500px width
- `https://myworker.xxx/1200/https://cdn.example.com/assets/hero.png` → 1200px width

Width must be between 1 and 4096. The image is scaled down to that width (never upscaled) and aspect ratio is preserved. Format is chosen automatically (e.g. WebP/AVIF when the client supports it).

If the image URL contains special characters, encode it (e.g. `https%3A%2F%2Fexample.com%2Fpath%2Fimage.jpg`).

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create your local Wrangler config**

   ```bash
   cp packages/backend/wrangler.toml.example packages/backend/wrangler.toml
   ```

   Then edit `packages/backend/wrangler.toml` and set your worker name.

3. **Deploy**

   ```bash
   cd packages/backend && npm run deploy
   ```

2. **Enable Image Resizing on your zone**

   Image transformation is done by Cloudflare’s Image Resizing. You need it enabled for the zone the worker runs on:

   - In the [Cloudflare dashboard](https://dash.cloudflare.com), open your account and the zone that will receive the traffic (e.g. the zone for your workers.dev subdomain, or your custom domain).
   - Go to **Speed** → **Optimization**.
   - Turn **Image Resizing** ON.

   If Image Resizing is not enabled, the worker will still run but images will be returned at original size.

   **Important:** Resizing only runs when the worker is hit via a **custom domain** attached to a zone that has Image Resizing ON. The default `*.workers.dev` URL does not use your zone, so images there are served at original size. Add a custom domain (e.g. `img.yourdomain.com`) in **Workers & Pages** → your worker → **Settings** → **Domains**, then enable Image Resizing for that zone in **Speed** → **Optimization**.

## Local dev

```bash
npm run backend
```

Opens `http://localhost:8777`. **Image Resizing is not applied in local mode** — you get the original image. To test resizing locally, run the worker on Cloudflare’s network:

```bash
cd packages/backend && npm run dev:remote
```

Then hit the same URL; images will be resized. Or deploy and test on your live worker URL.

## Project layout

- `packages/backend/src/index.ts` - Worker entrypoint.
- `packages/backend/wrangler.toml.example` - Starter config; copy to `wrangler.toml` locally.
