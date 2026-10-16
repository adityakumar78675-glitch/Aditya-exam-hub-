import { describe, expect, it } from "vitest";
import { correctScientific as c, findAmbiguous } from "./sci-symbols";

describe("correctScientific", () => {
  it("example from spec", () => {
    expect(c("The permittivity of free space (epsilon0) is")).toBe("The permittivity of free space (ε₀) is");
    expect(c("8.85 x 10^-12 F/m")).toBe("8.85 × 10⁻¹² F/m");
  });
  it("epsilon/mu naught variants", () => {
    expect(c("epsilon_0")).toBe("ε₀");
    expect(c("epsilon naught")).toBe("ε₀");
    expect(c("mu0 and mu_0")).toBe("μ₀ and μ₀");
  });
  it("greek letters", () => {
    expect(c("wavelength lambda and angle theta")).toBe("wavelength λ and angle θ");
    expect(c("omega = 2pi f")).toBe("ω = 2π f");
    expect(c("alpha particle")).toBe("α particle");
    expect(c("rho, sigma, phi")).toBe("ρ, σ, φ");
  });
  it("leaves ordinary words alone", () => {
    expect(c("The pi of the story")).toBe("The pi of the story");
    expect(c("A river delta and a beta version")).toBe("A river delta and a beta version");
    expect(c("Text box example")).toBe("Text box example");
  });
  it("pi as constant", () => {
    expect(c("Area = pi r^2")).toBe("Area = π r²");
    expect(c("1/(4 pi epsilon0)")).toBe("1/(4 π ε₀)");
  });
  it("powers and relations", () => {
    expect(c("10^2")).toBe("10²");
    expect(c("x <= 5, y >= 2, z != 0")).toBe("x ≤ 5, y ≥ 2, z ≠ 0");
  });
  it("degree, infinity, sqrt", () => {
    expect(c("30 degree")).toBe("30°");
    expect(c("100 degree Celsius")).toBe("100 °C");
    expect(c("tends to infinity")).toBe("tends to ∞");
    expect(c("sqrt(2)")).toBe("√2");
    expect(c("sqrt(a+b)")).toBe("√(a+b)");
  });
  it("is idempotent and preserves Unicode/Hindi", () => {
    const once = c("8.85 x 10^-12 F/m, epsilon0, विद्युत आवेश");
    expect(c(once)).toBe(once);
    expect(once).toContain("विद्युत आवेश");
  });
  it("flags ambiguous notation", () => {
    expect(findAmbiguous("x^n")).toContain("Unresolved power '^'");
    expect(findAmbiguous("8.85 x 10^-12")).toEqual([]);
  });
});

import { parseBulkText } from "./bulk-questions";

describe("bulk import acceptance (20 questions)", () => {
  const items = [
    ["The permittivity of free space (epsilon0) is", "8.85 x 10^-12 F/m", "ε₀", "8.85 × 10⁻¹² F/m"],
    ["Permeability of free space mu0 equals", "4pi x 10^-7 T m/A", "μ₀", "4π × 10⁻⁷ T m/A"],
    ["Wavelength lambda of light is 500 nm. Frequency?", "6 x 10^14 Hz", "λ", "6 × 10¹⁴ Hz"],
    ["Angle theta = 30 degree, sin theta is", "0.5", "θ = 30°", "0.5"],
    ["Charge on electron", "1.6 x 10^-19 C", "electron", "1.6 × 10⁻¹⁹ C"],
    ["Angular frequency omega = 2pi f. If f = 50 Hz, omega =", "100pi rad/s", "ω = 2π f", "100π rad/s"],
    ["Resistivity rho has unit", "ohm m", "ρ", "ohm m"],
    ["Surface charge density sigma unit", "C/m^2", "σ", "C/m²"],
    ["Electric flux phi through closed surface is", "q/epsilon_0", "φ", "q/ε₀"],
    ["Speed of light c is", "3 x 10^8 m/s", "c is", "3 × 10⁸ m/s"],
    ["If x >= 2 and x <= 5 and x != 3", "x = 4", "≥ 2", "x = 4"],
    ["Value of sqrt(2) is approximately", "1.414", "√2", "1.414"],
    ["As r tends to infinity, potential", "0", "∞", "0"],
    ["Water boils at", "100 degree Celsius", "boils", "100 °C"],
    ["Alpha particle consists of", "2 protons and 2 neutrons", "α particle", "2 protons and 2 neutrons"],
    ["Area of circle = pi r^2. For r = 2,", "4pi", "π r²", "4π"],
    ["Planck constant h is", "6.63 x 10^-34 J s", "h is", "6.63 × 10⁻³⁴ J s"],
    ["Avogadro number", "6.022 x 10^23", "Avogadro", "6.022 × 10²³"],
    ["Gravitational constant G", "6.67 x 10^-11 N m^2/kg^2", "G", "6.67 × 10⁻¹¹ N m²/kg²"],
    ["Coulomb constant 1/(4 pi epsilon0) equals", "9 x 10^9 N m^2/C^2", "1/(4 π ε₀)", "9 × 10⁹ N m²/C²"],
  ];
  const text = items
    .map(([q, a], i) => `Q${i + 1}. ${q}\nA. ${a}\nB. none\nC. both\nD. zero\nAnswer: ${"ABCD"[i % 4]}`)
    .join("\n\n");
  const drafts = parseBulkText(text);
  it("keeps every question, option and answer", () => {
    expect(drafts).toHaveLength(20);
    drafts.forEach((d, i) => {
      expect(d.options_en.filter(Boolean)).toHaveLength(4);
      expect(d.correct_option).toBe(i % 4);
    });
  });
  it("corrects symbols in questions and options", () => {
    drafts.forEach((d, i) => {
      expect(d.question_en).toContain(items[i]![2]);
      expect(d.options_en[0]).toBe(items[i]![3]);
    });
  });
});
