"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useHousehold } from "@/components/HouseholdProvider";
import MonthPicker from "@/components/MonthPicker";
import Stat from "@/components/Stat";
import { fetchTransactions, summarize } from "@/lib/data";
import { addMonths, monthLabel, monthRange, money } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { useMonth } from "@/lib/useMonth";

const short = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;

const PERSON_COLORS = ["#059669", "#8b5cf6", "#f59e0b", "#0ea5e9"];

export default function Dashboard() {
  const { supabase, household, categories, categoryById } = useHousehold();
  const [month, setMonth, fromStorage] = useMonth();
  const [txs, setTxs] = useState<Transaction[] | null>(null);

  // La primera vez, saltamos al último mes que tenga movimientos
  useEffect(() => {
    if (fromStorage) return;
    supabase
      .from("transactions")
      .select("date")
      .eq("household_id", household.id)
      .order("date", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]) setMonth(data[0].date.slice(0, 7));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromStorage]);

  useEffect(() => {
    setTxs(null);
    const start = monthRange(addMonths(month, -11)).start;
    const end = monthRange(month).end;
    fetchTransactions(supabase, household.id, start, end).then(setTxs);
  }, [supabase, household.id, month]);

  const data = useMemo(() => {
    if (!txs) return null;
    const thisMonth = txs.filter((t) => t.date.startsWith(month));
    const summary = summarize(thisMonth, categoryById);

    const trend = Array.from({ length: 12 }, (_, i) => {
      const ym = addMonths(month, i - 11);
      const s = summarize(
        txs.filter((t) => t.date.startsWith(ym)),
        categoryById,
      );
      return { mes: monthLabel(ym), Ingresos: s.ingresos, Gastos: s.gastos, Saldo: s.saldo };
    }).filter((r, i, arr) => r.Ingresos || r.Gastos || arr.slice(0, i).some((x) => x.Ingresos || x.Gastos));

    const byCategory = [...summary.byCategory.entries()]
      .map(([id, total]) => {
        const c = categoryById.get(id);
        return { name: c?.name ?? "Sin categoría", total, budget: c?.monthly_budget ?? 0, color: c?.color ?? "#94a3b8" };
      })
      .sort((a, b) => b.total - a.total);

    const byPerson = [...summary.byPerson.entries()].map(([name, value]) => ({ name, value }));
    const budgetTotal = categories.filter((c) => c.kind === "gasto").reduce((a, c) => a + c.monthly_budget, 0);
    const top = thisMonth
      .filter((t) => t.type === "gasto" && categoryById.get(t.category_id ?? "")?.kind !== "excluido")
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    return { summary, trend, byCategory, byPerson, budgetTotal, top };
  }, [txs, month, categoryById, categories]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Dashboard</h1>
          <p className="muted">¿Cómo nos fue este mes?</p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {!data ? (
        <p className="muted">Cargando...</p>
      ) : data.summary.ingresos === 0 && data.summary.gastos === 0 ? (
        <div className="card text-center">
          <p className="text-lg">No hay movimientos en {monthLabel(month, true)}.</p>
          <p className="muted mt-1">Empieza importando el extracto del banco de este mes.</p>
          <Link href="/importar" className="btn mt-4">
            📥 Importar extracto
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ingresos" value={money(data.summary.ingresos)} tone="good" />
            <Stat
              label="Gastos"
              value={money(data.summary.gastos)}
              hint={data.budgetTotal ? `${Math.round((data.summary.gastos / data.budgetTotal) * 100)}% del presupuesto` : undefined}
            />
            <Stat label="Ahorro del mes" value={money(data.summary.ahorro)} />
            <Stat
              label={data.summary.saldo >= 0 ? "Nos sobró" : "Nos faltó"}
              value={money(Math.abs(data.summary.saldo))}
              tone={data.summary.saldo >= 0 ? "good" : "bad"}
            />
          </div>

          {data.summary.sinCategoria > 0 && (
            <Link
              href="/movimientos?sin=1"
              className="block rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"
            >
              ⚠️ Hay {data.summary.sinCategoria} movimientos sin categoría este mes. Toca aquí para clasificarlos.
            </Link>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h2 className="mb-3 font-semibold">Gastos por categoría</h2>
              <div style={{ height: Math.max(240, data.byCategory.length * 30) }}>
                <ResponsiveContainer>
                  <BarChart data={data.byCategory} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={short} fontSize={12} />
                    <YAxis type="category" dataKey="name" width={150} fontSize={12} interval={0} />
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Legend />
                    <Bar dataKey="total" name="Gastado" radius={[0, 4, 4, 0]}>
                      {data.byCategory.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Bar>
                    <Bar dataKey="budget" name="Presupuesto" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-6">
              <div className="card">
                <h2 className="mb-3 font-semibold">¿Quién gastó?</h2>
                <div className="h-56">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={data.byPerson} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {data.byPerson.map((p, i) => (
                          <Cell key={p.name} fill={PERSON_COLORS[i % PERSON_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card">
                <h2 className="mb-3 font-semibold">Gastos más grandes</h2>
                <ul className="space-y-2 text-sm">
                  {data.top.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span className="truncate" title={t.description}>
                        {t.description}
                      </span>
                      <span className="shrink-0 font-medium">{money(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold">Historial: ingresos vs. gastos</h2>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={data.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" fontSize={12} />
                  <YAxis tickFormatter={short} fontSize={12} />
                  <Tooltip formatter={(v: number) => money(v)} />
                  <Legend />
                  <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gastos" fill="#f87171" radius={[4, 4, 0, 0]} />
                  <Line dataKey="Saldo" stroke="#334155" strokeWidth={2} dot />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
