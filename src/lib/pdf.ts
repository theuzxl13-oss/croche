import { jsPDF } from "jspdf";
import { CATEGORY_LABELS, DIFFICULTY_LABELS, type RecipeContent } from "../../shared/recipeSchema";
import { heightLabel, roundLabel, startLabel } from "../../shared/format";
import { VALIDATION_LABELS, type ValidationStatus } from "../../shared/crochet/validator";
import { imageToJpegDataUrl, slugify } from "./files";

/** Paleta do PDF (RGB) */
const C = {
  blush: [196, 94, 123] as const,
  blushDark: [134, 56, 76] as const,
  blushLight: [249, 225, 231] as const,
  cream: [251, 245, 238] as const,
  lilac: [139, 111, 158] as const,
  text: [58, 44, 40] as const,
  muted: [138, 114, 104] as const,
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = { top: 22, bottom: 20, left: 20, right: 20 };
const CONTENT_W = PAGE_W - M.left - M.right;
const PT = 0.3528; // mm por ponto tipográfico

/** As fontes padrão do PDF usam Latin-1; troca caracteres fora dele por equivalentes. */
function clean(text: string): string {
  return text
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[•●]/g, "-")
    .replace(/[^\x00-\xFF]/g, "");
}

class Writer {
  doc: jsPDF;
  y = M.top;
  constructor(
    doc: jsPDF,
    private runningTitle: string,
  ) {
    this.doc = doc;
  }

  lineHeight(size: number) {
    return size * PT * 1.45;
  }

  newPage() {
    this.doc.addPage();
    this.y = M.top;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(...C.muted);
    this.doc.text(clean(this.runningTitle), M.left, 12);
    this.doc.setDrawColor(...C.blushLight);
    this.doc.setLineWidth(0.4);
    this.doc.line(M.left, 14.5, PAGE_W - M.right, 14.5);
  }

  ensure(height: number) {
    if (this.y + height > PAGE_H - M.bottom) this.newPage();
  }

  heading(text: string) {
    // Evita título órfão no fim da página: reserva espaço para o título + 3 linhas.
    this.ensure(10 + this.lineHeight(11) * 3);
    this.y += 3;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(14);
    this.doc.setTextColor(...C.blush);
    this.doc.text(clean(text.toUpperCase()), M.left, this.y + 5);
    this.y += 8;
    this.doc.setDrawColor(...C.blushLight);
    this.doc.setLineWidth(0.6);
    this.doc.line(M.left, this.y, M.left + 40, this.y);
    this.y += 4;
  }

  subheading(text: string, extra?: string) {
    this.ensure(8 + this.lineHeight(11) * 3);
    this.y += 2;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(12);
    this.doc.setTextColor(...C.blushDark);
    this.doc.text(clean(text), M.left, this.y + 4.5);
    if (extra) {
      const w = this.doc.getTextWidth(clean(text));
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(...C.muted);
      this.doc.text(clean(extra), M.left + w + 3, this.y + 4.5);
    }
    this.y += 8;
  }

  paragraph(text: string, opts: { size?: number; color?: readonly [number, number, number]; bold?: boolean; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const indent = opts.indent ?? 0;
    this.doc.setFont("helvetica", opts.bold ? "bold" : "normal");
    this.doc.setFontSize(size);
    this.doc.setTextColor(...(opts.color ?? C.text));
    const lines = this.doc.splitTextToSize(clean(text), CONTENT_W - indent) as string[];
    const lh = this.lineHeight(size);
    for (const line of lines) {
      this.ensure(lh);
      this.doc.text(line, M.left + indent, this.y + lh * 0.75);
      this.y += lh;
    }
    this.y += opts.gap ?? 1.5;
  }

  /** Item com rótulo em negrito seguido de texto que quebra alinhado. */
  labeled(label: string, text: string, size = 10.5) {
    this.doc.setFontSize(size);
    this.doc.setFont("helvetica", "bold");
    const labelText = clean(label) + " ";
    const labelW = this.doc.getTextWidth(labelText);
    this.doc.setFont("helvetica", "normal");
    const lh = this.lineHeight(size);
    const indent = Math.min(labelW, 48);
    const lines = this.doc.splitTextToSize(clean(text), CONTENT_W - indent) as string[];
    // Mantém linhas curtas da mesma carreira juntas.
    this.ensure(Math.min(lines.length, 3) * lh);
    this.doc.setFont("helvetica", "bold");
    this.doc.setTextColor(...C.blushDark);
    this.doc.text(labelText, M.left, this.y + lh * 0.75);
    this.doc.setFont("helvetica", "normal");
    this.doc.setTextColor(...C.text);
    lines.forEach((line, i) => {
      if (i > 0) this.ensure(lh);
      this.doc.text(line, M.left + indent, this.y + lh * 0.75);
      this.y += lh;
    });
    this.y += 1;
  }

  bullets(items: string[], numbered = false) {
    items.forEach((item, i) => {
      const marker = numbered ? `${i + 1}.` : "-";
      this.doc.setFontSize(10.5);
      this.doc.setFont("helvetica", "bold");
      this.doc.setTextColor(...C.blush);
      const lh = this.lineHeight(10.5);
      this.ensure(lh);
      this.doc.text(marker, M.left + 1, this.y + lh * 0.75);
      this.paragraph(item, { indent: 7, gap: 1 });
    });
    this.y += 1.5;
  }
}

function drawCover(doc: jsPDF, c: RecipeContent, imageData: string | null, status: ValidationStatus) {
  doc.setFillColor(...C.cream);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  doc.setFillColor(...C.blushLight);
  doc.rect(0, 0, PAGE_W, 24, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C.blushDark);
  doc.text("FIO & PONTO IA", M.left, 15);
  doc.setFont("helvetica", "normal");
  doc.text(clean(`Receita de ${CATEGORY_LABELS[c.category].toLowerCase()}`), PAGE_W - M.right, 15, { align: "right" });

  // Imagem
  const imgSize = 140;
  const imgX = (PAGE_W - imgSize) / 2;
  const imgY = 36;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(imgX - 4, imgY - 4, imgSize + 8, imgSize + 8, 6, 6, "F");
  if (imageData) {
    doc.addImage(imageData, "JPEG", imgX, imgY, imgSize, imgSize, undefined, "FAST");
  } else {
    doc.setFillColor(...C.blushLight);
    doc.roundedRect(imgX, imgY, imgSize, imgSize, 4, 4, "F");
    doc.setFontSize(11);
    doc.setTextColor(...C.muted);
    doc.text("Imagem ilustrativa não gerada", PAGE_W / 2, imgY + imgSize / 2, { align: "center" });
  }

  // Título
  let y = imgY + imgSize + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...C.text);
  const titleLines = doc.splitTextToSize(clean(c.title), CONTENT_W) as string[];
  for (const line of titleLines.slice(0, 3)) {
    doc.text(line, PAGE_W / 2, y, { align: "center" });
    y += 10;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...C.muted);
  doc.text("Receita gerada por IA", PAGE_W / 2, y, { align: "center" });
  y += 10;

