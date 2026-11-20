import { describe, expect, it } from "vitest";
import { layoutQuestion, PPT_HEIGHT, PPT_WIDTH, pptFilename, projectPptQuestion, requirePptAdmin } from "./mcq-ppt-model";

const measure = (text: string, size: number) => [...text].length * size * 0.6;
describe("MCQ PowerPoint rules", () => {
  it("rejects student and unauthenticated access", () => {
    expect(() => requirePptAdmin(false)).toThrow("Only authenticated admins");
    expect(() => requirePptAdmin(null)).toThrow();
    expect(() => requirePptAdmin(true)).not.toThrow();
  });
  it("projects only question and four options, never answer data", () => {
    const row = { id: "q", question_en: "Value of epsilon0?", question_hi: null, options_en: ["8.85 x 10^-12", "B", "C", "D"], options_hi: [], correct_option: 2, solution_en: "SECRET_SOLUTION", answer_key: "SECRET_KEY" };
    const q = projectPptQuestion(row, 7, "en");
    expect(Object.keys(q)).toEqual(["id", "number", "question", "options"]);
    expect(q.number).toBe(7);
    expect(q.options).toEqual(["8.85 × 10⁻¹²", "B", "C", "D"]);
    expect(JSON.stringify(q)).not.toContain("SECRET");
  });
  it("preserves Hindi and English and all four options", () => {
    const q = projectPptQuestion({ id: "hi", question_en: "Charge?", question_hi: "इलेक्ट्रॉन का आवेश क्या है?", options_en: ["A", "B", "C", "D"], options_hi: ["ऋणात्मक", "धनात्मक", "शून्य", "अनंत"] }, 3, "hi");
    expect(q.question).toBe("इलेक्ट्रॉन का आवेश क्या है?");
    expect(q.options).toEqual(["ऋणात्मक", "धनात्मक", "शून्य", "अनंत"]);
  });
  it("rejects missing options rather than inventing them", () => {
    expect(() => projectPptQuestion({ id: "q", question_en: "Question", question_hi: null, options_en: ["A", "B"], options_hi: [] }, 1, "en")).toThrow("four");
  });
  it("uses widescreen 13.333 × 7.5 dimensions", () => {
    expect(PPT_WIDTH).toBeCloseTo(13.333, 3); expect(PPT_HEIGHT).toBe(7.5);
    expect(PPT_WIDTH / PPT_HEIGHT).toBeCloseTo(16 / 9, 5);
  });
  for (const count of [10, 50, 100]) it(`lays out ${count} MCQs with exactly four options per slide`, () => {
    const questions = Array.from({ length: count }, (_, i) => ({ id: String(i), number: i + 1, question: "The value of 1/(4πε₀) is", options: ["9 × 10⁹ N m²/C²", "9 × 10⁻⁹", "8.85 × 10⁻¹²", "6.6 × 10⁻¹¹"] }));
    const layouts = questions.map((q) => layoutQuestion(q, measure));
    expect(layouts).toHaveLength(count);
    for (const layout of layouts) { expect(layout.options).toHaveLength(4); expect(layout.options[3]?.y ?? 99).toBeLessThan(6.7); }
  });
  it("keeps long question/options inside slide without clipping", () => {
    const q = { id: "long", number: 1, question: "Compare electric field and potential at the given points. ".repeat(5), options: Array.from({ length: 4 }, () => "The field is proportional to charge and inversely proportional to distance squared.") };
    const layout = layoutQuestion(q, measure);
    expect(layout.question.size).toBeGreaterThanOrEqual(20);
    const last = layout.options[3]; expect(last).toBeDefined();
    if (last) expect(last.y + last.h).toBeLessThan(7);
  });
  it("stops generation if question cannot fit legibly", () => {
    expect(() => layoutQuestion({ id: "huge", number: 9, question: "Very long text ".repeat(600), options: ["A", "B", "C", "D"] }, measure)).toThrow("too long");
  });
  it("names a genuine pptx without unsafe filename characters", () => {
    expect(pptFilename("Physics Class12")).toBe("AdityaExamHub_Physics_Class12_MCQs.pptx");
  });
});