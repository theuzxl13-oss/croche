import { useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { isSupabaseConfigured, requireSupabase, supabaseHost } from "../lib/supabase";
import { ErrorBox, YarnBall, errorMessage } from "../components/ui";

type Mode = "entrar" | "cadastrar" | "link";

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(message)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/already registered/i.test(message)) return "Este e-mail já tem cadastro. Use a opção Entrar.";
  if (/password should be at least/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos.";
  if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) {
    return (
      `Não foi possível conectar ao Supabase (${supabaseHost ?? "URL não definida"}). ` +
      "Confira se VITE_SUPABASE_URL é a Project URL (https://xxxx.supabase.co), se o projeto não está pausado " +
      "no painel do Supabase e se algum bloqueador de anúncios não está barrando a conexão."
    );
  }
  return message;
}

export default function LoginPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next") || "/";
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (user) return <Navigate to={next.startsWith("/") ? next : "/"} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const sb = requireSupabase();
      const redirect = `${window.location.origin}${next.startsWith("/") ? next : "/"}`;
      if (mode === "entrar") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw new Error(translateAuthError(error.message));
      } else if (mode === "cadastrar") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) throw new Error(translateAuthError(error.message));
        if (!data.session) setInfo("Cadastro feito! Enviamos um link de confirmação para o seu e-mail.");
      } else {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
        if (error) throw new Error(translateAuthError(error.message));
        setInfo("Pronto! Enviamos um link de acesso para o seu e-mail.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const tabs: [Mode, string][] = [
    ["entrar", "Entrar"],
    ["cadastrar", "Criar conta"],
    ["link", "Link por e-mail"],
  ];

  return (
    <div className="bg-stitches min-h-[80vh] px-4 py-12">
      <div className="card mx-auto max-w-md p-6 sm:p-8">
        <YarnBall className="mx-auto h-14 w-14" />
        <h1 className="mt-3 text-center text-3xl font-semibold">Bem-vinda!</h1>
        <p className="mt-1 text-center text-cocoa-500">
          {params.get("motivo") === "gerar" ? "Entre para gerar e guardar sua receita." : "Entre para acessar suas receitas."}
        </p>

        {!isSupabaseConfigured && (
          <div className="mt-4">
            <ErrorBox message="O login ainda não está disponível: o Supabase não foi configurado (veja o README)." />
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-1 rounded-full bg-cream-100 p-1" role="tablist">
          {tabs.map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={`rounded-full px-2 py-2 text-sm font-bold ${mode === m ? "bg-white text-blush-700 shadow" : "text-cocoa-500"}`}
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="label">
              E-mail
            </label>
            <input id="email" type="email" autoComplete="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "link" && (
            <div>
              <label htmlFor="senha" className="label">
                Senha
              </label>
              <input
                id="senha"
                type="password"
                autoComplete={mode === "entrar" ? "current-password" : "new-password"}
                minLength={6}
                className="input"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {error && <ErrorBox message={error} />}
          {info && <p className="rounded-2xl bg-lilac-50 p-4 font-semibold text-lilac-700">{info}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy || !isSupabaseConfigured}>
            {busy ? "Aguarde..." : mode === "entrar" ? "Entrar" : mode === "cadastrar" ? "Criar minha conta" : "Enviar link de acesso"}
          </button>
          {mode === "entrar" && (
            <p className="text-center text-sm text-cocoa-500">
              Esqueceu a senha? Use a aba <strong>Link por e-mail</strong> para entrar sem senha.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
