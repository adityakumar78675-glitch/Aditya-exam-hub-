/**
 * Context-aware scientific symbol correction.
 * Pure + idempotent: running it twice gives the same result, and ordinary
 * English words (e.g. "pi" in prose, "beta version") are left alone.
 */

const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "−": "⁻" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" };
const toSup = (s: string) => [...s].map((c) => SUP[c] ?? c).join("");
const toSub = (s: string) => [...s].map((c) => SUB[c] ?? c).join("");

// Always-scientific Greek names (rare as English words).
const STRONG: Record<string, string> = { lambda: "λ", theta: "θ", sigma: "σ", omega: "ω", rho: "ρ", phi: "φ", epsilon: "ε" };
// Names that are also English words: only convert in math/physics context.
const WEAK: Record<string, string> = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", pi: "π", mu: "μ" };

const MATH_BEFORE = /[\d=+\-*/^(×·÷<>≤≥√]\s*$/;
const MATH_AFTER = /^\s*(?:[\d=+\-*/^)×·÷<>≤≥]|[a-zA-Z]\b)/;
const PHYS_AFTER = /^\s*(?:particles?|rays?|decay|radiation|emission|function|=)/i;

function inMathContext(before: string, after: string, name: string): boolean {
  if (MATH_BEFORE.test(before)) return true;
  if (/^\s*[\d=+\-*/^×·÷<>≤≥]/.test(after)) return true;
  if (/\(\s*$/.test(before) && /^\s*\)/.test(after)) return true; // "(pi)"
  if (name !== "pi" && PHYS_AFTER.test(after)) return true;
  if (name === "pi" && /^\s*r\b/.test(after)) return true; // "pi r^2"
  if (name === "delta" && /^\s*[a-zA-Z]\b/.test(after) && !/^\s*(?:a|i)\b/i.test(after)) return true; // "delta x"
  return false;
}

export function correctScientific(input: string | null | undefined): string {
  if (input === null || input === undefined) return input as unknown as string;
  let s = String(input);
  if (!s) return s;

  // ε₀ / μ₀ (explicit forms are unambiguous)
  s = s.replace(/\b(epsilon|mu)\s*(?:_\s*\{?0\}?|0|\s+(?:naught|nought|not|zero))(?![\w])/gi, (_m, n: string) =>
    (n.toLowerCase() === "mu" ? "μ" : "ε") + "₀",
  );

  // sqrt(x) → √x  /  √(expr)
  s = s.replace(/\bsqrt\s*\(\s*([^()]+?)\s*\)/gi, (_m, inner: string) =>
    /^[\w.]+$/.test(inner) ? `√${inner}` : `√(${inner})`,
  );

  // Greek names
  s = s.replace(/(\d?)\b(lambda|theta|sigma|omega|rho|phi|epsilon|alpha|beta|gamma|delta|pi|mu)\b/gi, (m, digit: string, name: string, off: number, full: string) => {
    if (name !== name.toLowerCase() && name !== name.toUpperCase() && name[0] !== name[0]!.toUpperCase()) return m;
    const lower = name.toLowerCase();
    const before = full.slice(0, off) + digit;
    const after = full.slice(off + m.length);
    if (STRONG[lower]) return digit + STRONG[lower];
    if (WEAK[lower] && (digit || inMathContext(before, after, lower))) return digit + WEAK[lower];
    return m;
  });
  // "2pi" (no word boundary between digit and letters)
  s = s.replace(/(\d)(pi)\b/gi, (_m, d: string) => `${d}π`);
  // subscripts after Greek letters: ε_0, λ_1
  s = s.replace(/([α-ωΑ-Ω])_\{?(\d+)\}?/g, (_m, g: string, d: string) => g + toSub(d));
  // chemical-style / variable subscripts written with underscore: v_0, q_1
  s = s.replace(/\b([A-Za-z])_\{?(\d{1,2})\}?(?!\w)/g, (_m, v: string, d: string) => v + toSub(d));

  // powers: 10^-12, 10^(−12), x^{2}, r^2
  s = s.replace(/([\w)²³¹⁰-⁹π.])\s*\^\s*(?:\{\s*([+\-−]?\d+)\s*\}|\(\s*([+\-−]?\d+)\s*\)|([+\-−]?\d+))/g,
    (_m, base: string, a?: string, b?: string, c?: string) => base + toSup((a ?? b ?? c)!));

  // multiplication: "8.85 x 10", "3 X 10⁸", "2x10^5"
  s = s.replace(/(\d)\s+[xX]\s+(?=[\d(])/g, "$1 × ");
  s = s.replace(/(\d)[xX](?=10)/g, "$1 × ");
  s = s.replace(/(\d)\s*\*\s*(?=\d)/g, "$1 × ");

  // relations
  s = s.replace(/<=(?!>)/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠");

  // degrees: "30 degree(s)", "37 degree Celsius"
  s = s.replace(/(\d)\s*degrees?\s+(?:celsius|centigrade)\b/gi, "$1 °C");
  s = s.replace(/(\d)\s*degrees?\s+fahrenheit\b/gi, "$1 °F");
  s = s.replace(/(\d)\s*degrees?\b/gi, "$1°");

  // infinity
  s = s.replace(/\binfinity\b/gi, "∞");
  return s;
}

export type SymbolWarning = { text: string; issue: string };

/** Notation that we deliberately did not auto-correct (needs a human). */
export function findAmbiguous(input: string | null | undefined): string[] {
  if (!input) return [];
  const s = correctScientific(input);
  const out: string[] = [];
  if (/\^/.test(s)) out.push("Unresolved power '^'");
  if (/\bsqrt\b/i.test(s)) out.push("Unresolved 'sqrt'");
  if (/\bpi\b/i.test(s) && /[\d=]/.test(s)) out.push("'pi' may be the constant π");
  if (/\b[A-Za-z]{2,}_\w/.test(s)) out.push("Unresolved subscript '_'");
  return out;
}
