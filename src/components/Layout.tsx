import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { ConfigNotice, YarnBall } from "./ui";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 font-bold transition ${isActive ? "bg-blush-100 text-blush-700" : "text-cocoa-700 hover:bg-cream-200"}`;

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const links = (
    <>
      <NavLink to="/" end className={navClass} onClick={() => setOpen(false)}>
        Criar receita
      </NavLink>
      <NavLink to="/minhas-receitas" className={navClass} onClick={() => setOpen(false)}>
        Minhas Receitas
      </NavLink>
      <NavLink to="/assistente" className={navClass} onClick={() => setOpen(false)}>
        Assistente
      </NavLink>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <ConfigNotice />
      <header className="no-print sticky top-0 z-30 border-b border-cream-200 bg-cream-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2" aria-label="Fio & Ponto IA — início">
            <YarnBall className="h-9 w-9" />
            <span className="font-display text-xl font-semibold text-cocoa-900">
              Fio <span className="text-blush-500">&</span> Ponto <span className="text-lilac-500">IA</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
            {links}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <button
                className="btn-ghost"
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
              >
                Sair
              </button>
            ) : (
              <Link to="/entrar" className="btn-secondary">
                Entrar
              </Link>
            )}
          </div>
          <button
            className="btn-ghost md:hidden"
            aria-expanded={open}
            aria-controls="menu-mobile"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Fechar" : "Menu"}
          </button>
        </div>
        {open && (
          <nav id="menu-mobile" className="flex flex-col gap-1 border-t border-cream-200 px-4 py-3 md:hidden" aria-label="Principal">
            {links}
            {user ? (
              <button
                className="btn-ghost justify-start"
                onClick={async () => {
                  setOpen(false);
                  await signOut();
                  navigate("/");
                }}
              >
                Sair
              </button>
            ) : (
              <Link to="/entrar" className="btn-secondary" onClick={() => setOpen(false)}>
                Entrar
              </Link>
            )}
          </nav>
        )}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="no-print border-t border-cream-200 bg-cream-100 px-4 py-8 text-center text-sm text-cocoa-500">
        <p>Receitas originais geradas por inteligência artificial, com contagem de pontos verificada automaticamente.</p>
        <p className="mt-1">As imagens são ilustrativas. Sempre teste a peça na prática — tensão e fio influenciam o resultado.</p>
      </footer>
    </div>
  );
}
