const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export const money = (n: number | null | undefined) => cop.format(Math.round(Number(n ?? 0)));

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** "2026-09" -> "sep 2026" */
export const monthLabel = (ym: string, long = false) => {
  const [y, m] = ym.split("-").map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
};

export const currentMonth = () => new Date().toISOString().slice(0, 7);

/** Suma (o resta) meses a "YYYY-MM" */
export const addMonths = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

/** Primer y último día de un mes "YYYY-MM" en formato ISO */
export const monthRange = (ym: string) => {
  const start = `${ym}-01`;
  const end = `${addMonths(ym, 1)}-01`;
  return { start, end };
};
