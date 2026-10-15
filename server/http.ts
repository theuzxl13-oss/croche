import type { IncomingMessage, ServerResponse } from "node:http";

export type ApiRequest = IncomingMessage & { body?: unknown };
export type ApiResponse = ServerResponse;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 256 * 1024;

/** Lê o corpo JSON. Funciona na Vercel (body já interpretado) e no servidor local do Vite. */
export async function readJson(req: ApiRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null && typeof req.body !== "string") return req.body;
  if (typeof req.body === "string") return parseJson(req.body);

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Requisição muito grande.");
    chunks.push(buf);
  }
  return parseJson(Buffer.concat(chunks).toString("utf8") || "{}");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}

export function sendJson(res: ApiResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

type Handler = (req: ApiRequest, res: ApiResponse) => Promise<void>;

/** Envolve um handler com verificação de método e tratamento padronizado de erros. */
export function route(methods: string[], fn: Handler): Handler {
  return async (req, res) => {
    if (!methods.includes(req.method ?? "")) {
      res.setHeader("Allow", methods.join(", "));
      return sendJson(res, 405, { error: "Método não permitido." });
    }
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        if (!res.headersSent) return sendJson(res, err.status, { error: err.message, code: err.code });
        res.end();
        return;
      }
      console.error("[api] erro inesperado:", err);
      if (!res.headersSent) return sendJson(res, 500, { error: "Erro interno. Tente novamente em instantes." });
      res.end();
    }
  };
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new HttpError(500, `Configuração ausente no servidor: ${name}. Veja o README.`, "missing_env");
  return value;
}

export function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
