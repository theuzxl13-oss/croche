import { useState } from "react";
import { VALIDATION_LABELS, type ValidationReport, type ValidationStatus } from "../../shared/crochet/validator";

const TONE: Record<ValidationStatus, string> = {
  validada: "bg-emerald-50 text-emerald-800 border-emerald-200",
  validada_com_ressalvas: "bg-amber-50 text-amber-800 border-amber-200",
  com_erros: "bg-red-50 text-red-800 border-red-200",
};

const ICON: Record<ValidationStatus, string> = { validada: "✓", validada_com_ressalvas: "!", com_erros: "✕" };

export function ValidationBadge({ status, className = "" }: { status: ValidationStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${TONE[status]} ${className}`}>
      <span aria-hidden="true">{ICON[status]}</span>
      {VALIDATION_LABELS[status]}
    </span>
  );
}

export default function ValidationPanel({ report, correctionRounds }: { report: ValidationReport; correctionRounds?: number }) {
  const [open, setOpen] = useState(report.status === "com_erros");
  const issues = [...report.errors, ...report.warnings];

  const summary =
    report.status === "validada"
      ? `Todas as ${report.totalRounds} carreiras tiveram a contagem de pontos conferida: aumentos, diminuições e repetições batem com os totais.`
      : report.status === "validada_com_ressalvas"
        ? `${report.verifiedRounds} de ${report.totalRounds} carreiras foram conferidas automaticamente, sem erros. Alguns pontos precisam de conferência manual.`
        : `Encontramos ${report.errors.length} problema(s) na contagem de pontos. Esta receita NÃO está validada — revise as carreiras indicadas ou gere novamente.`;

  return (
    <section className={`avoid-break rounded-3xl border-2 p-5 ${TONE[report.status]}`} aria-labelledby="validacao-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="validacao-titulo" className="font-display text-lg font-semibold text-inherit">
          Verificação matemática
        </h2>
        <ValidationBadge status={report.status} className="bg-white" />
      </div>
      <p className="mt-2">{summary}</p>
      {correctionRounds ? (
        <p className="mt-1 text-sm opacity-80">A IA fez {correctionRounds} rodada(s) de correção automática antes de entregar a receita.</p>
      ) : null}
      {issues.length > 0 && (
        <>
          <button className="no-print mt-3 text-sm font-bold underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? "Ocultar detalhes" : `Ver detalhes (${issues.length})`}
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5 text-sm">
              {issues.map((i, idx) => (
                <li key={idx} className="flex gap-2">
                  <span aria-hidden="true">{i.severity === "error" ? "✕" : "!"}</span>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="mt-3 text-xs opacity-80">
        Receita gerada por IA. A validação matemática não substitui o teste físico da peça: tensão, fio e montagem podem exigir ajustes.
      </p>
    </section>
  );
}
