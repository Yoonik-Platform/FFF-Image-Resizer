export interface Env {
  IMAGES: {
    input(stream: ReadableStream<Uint8Array> | ArrayBuffer): {
      transform(opts: { width?: number; fit?: string }): { output(opts: { format: string }): Promise<{ response(): Promise<Response> }> };
    };
  };
}

function parsePath(pathname: string, queryUrl: string | null): { width: number; imageUrl: string } | null {
  const withoutLeading = pathname.replace(/^\//, "");
  if (!withoutLeading) return null;

  const segments = withoutLeading.split("/");
  const widthStr = segments[0];
  if (!widthStr) return null;

  const width = parseInt(widthStr, 10);
  if (Number.isNaN(width) || width < 1 || width > 4096) return null;

  // Image URL in query string: /500?url=https://...
  if (queryUrl) {
    const imageUrl = queryUrl.trim();
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return { width, imageUrl };
    }
    return null;
  }

  // Image URL in path: /500/https://...
  if (segments.length < 2) return null;
  const urlPart = segments.slice(1).join("/");
  if (!urlPart) return null;

  let imageUrl: string;
  try {
    imageUrl = decodeURIComponent(urlPart);
  } catch {
    return null;
  }
  // Fix protocol: "https:/example.com" -> "https://example.com"
  imageUrl = imageUrl.replace(/^(https?):\/([^/])/, "$1://$2");
  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) return null;

  return { width, imageUrl };
}

function isDropboxUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "www.dropbox.com" || u.hostname === "dropbox.com" || u.hostname.endsWith(".dropbox.com");
  } catch {
    return false;
  }
}

function normalizeDropboxUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("dl", "1"); // force direct download instead of preview page
    return u.toString();
  } catch {
    return url;
  }
}

function upstreamFetchHeaders(imageUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  };
  if (isDropboxUrl(imageUrl)) {
    headers["Referer"] = "https://www.dropbox.com/";
    headers["Origin"] = "https://www.dropbox.com";
  }
  return headers;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response(
        `Usage: ${url.origin}/<width>/<full-image-url>\nOr: ${url.origin}/<width>?url=<image-url>\nExample: ${url.origin}/500/https://example.com/photo.jpg`,
        { headers: { "Content-Type": "text/plain" }, status: 200 }
      );
    }

    const queryUrl = url.searchParams.get("url") ?? url.searchParams.get("image") ?? url.searchParams.get("u");
    const parsed = parsePath(url.pathname, queryUrl);
    if (!parsed) {
      return new Response("Invalid path. Use /<width>/<full-image-url> (width 1–4096).", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    let { width, imageUrl } = parsed;
    // When image URL was in the path, request query string belongs to the image URL (e.g. ?hmac=...)
    if (!queryUrl && url.search) {
      imageUrl += (imageUrl.includes("?") ? "&" : "?") + url.search.slice(1);
    }
    if (isDropboxUrl(imageUrl)) imageUrl = normalizeDropboxUrl(imageUrl);

    try {
      const imageResponse = await fetch(imageUrl, {
        headers: upstreamFetchHeaders(imageUrl),
      });
      if (!imageResponse.ok) {
        return new Response(`Upstream image failed: ${imageResponse.status}`, {
          status: imageResponse.status,
          headers: { "Content-Type": "text/plain" },
        });
      }
      const body = imageResponse.body;
      if (!body) {
        return new Response("Upstream returned no body", { status: 502, headers: { "Content-Type": "text/plain" } });
      }
      const format = /image\/avif/i.test(request.headers.get("Accept") ?? "") ? "image/avif" : "image/webp";
      const pipeline = env.IMAGES.input(body)
        .transform({ width, fit: "scale-down" })
        .output({ format });
      const result = await pipeline;
      const resized =
        typeof result.response === "function"
          ? await result.response()
          : await (result as unknown as { response: Promise<Response> }).response;
      const headers = new Headers(resized.headers);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(resized.body, { status: resized.status, headers });
    } catch (e) {
      return new Response(`Failed to fetch or resize image: ${e instanceof Error ? e.message : String(e)}`, {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    }
  },
};
