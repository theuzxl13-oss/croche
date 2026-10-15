import { Route, Routes, Link } from "react-router";
import Layout from "./components/Layout";
import { RequireAuth } from "./components/ui";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RecipePage from "./pages/RecipePage";
import EditRecipePage from "./pages/EditRecipePage";
import FollowPage from "./pages/FollowPage";
import LibraryPage from "./pages/LibraryPage";
import AssistantPage from "./pages/AssistantPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="entrar" element={<LoginPage />} />
        <Route path="receita/:id" element={<RequireAuth><RecipePage /></RequireAuth>} />
        <Route path="receita/:id/editar" element={<RequireAuth><EditRecipePage /></RequireAuth>} />
        <Route path="receita/:id/acompanhar" element={<RequireAuth><FollowPage /></RequireAuth>} />
        <Route path="minhas-receitas" element={<RequireAuth><LibraryPage /></RequireAuth>} />
        <Route path="assistente" element={<RequireAuth><AssistantPage /></RequireAuth>} />
        <Route
          path="*"
          element={
            <div className="mx-auto max-w-xl px-4 py-20 text-center">
              <h1 className="text-3xl">Página não encontrada</h1>
              <Link to="/" className="btn-primary mt-6">
                Voltar ao início
              </Link>
            </div>
          }
        />
      </Route>
    </Routes>
  );
}
