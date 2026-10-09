import type { Category, Rule } from "./types";

export const normalizeText = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Devuelve la categoría sugerida para una descripción usando las reglas
 * ("si contiene X => categoría Y"). Gana la regla más específica (la más larga).
 */
export function makeCategorizer(rules: Rule[], categories: Category[]) {
  const sorted = [...rules]
    .map((r) => ({ ...r, p: normalizeText(r.pattern) }))
    .filter((r) => r.p.length > 0)
    .sort((a, b) => b.p.length - a.p.length);
  const byName = new Map(categories.map((c) => [c.name, c.id]));

  return (description: string, type: "gasto" | "ingreso", source: "tarjeta" | "cuenta" = "cuenta"): string | null => {
    const text = normalizeText(description);
    const hit = sorted.find((r) => text.includes(r.p));
    if (hit) return hit.category_id;
    // Si en una tarjeta entra plata y no hay regla, casi siempre es un pago a la tarjeta
    if (type === "ingreso" && source === "tarjeta") return byName.get("Pago de tarjeta") ?? null;
    return null;
  };
}

/** Sugiere un patrón para una regla nueva a partir de una descripción ("BOLD SA*PASTELER 123" -> "BOLD SA*PASTELER") */
export function suggestPattern(description: string) {
  return normalizeText(description)
    .replace(/\b\d[\d\s.,-]*\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}
