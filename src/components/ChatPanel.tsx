import { useEffect, useRef, useState, type FormEvent } from "react";
import { streamChat, type ChatMessage } from "../lib/api";
import { errorMessage, YarnBall } from "./ui";

const SUGGESTIONS = [
  "Como faço um anel mágico?",
  "O que significa 2 pb e 1 aumento?",
  "Como diminuir sem deixar buracos?",
  "Minha peça está ficando torta. O que faço?",
  "Como trocar a cor do fio?",
];

/** Conversa com a assistente de crochê. Com `recipeId`, a resposta considera a receita aberta. */
export default function ChatPanel({ recipeId, recipeTitle, compact = false }: { recipeId: string | null; recipeTitle?: string; compact?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Trocar de receita reinicia a conversa.
  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [recipeId]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setError(null);
    const history: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        recipeId,
        history.slice(-20),
        (chunk) =>
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + chunk };
            return copy;
          }),
        controller.signal,
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(errorMessage(err));
        // Remove a pergunta sem resposta para manter a conversa consistente.
        setMessages(history.slice(0, -1));
        setInput(question);
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  return (
    <div className={`flex flex-col ${compact ? "h-full" : "h-[70vh] min-h-[480px]"}`}>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-center">
            <YarnBall className="mx-auto h-12 w-12" />
            <p className="mt-2 font-bold">Olá! Sou a Professora Fio.</p>
            <p className="text-sm text-cocoa-500">
              {recipeTitle ? `Estou com a receita "${recipeTitle}" aberta. ` : ""}Pergunte qualquer dúvida de crochê.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip-off text-left" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 ${
                m.role === "user" ? "rounded-br-md bg-blush-500 text-white" : "rounded-bl-md bg-cream-100 text-cocoa-900"
              }`}
            >
              {m.content || (busy && i === messages.length - 1 ? <span className="text-cocoa-500">Pensando...</span> : "")}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mx-4 mb-2 rounded-2xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-cream-200 p-3">
        <label htmlFor="pergunta" className="sr-only">
          Sua pergunta
        </label>
        <input
          id="pergunta"
          className="input"
          placeholder="Escreva sua dúvida..."
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={busy || !input.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}

/** Botão flutuante que abre o chat sobre a página da receita. */
export function FloatingChat({ recipeId, recipeTitle }: { recipeId: string; recipeTitle: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="no-print">
      {open && (
        <div className="fixed inset-x-2 bottom-20 z-40 h-[70vh] overflow-hidden rounded-3xl border border-cream-200 bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:w-[400px]">
          <div className="flex items-center justify-between border-b border-cream-200 bg-blush-50 px-4 py-2">
            <strong>Assistente de crochê</strong>
            <button className="btn-ghost min-h-10 px-3" onClick={() => setOpen(false)} aria-label="Fechar assistente">
              ✕
            </button>
          </div>
          <div className="h-[calc(100%-49px)]">
            <ChatPanel recipeId={recipeId} recipeTitle={recipeTitle} compact />
          </div>
        </div>
      )}
      <button
        className="btn-primary fixed bottom-4 right-4 z-40 shadow-lg"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "Fechar ajuda" : "💬 Tirar dúvida"}
      </button>
    </div>
  );
}
