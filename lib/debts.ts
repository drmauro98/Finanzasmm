import type { Debt } from "./types";

export interface DebtMonth {
  balance: number;
  payment: number;
  interest: number;
}

/**
 * Simula mes a mes una deuda: cada mes se cobra interés sobre el saldo y la cuota abona a capital.
 * Si la deuda tiene "cuotas restantes", se asume que termina exactamente en esa cuota.
 */
export function simulateDebt(d: Debt, months: number): DebtMonth[] {
  const out: DebtMonth[] = [];
  let balance = Number(d.balance);
  let left = d.installments_left > 0 ? d.installments_left : Infinity;
  const rate = Number(d.monthly_rate) / 100;
  for (let i = 0; i < months; i++) {
    if (balance <= 0.5 || left <= 0 || !d.active) {
      out.push({ balance: 0, payment: 0, interest: 0 });
      continue;
    }
    const interest = balance * rate;
    let payment = Math.min(Number(d.monthly_payment), balance + interest);
    if (left === 1) payment = balance + interest; // última cuota: liquida el saldo
    if (payment <= 0) {
      out.push({ balance, payment: 0, interest });
      continue;
    }
    balance = Math.max(0, balance + interest - payment);
    left--;
    out.push({ balance, payment, interest });
  }
  return out;
}

/** Cuántos meses faltan para terminar de pagar (máx. 600) */
export function monthsToPayoff(d: Debt): number | null {
  if (Number(d.balance) <= 0) return 0;
  if (Number(d.monthly_payment) <= 0) return null;
  const sim = simulateDebt(d, 600);
  const idx = sim.findIndex((m) => m.payment === 0 || m.balance <= 0.5);
  if (idx === -1) return null;
  return sim[idx].payment === 0 ? idx : idx + 1;
}
