import { useEffect, useState } from "react";
import { YarnBall } from "./ui";

const STEPS = [
  "Entendendo o seu pedido",
  "Desenhando as peças",
  "Escrevendo as carreiras uma a uma",
  "Conferindo a matemática de cada carreira",
  "Corrigindo o que for preciso",
  "Organizando materiais e montagem",
];

/** Tela de espera durante a geração (pode levar alguns minutos). */
export default function GenerationProgress() {
  const [step, setStep] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Avança as etapas em ritmo aproximado; a última permanece até a resposta chegar.
    setStep(Math.min(STEPS.length - 1, Math.floor(seconds / 20)));
  }, [seconds]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-cream-50/95 px-4" role="status" aria-live="polite">
      <div className="card w-full max-w-md p-8 text-center">
        <YarnBall className="mx-auto h-20 w-20 animate-bounce" />
        <h2 className="mt-4 text-2xl font-semibold">Preparando sua receita...</h2>
        <ol className="mt-6 space-y-2 text-left">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-3 ${i < step ? "text-cocoa-500" : i === step ? "font-bold text-blush-700" : "text-cocoa-500/50"}`}>
              <span aria-hidden="true" className="w-5 text-center">
                {i < step ? "✓" : i === step ? "●" : "○"}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-cocoa-500">
          Receitas completas levam de 1 a 4 minutos. Não feche esta página. ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")})
        </p>
      </div>
    </div>
  );
}
