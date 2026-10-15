import { useEffect, useState } from "react";
import { listRecipes, type RecipeSummary } from "../lib/recipes";
import ChatPanel from "../components/ChatPanel";

export default function AssistantPage() {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [recipeId, setRecipeId] = useState<string>("");

  useEffect(() => {
    listRecipes()
      .then(setRecipes)
      .catch(() => setRecipes([]));
  }, []);

  const selected = recipes.find((r) => r.id === recipeId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-semibold sm:text-4xl">Assistente de crochê</h1>
      <p className="mt-2 text-cocoa-700">Tire dúvidas sobre pontos, técnicas e montagem. Escolha uma receita para respostas sobre ela.</p>

      <div className="mt-5">
        <label htmlFor="receita" className="label">
          Receita em uso (opcional)
        </label>
        <select id="receita" className="input" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          <option value="">Nenhuma — dúvidas gerais</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </div>

      <div className="card mt-5 overflow-hidden">
        <ChatPanel recipeId={recipeId || null} recipeTitle={selected?.title} />
      </div>
    </div>
  );
}
