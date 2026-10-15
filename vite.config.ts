import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Em desenvolvimento, serve as funções de /api (as mesmas que rodam na Vercel)
 * diretamente pelo Vite, para que `npm run dev` funcione sem o Vercel CLI.
 */
function localApi(): Plugin {
  return {
    name: "local-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = url.pathname.match(/^\/api\/([a-z0-9-]+)$/);
        if (!match) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`);
          await mod.default(req, res);
        } catch (err) {
          server.config.logger.error(String(err instanceof Error ? err.stack : err));
          if (!res.headersSent) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
          }
          res.end(JSON.stringify({ error: "Rota de API não encontrada ou com erro." }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Disponibiliza as variáveis do .env (inclusive as sem prefixo VITE_) para as funções /api locais.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  return {
    plugins: [react(), tailwindcss(), localApi()],
    // preserveSymlinks evita problemas com pastas virtualizadas/links no Windows.
    resolve: { preserveSymlinks: true },
  };
});
