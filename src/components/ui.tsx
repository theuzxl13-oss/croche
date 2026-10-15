import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { isSupabaseConfigured } from "../lib/supabase";

export function Spinner({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-blush-400 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoading({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-cocoa-500" role="status">
      <Spinner className="h-10 w-10" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">{message}</p>
      {onRetry && (
        <button className="btn-secondary mt-3" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function ConfigNotice() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="no-print border-b-2 border-lilac-200 bg-lilac-50 px-4 py-3 text-center text-sm text-lilac-700">
      <strong>Configuração pendente:</strong> defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo{" "}
      <code>.env</code> (veja o README) para ativar login, geração e biblioteca.
    </div>
  );
}

/** Exige login; redireciona para /entrar mantendo o destino. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <ErrorBox message="O Supabase ainda não foi configurado, então esta área não está disponível. Siga o README para configurar." />
      </div>
    );
  }
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: { to: string; label: string } }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <YarnBall className="h-16 w-16" />
      <h2 className="text-2xl">{title}</h2>
      <p className="max-w-md text-cocoa-500">{text}</p>
      {action && (
        <Link className="btn-primary mt-2" to={action.to}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function YarnBall({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="30" cy="34" r="22" fill="var(--color-blush-300)" />
      <path d="M12 30c10-6 26-6 36 0M10 38c12-6 28-6 40 0M16 22c8-5 20-5 28 0M20 50c6-3 16-3 22 0" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M44 18 58 4" stroke="var(--color-lilac-500)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="58" cy="4" r="3" fill="var(--color-lilac-500)" />
    </svg>
  );
}

/* ---------- Avisos rápidos (toasts) ---------- */

interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error";
}
const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-full px-5 py-3 font-semibold shadow-lg ${
              t.tone === "ok" ? "bg-cocoa-900 text-white" : "bg-red-700 text-white"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Algo deu errado. Tente novamente.";
}
