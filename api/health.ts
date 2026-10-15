import { route, sendJson } from "../server/http";
import { textProvider } from "../server/llm";
import { imageProvider } from "../server/imageGenerator";

/** GET /api/health — informa quais integrações estão configuradas (sem expor valores). */
export default route(["GET"], async (_req, res) => {
  const has = (k: string) => Boolean(process.env[k]);
  sendJson(res, 200, {
    ok: true,
    supabase: has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"),
    textProvider: textProvider(),
    imageProvider: imageProvider(),
    recipes: textProvider() === "gemini" ? has("GEMINI_API_KEY") : has("ANTHROPIC_API_KEY"),
    images: imageProvider() === "gemini" ? has("GEMINI_API_KEY") : has("OPENAI_API_KEY"),
  });
});