  // Ficha técnica
  const info = [
    ["Tamanho", heightLabel(c)],
    ["Nível", DIFFICULTY_LABELS[c.difficulty]],
    ["Tempo estimado", c.estimatedTime],
  ];
  const boxW = (CONTENT_W - 8) / 3;
  info.forEach(([label, value], i) => {
    const x = M.left + i * (boxW + 4);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, boxW, 20, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.lilac);
    doc.text(clean(label.toUpperCase()), x + boxW / 2, y + 7, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(...C.text);
    const v = (doc.splitTextToSize(clean(value), boxW - 6) as string[])[0];
    doc.text(v, x + boxW / 2, y + 14.5, { align: "center" });
  });
  y += 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.muted);
  doc.text(clean(`Contagem de pontos: ${VALIDATION_LABELS[status]}`), PAGE_W / 2, y, { align: "center" });
}

export async function buildRecipePdf(
  c: RecipeContent,
  opts: { imageUrl: string | null; status: ValidationStatus },
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: c.title, subject: "Receita de crochê gerada por IA", creator: "Fio & Ponto IA" });

  let imageData: string | null = null;
  if (opts.imageUrl) {
    try {
      imageData = await imageToJpegDataUrl(opts.imageUrl);
    } catch {
      imageData = null;
    }
  }
  drawCover(doc, c, imageData, opts.status);

  const w = new Writer(doc, c.title);
  w.newPage();

  if (c.summary) w.paragraph(c.summary, { size: 11, color: C.muted, gap: 3 });

  w.heading("Materiais");
  const yarnItems = c.yarn.colors.map((y) => `${y.color}: aprox. ${y.grams} g${y.meters ? ` (~${y.meters} m)` : ""}`);
  w.bullets([
    `Fio: ${c.yarn.type} (${c.yarn.weight})`,
    ...yarnItems.map((s) => `   ${s}`),
    `Agulha de crochê de ${String(c.hook.sizeMm).replace(".", ",")} mm${c.hook.note ? ` (${c.hook.note})` : ""}`,
    ...c.materials,
  ]);

  w.heading("Abreviações");
  for (const a of c.abbreviations) w.labeled(`${a.abbr} -`, a.meaning, 10);

  if (c.notes.length) {
    w.heading("Observações");
    w.bullets(c.notes);
  }

  w.heading("Receita");
  for (const part of c.parts) {
    w.subheading(part.name, `${part.quantity > 1 ? `faça ${part.quantity}  |  ` : ""}cor: ${part.color}`);
    w.paragraph(startLabel(part.start), { size: 10, color: C.muted });
    for (const r of part.rounds) {
      const text = r.text.replace(/\s*\(\s*\d+\s*\)\s*\.?\s*$/, "");
      w.labeled(`${roundLabel(r)}:`, `${text} (${r.count}).${r.note ? ` ${r.note}` : ""}`);
    }
    if (part.finishing) w.paragraph(part.finishing, { size: 10, color: C.lilac, gap: 3 });
  }

  w.heading("Montagem");
  w.bullets(c.assembly, true);

  if (c.finishing.length) {
    w.heading("Acabamento");
    w.bullets(c.finishing, true);
  }
  if (c.tips.length) {
    w.heading("Dicas finais");
    w.bullets(c.tips);
  }

  w.ensure(22);
  w.y += 4;
  w.paragraph(
    "Aviso: esta receita foi gerada por inteligência artificial. A contagem de pontos foi conferida automaticamente, mas a validação matemática não substitui o teste físico da peça: podem ser necessários ajustes de tensão, tamanho e montagem. A imagem é uma representação ilustrativa.",
    { size: 8.5, color: C.muted },
  );

  // Numeração de páginas (capa sem número)
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    doc.text(`Página ${i - 1} de ${total - 1}`, PAGE_W - M.right, PAGE_H - 10, { align: "right" });
    doc.text("Fio & Ponto IA", M.left, PAGE_H - 10);
  }
  return doc;
}

export async function downloadRecipePdf(c: RecipeContent, opts: { imageUrl: string | null; status: ValidationStatus }): Promise<void> {
  const doc = await buildRecipePdf(c, opts);
  doc.save(`${slugify(c.title)}.pdf`);
}
