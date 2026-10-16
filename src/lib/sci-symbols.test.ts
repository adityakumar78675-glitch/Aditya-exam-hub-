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
