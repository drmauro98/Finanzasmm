"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useHousehold } from "./HouseholdProvider";
import { monthLabel, money } from "@/lib/format";
import type { RecurringItem, Transaction } from "@/lib/types";

const num = (s: string) => Number(String(s).replace(/[^\d]/g, "")) || 0;

interface Row {
  item: RecurringItem;
  amount: string;
  include: boolean;
  loaded: boolean;
}

/**
 * Carga con un clic los gastos fijos del mes (arriendo, mamá, carro...).
 * Los que son porcentaje (diezmo 10%) se calculan sobre los ingresos del mes,
 * sin contar reembolsos.
 */
export default function RecurringLoader({ month, txs, onSaved }: { month: string; txs: Transaction[]; onSaved: () => void }) {
  const { supabase, household, categoryById } = useHousehold();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);

  const income = txs
    .filter((t) => {
      const c = categoryById.get(t.category_id ?? "");
      return t.type === "ingreso" && c?.kind === "ingreso" && c.name !== "Reembolsos";
    })
    .reduce((a, t) => a + t.amount, 0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("recurring_items")
        .select("*")
        .eq("household_id", household.id)
        .eq("active", true)
        .order("created_at");
      const items: RecurringItem[] = (data ?? []).map((i) => ({
        ...i,
        amount: Number(i.amount),
        percent_of_income: i.percent_of_income === null ? null : Number(i.percent_of_income),
      }));
      const hashes = items.map((i) => `fijo-${i.id}-${month}`);
      const { data: existing } = await supabase.from("transactions").select("hash").eq("household_id", household.id).in("hash", hashes);
      const done = new Set((existing ?? []).map((e) => e.hash));
      setRows(
        items.map((item) => {
          const loaded = done.has(`fijo-${item.id}-${month}`);
          const value = item.percent_of_income ? Math.round((income * item.percent_of_income) / 100) : item.amount;
          return { item, amount: String(value), include: !loaded && value > 0, loaded };
        }),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, income]);

  async function save() {
    if (!rows) return;
    const selected = rows.filter((r) => r.include && !r.loaded && num(r.amount) > 0);
    if (!selected.length) return;
    setSaving(true);
    await supabase.from("transactions").upsert(
      selected.map((r) => ({
        household_id: household.id,
        date: `${month}-05`,
        description: r.item.percent_of_income ? `${r.item.name} (${r.item.percent_of_income}% de ${money(income)})` : r.item.name,
        amount: num(r.amount),
        type: "gasto",
        category_id: r.item.category_id,
        account: "Gastos fijos",
        person: r.item.person,
        hash: `fijo-${r.item.id}-${month}`,
      })),
      { onConflict: "household_id,hash", ignoreDuplicates: true },
    );
    setSaving(false);
    onSaved();
  }

  if (!rows) return <div className="card muted">Cargando gastos fijos...</div>;
  if (!rows.length)
    return (
      <div className="card text-sm">
        Aún no tienes gastos fijos configurados.{" "}
        <Link href="/configuracion" className="text-emerald-700 underline">
          Configúralos aquí
        </Link>
        .
      </div>
    );

  const total = rows.filter((r) => r.include && !r.loaded).reduce((a, r) => a + num(r.amount), 0);

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="font-semibold">Gastos fijos de {monthLabel(month, true)}</h2>
        <p className="muted">
          Revisa los valores y guarda. Los porcentajes se calculan sobre los ingresos del mes ({money(income)}); registra primero
          los ingresos.
        </p>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <label key={r.item.id} className={`flex flex-wrap items-center gap-3 text-sm ${r.loaded ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              disabled={r.loaded}
              checked={r.include}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
            />
            <span className="min-w-40 flex-1">
              {r.item.name}
              <span className="ml-2 text-xs text-slate-400">
                {categoryById.get(r.item.category_id ?? "")?.name} · {r.item.person}
                {r.item.percent_of_income ? ` · ${r.item.percent_of_income}% de ingresos` : ""}
              </span>
            </span>
            {r.loaded ? (
              <span className="text-xs text-emerald-700">✓ ya cargado</span>
            ) : (
              <input
                className="input w-36 py-1 text-right"
                inputMode="numeric"
                value={r.amount}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              />
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm">
          Total: <b>{money(total)}</b>
        </span>
        <button className="btn" onClick={save} disabled={saving || total === 0}>
          {saving ? "Guardando..." : "Guardar gastos fijos"}
        </button>
      </div>
    </div>
  );
}
