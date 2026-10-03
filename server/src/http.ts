// Small HTTP helpers.

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function body<T = any>(req: Request, maxBytes = 256 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large');
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export function getCookie(req: Request, name: string): string | undefined {
  const h = req.headers.get('cookie');
  if (!h) return undefined;
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
}

export function str(v: unknown, max = 500): string {
  if (typeof v !== 'string') throw new HttpError(400, 'bad_input');
  if (v.length > max) throw new HttpError(400, 'too_long');
  return v;
}

