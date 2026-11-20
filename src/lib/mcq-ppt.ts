import type PptxGenJS from "pptxgenjs";
import { layoutQuestion, PPT_COLORS as C, PPT_HEIGHT, PPT_WIDTH, type Measure, type PptPayload, type PptQuestion, type QuestionLayout } from "./mcq-ppt-model";

export function pptFont(text: string) { return /[\u0900-\u097f]/.test(text) ? "Noto Sans Devanagari" : "Noto Sans"; }

export async function preparePptLayout(questions: PptQuestion[]) {
  await Promise.all([document.fonts.load('32px "Noto Sans"'), document.fonts.load('bold 34px "Noto Sans"'), document.fonts.load('32px "Noto Sans Devanagari"')]);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot measure slide text in this browser.");
  const measure: Measure = (text, size, bold) => {
    ctx.font = `${bold ? "bold " : ""}${size * 96 / 72}px "${pptFont(text)}", sans-serif`;
    return ctx.measureText(text).width * 72 / 96 * 1.04;
  };
  return questions.map((q) => layoutQuestion(q, measure));
}

// A decorative background only. All questions, labels and options are native editable objects.
export function makePptBackground() {
  const canvas = document.createElement("canvas");
  canvas.width = 1920; canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot create slide background.");
  const base = ctx.createLinearGradient(0, 0, 1920, 1080);
  base.addColorStop(0, `#${C.mist}`); base.addColorStop(0.45, `#${C.paper}`); base.addColorStop(1, `#${C.mist}`);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 1920, 1080);
  ctx.strokeStyle = `#${C.blue}`; ctx.globalAlpha = 0.035; ctx.lineWidth = 2;
  for (let i = 0; i < 36; i++) {
    ctx.beginPath(); ctx.moveTo(1450 + i * 16, 1080); ctx.lineTo(1920, 580 + i * 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 450 + i * 10); ctx.lineTo(250 + i * 10, 1080); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const wave = (color: string, upper: boolean, offset: number, depth: number) => {
    const g = ctx.createLinearGradient(0, 0, 1920, 0);
    g.addColorStop(0, `#${C.paper}`); g.addColorStop(0.6, `#${color}`); g.addColorStop(1, `#${C.navy}`);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (upper) {
      ctx.moveTo(950, 0); ctx.bezierCurveTo(1420, offset, 1750, offset, 1920, depth);
      ctx.lineTo(1920, 0); ctx.closePath();
    } else {
      ctx.moveTo(0, 1080 - depth); ctx.bezierCurveTo(500, 1080 + offset, 1300, 1000 + offset, 1920, 1080 - depth / 2);
      ctx.lineTo(1920, 1080); ctx.lineTo(0, 1080); ctx.closePath();
    }
    ctx.fill();
  };
  wave(C.blue, true, 55, 140); wave(C.red, true, 12, 88);
  wave(C.blue, false, -45, 72); wave(C.red, false, 5, 35);
  return canvas.toDataURL("image/png");
}

function addBlock(slide: PptxGenJS.Slide, block: QuestionLayout["question"], color: string) {
  slide.addText(block.lines.join("\n"), {
    x: block.x, y: block.y + 0.07, w: block.w, h: block.h - 0.08,
    fontFace: pptFont(block.text), fontSize: block.size, bold: block.bold,
    color, margin: 0, valign: "top", breakLine: false,
    lineSpacingMultiple: 1.15, paraSpaceAfter: 0,
    lang: /[\u0900-\u097f]/.test(block.text) ? "hi-IN" : "en-US",
  });
}

export async function buildMcqPpt(payload: PptPayload, layouts: QuestionLayout[], background: string, cover: boolean, chapter: string) {
  const { default: PptxGen } = await import("pptxgenjs");
  if (payload.questions.length === 0) throw new Error("Select at least one question.");
  if (layouts.length !== payload.questions.length) throw new Error("Slide layout is incomplete.");
  const ppt = new PptxGen();
  ppt.defineLayout({ name: "MCQ_FULL_HD", width: PPT_WIDTH, height: PPT_HEIGHT });
  ppt.layout = "MCQ_FULL_HD";
  ppt.author = "Aditya Exam Hub";
  ppt.subject = payload.test.subject ?? "";
  ppt.title = payload.test.title;
  ppt.company = "Aditya Exam Hub";
  ppt.theme = { headFontFace: "Noto Sans", bodyFontFace: "Noto Sans" };
  ppt.defineSlideMaster({ title: "MCQ", background: { color: C.paper }, objects: [{ image: { data: background, x: 0, y: 0, w: PPT_WIDTH, h: PPT_HEIGHT } }] });
  if (cover) {
    const slide = ppt.addSlide({ masterName: "MCQ" });
    slide.addText(payload.test.subject ?? "", { x: 0.85, y: 1.8, w: 11.5, h: 0.65, fontSize: 28, color: C.blue, margin: 0, fontFace: pptFont(payload.test.subject ?? "") });
    slide.addText(payload.test.title, { x: 0.85, y: 2.65, w: 11.5, h: 2.2, fontSize: 40, bold: true, color: C.navy, margin: 0, fontFace: pptFont(payload.test.title), fit: "shrink" });
    if (chapter.trim()) slide.addText(chapter.trim(), { x: 0.85, y: 5.2, w: 11.5, h: 0.75, fontSize: 26, color: C.ink, margin: 0, fontFace: pptFont(chapter), fit: "shrink" });
  }
  for (const [i, q] of payload.questions.entries()) {
    const layout = layouts[i];
    if (!layout) throw new Error(`Missing layout for Q${q.number}.`);
    const slide = ppt.addSlide({ masterName: "MCQ" });
    slide.addText(`Q.${q.number}`, { x: 0.78, y: 0.42, w: 3.2, h: 0.58, fontSize: 32, bold: true, color: C.navy, margin: 0, fontFace: "Noto Sans" });
    addBlock(slide, layout.question, C.navy);
    layout.options.forEach((option, j) => {
      slide.addShape(ppt.ShapeType.roundRect, { x: 0.78, y: option.y, w: 11.8, h: option.h, rectRadius: 0.08, line: { color: C.blue, width: 1 }, fill: { color: C.paper, transparency: 10 } });
      slide.addShape(ppt.ShapeType.roundRect, { x: 0.78, y: option.y, w: 0.8, h: option.h, rectRadius: 0.08, line: { color: C.blue, transparency: 100 }, fill: { color: C.blue } });
      slide.addText(String.fromCharCode(65 + j), { x: 0.78, y: option.y, w: 0.8, h: option.h, fontSize: 28, bold: true, color: C.paper, margin: 0, align: "center", valign: "middle", fontFace: "Noto Sans" });
      addBlock(slide, option, C.ink);
    });
  }
  const output = await ppt.write({ outputType: "blob", compression: true });
  if (!(output instanceof Blob)) throw new Error("PowerPoint generation did not return a valid file.");
  return output;
}

export function downloadPpt(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}