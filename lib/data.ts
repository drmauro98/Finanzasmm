import type { createClient } from "./supabase/client";
import type { Category, Transaction } from "./types";

type Client = ReturnType<typeof createClient>;

/** Trae todos los movimientos entre dos fechas (Supabase devuelve máx. 1000 por consulta, así que paginamos) */
export async function fetchTransactions(supabase: Client, householdId: string, start: string, end: string) {
  const pageSize = 1000;
  const all: Transaction[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .gte("date", start)
      .lt("date", end)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(
      ...(data ?? []).map((t) => ({
        ...t,
        amount: Number(t.amount),
        original_amount: t.original_amount === null ? null : Number(t.original_amount),
      })),
    );
    if (!data || data.length < pageSize) break;
  }
  return all;
}

export interface MonthSummary {
  ingresos: number;
  gastos: number;
  ahorro: number;
  saldo: number;
  byCategory: Map<string, number>; // category_id ("" = sin categoría) -> total gasto
  byPerson: Map<string, number>;
  sinCategoria: number;
  /** Gastos en categorías que "no cuentan" (agencia, etc.), por categoría */
  excluded: Map<string, number>;
}

/** Resume los movimientos: excluye pagos de tarjeta y gastos de negocio (categorías "excluido") */
export function summarize(txs: Transaction[], categoryById: Map<string, Category>): MonthSummary {
  const s: MonthSummary = {
    ingresos: 0,
    gastos: 0,
    ahorro: 0,
    saldo: 0,
    byCategory: new Map(),
    byPerson: new Map(),
    sinCategoria: 0,
    excluded: new Map(),
  };
  for (const t of txs) {
    const cat = t.category_id ? categoryById.get(t.category_id) : undefined;
    if (cat?.kind === "excluido") {
      if (t.type === "gasto") s.excluded.set(cat.id, (s.excluded.get(cat.id) ?? 0) + t.amount);
      continue;
    }
    if (!cat) s.sinCategoria++;
    if (cat?.kind === "ahorro") {
      s.ahorro += t.type === "gasto" ? t.amount : -t.amount;
      continue;
    }
    if (t.type === "ingreso") {
      s.ingresos += t.amount;
    } else {
      s.gastos += t.amount;
      const key = t.category_id ?? "";
      s.byCategory.set(key, (s.byCategory.get(key) ?? 0) + t.amount);
      s.byPerson.set(t.person, (s.byPerson.get(t.person) ?? 0) + t.amount);
    }
  }
  s.saldo = s.ingresos - s.gastos - s.ahorro;
  return s;
}
