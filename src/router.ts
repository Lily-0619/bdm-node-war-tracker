/**
 * 依存ゼロの小さなルーター。
 * 外部ライブラリを使わないので、依存のインストールが失敗する余地がない。
 */

export interface Ctx<E> {
  req: Request;
  env: E;
  url: URL;
  params: Record<string, string>;
  query(name: string): string | null;
  json<T = any>(): Promise<T>;
  formData(): Promise<FormData>;
  cookie(name: string): string | null;
}

type Handler<E> = (c: Ctx<E>) => Response | Promise<Response>;

interface Route<E> {
  method: string;
  parts: string[];
  handler: Handler<E>;
}

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function redirect(location: string, extraHeaders?: Record<string, string>): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...(extraHeaders ?? {}) },
  });
}

export function setCookieHeader(
  name: string, value: string,
  opts: { maxAge?: number; path?: string; secure?: boolean } = {},
): string {
  const bits = [`${name}=${value}`, `Path=${opts.path ?? "/"}`, "HttpOnly", "SameSite=Lax"];
  if (opts.secure !== false) bits.push("Secure");
  if (opts.maxAge !== undefined) bits.push(`Max-Age=${opts.maxAge}`);
  return bits.join("; ");
}

export class Router<E> {
  private routes: Route<E>[] = [];

  private add(method: string, path: string, handler: Handler<E>) {
    this.routes.push({ method, parts: path.split("/").filter(Boolean), handler });
    return this;
  }

  get(path: string, handler: Handler<E>) { return this.add("GET", path, handler); }
  post(path: string, handler: Handler<E>) { return this.add("POST", path, handler); }

  async handle(req: Request, env: E): Promise<Response | null> {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);

    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      if (r.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const seg = r.parts[i];
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) { ok = false; break; }
      }
      if (!ok) continue;

      const ctx: Ctx<E> = {
        req, env, url, params,
        query: (n) => url.searchParams.get(n),
        json: <T,>() => req.json() as Promise<T>,
        formData: () => req.formData(),
        cookie: (n) => {
          const raw = req.headers.get("Cookie") ?? "";
          for (const kv of raw.split(";")) {
            const idx = kv.indexOf("=");
            if (idx < 0) continue;
            if (kv.slice(0, idx).trim() === n) return kv.slice(idx + 1).trim();
          }
          return null;
        },
      };
      return await r.handler(ctx);
    }
    return null;
  }
}
