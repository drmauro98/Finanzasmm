"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useHousehold } from "@/components/HouseholdProvider";
import Stat from "@/components/Stat";
import { fetchTransactions, summarize } from "@/lib/data";
import { simulateDebt } from "@/lib/debts";
import { addMonths, currentMonth, monthLabel, monthRange, money } from "@/lib/format";
import type { Debt } from "@/lib/types";

const short = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
const num = (s: string) => Number(String(s).replace(/[^\d]/g, "")) || 0;

export default function ProyeccionesPage() {
  const { supabase, household, categoryById } = useHousehold();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [history, setHistory] = useState<{ ym: string; ingresos: number; gastos: number }[] | null>(null);
  const [income, setIncome] = useState("");
  const [expenses, setExpenses] = useState("");
  const [saving, setSaving] = useState("");
  const [horizon, setHorizon] = useState(12);
  const [debtsIncluded, setDebtsIncluded] = useState(true);

  useEffect(() => {
    (async () => {
      const now = currentMonth();
      const [txs, d, g] = await Promise.all([
        fetchTransactions(supabase, household.id, monthRange(addMonths(now, -6)).start, monthRange(now).end),
        supabase.from("debts").select("*").eq("household_id", household.id).eq("active", true),
        supabase.from("savings_goals").select("monthly_contribution").eq("household_id", household.id),
      ]);
      const months = Array.from({ length: 7 }, (_, i) => addMonths(now, i - 6))
        .map((ym) => {
          const s = summarize(
            txs.filter((t) => t.date.startsWith(ym)),
            categoryById,
          );
          return { ym, ingresos: s.ingresos, gastos: s.gastos };
        })
        .filter((m) => m.ingresos || m.gastos);
      setHistory(months);
      setDebts((d.data ?? []).map((x) => ({ ...x, balance: Number(x.balance), monthly_payment: Number(x.monthly_payment), monthly_rate: Number(x.monthly_rate) })));

      // Promedio de los últimos 3 meses con datos como punto de partida
      const last = months.slice(-3);
      const avg = (k: "ingresos" | "gastos") => (last.length ? last.reduce((a, m) => a + m[k], 0) / last.length : 0);
      setIncome(String(Math.round(avg("ingresos"))));
      setExpenses(String(Math.round(avg("gastos"))));
      setSaving(String(Math.round((g.data ?? []).reduce((a, x) => a + Number(x.monthly_contribution), 0))));
    })();
  }, [supabase, household.id, categoryById]);

  const projection = useMemo(() => {
    const start = addMonths(currentMonth(), 1);
    const sims = debts.map((d) => ({ d, sim: simulateDebt(d, horizon) }));
    const currentPayments = debts.reduce((a, d) => a + (d.balance > 0 ? d.monthly_payment : 0), 0);
    let acumulado = 0;
    return Array.from({ length: horizon }, (_, i) => {
      const payments = sims.reduce((a, s) => a + s.sim[i].payment, 0);
      const deuda = sims.reduce((a, s) => a + s.sim[i].balance, 0);
      const ending = sims.filter((s) => s.sim[i].payment > 0 && (s.sim[i + 1]?.payment ?? 0) === 0 && s.sim[i].balance <= 0.5);
      // Si el gasto promedio ya incluye las cuotas, al terminar una deuda ese dinero queda libre
      const gastos = debtsIncluded ? num(expenses) - currentPayments + payments : num(expenses) + payments;
      const sobra = num(income) - gastos - num(saving);
      acumulado += sobra;
      return {
        ym: addMonths(start, i),
        mes: monthLabel(addMonths(start, i)),
        ingresos: num(income),
        gastos,
        cuotas: payments,
        sobra,
        acumulado,
        deuda,
        termina: ending.map((s) => s.d.name),
      };
    });
  }, [debts, horizon, income, expenses, saving, debtsIncluded]);

  const last = projection[projection.length - 1];
  const freed = projection.length ? projection[0].cuotas - last.cuotas : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Proyecciones</h1>
        <p className="muted">¿Cómo vamos a estar en los próximos meses si seguimos así? Cambia los valores para simular.</p>
      </div>

      <div className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label">Ingreso mensual</label>
          <input className="input" inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value)} />
          <p className="muted mt-1">{money(num(income))}</p>
        </div>
        <div>
          <label className="label">Gasto mensual promedio</label>
          <input className="input" inputMode="numeric" value={expenses} onChange={(e) => setExpenses(e.target.value)} />
          <p className="muted mt-1">{money(num(expenses))}</p>
        </div>
        <div>
          <label className="label">Ahorro mensual (metas)</label>
          <input className="input" inputMode="numeric" value={saving} onChange={(e) => setSaving(e.target.value)} />
          <p className="muted mt-1">{money(num(saving))}</p>
        </div>
        <div>
          <label className="label">Meses a proyectar</label>
          <select className="input" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            {[6, 12, 18, 24, 36].map((h) => (
              <option key={h} value={h}>
                {h} meses
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2 lg:col-span-4">
          <input type="checkbox" className="mt-1" checked={debtsIncluded} onChange={(e) => setDebtsIncluded(e.target.checked)} />
          <span>
            El gasto promedio <b>ya incluye</b> las cuotas de las deudas (cuando importas los extractos y registras la cuota del carro,
            sí las incluye). Al terminar cada deuda, esa plata queda libre.
          </span>
        </label>
        {history && (
          <p className="muted sm:col-span-2 lg:col-span-4">
            {history.length
              ? `Valores sugeridos con el promedio de: ${history
                  .slice(-3)
                  .map((h) => monthLabel(h.ym))
                  .join(", ")}.`
              : "Aún no hay movimientos: escribe los valores a mano."}
          </p>
        )}
      </div>

      {last && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Sobra el próximo mes"
            value={money(projection[0].sobra)}
            tone={projection[0].sobra >= 0 ? "good" : "bad"}
          />
          <Stat
            label={`Acumulado en ${horizon} meses`}
            value={money(last.acumulado)}
            tone={last.acumulado >= 0 ? "good" : "bad"}
          />
          <Stat label={`Deuda en ${monthLabel(last.ym)}`} value={money(last.deuda)} />
          <Stat label="Cuotas que se liberan" value={money(freed)} hint="al mes, al final del periodo" tone="good" />
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold">Proyección mes a mes</h2>
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={projection}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" fontSize={12} />
              <YAxis tickFormatter={short} fontSize={12} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Legend />
              <Bar dataKey="sobra" name="Sobra / falta en el mes" radius={[4, 4, 0, 0]}>
                {projection.map((p) => (
                  <Cell key={p.ym} fill={p.sobra >= 0 ? "#10b981" : "#f87171"} />
                ))}
              </Bar>
              <Line dataKey="acumulado" name="Acumulado" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line dataKey="deuda" name="Deuda total" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="text-right">Ingresos</th>
              <th className="text-right">Gastos</th>
              <th className="text-right">Cuotas deudas</th>
              <th className="text-right">Sobra</th>
              <th className="text-right">Acumulado</th>
              <th>Eventos</th>
            </tr>
          </thead>
          <tbody>
            {projection.map((p) => (
              <tr key={p.ym}>
                <td className="capitalize">{p.mes}</td>
                <td className="text-right">{money(p.ingresos)}</td>
                <td className="text-right">{money(p.gastos)}</td>
                <td className="text-right">{money(p.cuotas)}</td>
                <td className={`text-right font-medium ${p.sobra >= 0 ? "text-emerald-700" : "text-red-600"}`}>{money(p.sobra)}</td>
                <td className="text-right">{money(p.acumulado)}</td>
                <td className="text-xs">{p.termina.map((n) => `🎉 Última cuota: ${n}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
