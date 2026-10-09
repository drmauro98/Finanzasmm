"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useHousehold } from "@/components/HouseholdProvider";
import { makeCategorizer, suggestPattern } from "@/lib/categorize";
import { money } from "@/lib/format";
import {
  detectColumns,
  extractRows,
  guessStatementMonth,
  readWorkbook,
  rowHash,
  type ColumnMap,
  type ParsedRow,
  type ParsedSheet,
  type StatementKind,
} from "@/lib/parser";
import type { Rule } from "@/lib/types";

interface PreviewRow extends ParsedRow {
  bookDate: string; // fecha con la que cuenta en el dashboard (cuotas viejas => mes del extracto)
  hash: string;
  category_id: string | null;
  include: boolean;
  duplicate: boolean;
  manual: boolean; // el usuario cambió la categoría a mano
}

const colLetter = (i: number) => (i < 0 ? "—" : String.fromCharCode(65 + (i % 26)).repeat(Math.floor(i / 26) + 1));

/** "Extracto_202609_Visa_Detallado_4018.xlsx" -> "Visa 4018" */
function guessAccount(fileName: string) {
  const brand = /visa/i.test(fileName) ? "Visa" : /master/i.test(fileName) ? "Mastercard" : /nu/i.test(fileName) ? "Nu" : "";
  const last4 = fileName.match(/(\d{4})(?=\D*$)/)?.[1] ?? "";
  return [brand, last4].filter(Boolean).join(" ") || fileName.replace(/\.[^.]+$/, "").slice(0, 30);
}

export default function ImportPage() {
  const { supabase, household, user, me, people, categories, categoryById } = useHousehold();
  const [rules, setRules] = useState<Rule[]>([]);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [columns, setColumns] = useState<ColumnMap | null>(null);
  const [kind, setKind] = useState<StatementKind>("tarjeta");
  const [useInstallment, setUseInstallment] = useState(true);
  const [statementMonth, setStatementMonth] = useState(""); // "" = detectar automáticamente
  const [person, setPerson] = useState(me?.display_name ?? "Familia");
  const [account, setAccount] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [rememberRules, setRememberRules] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("category_rules")
      .select("id,pattern,category_id")
      .eq("household_id", household.id)
      .then(({ data }) => setRules(data ?? []));
  }, [supabase, household.id]);

  const categorize = useMemo(() => makeCategorizer(rules, categories), [rules, categories]);
  const sheet = sheets[sheetIdx];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResult("");
    setRows([]);
    try {
      const parsed = readWorkbook(await file.arrayBuffer(), file.name);
      const firstOk = Math.max(0, parsed.findIndex((s) => s.columns));
      setFileName(file.name);
      setStatementMonth("");
      setAccount(guessAccount(file.name));
      setSheets(parsed);
      selectSheet(parsed, firstOk);
    } catch {
      setError("No pudimos leer el archivo. Asegúrate de que sea Excel (.xlsx, .xlsm, .xls) o CSV.");
    }
  }

  function selectSheet(list: ParsedSheet[], idx: number) {
    setSheetIdx(idx);
    setColumns(list[idx]?.columns ?? null);
    setKind(list[idx]?.kind ?? "tarjeta");
  }

  // Cada vez que cambia la configuración, recalculamos la vista previa
  useEffect(() => {
    if (!sheet || !columns) {
      setRows([]);
      return;
    }
    const parsed = extractRows(sheet, columns, { kind, useInstallmentValue: useInstallment });
    const month = kind === "tarjeta" ? statementMonth || guessStatementMonth(parsed) : null;
    if (month && !statementMonth) setStatementMonth(month);
    const preview: PreviewRow[] = parsed.map((r) => ({
      ...r,
      // Cuotas de compras de meses anteriores cuentan en el mes de este extracto
      bookDate: month && r.date < `${month}-01` ? `${month}-01` : r.date,
      hash: rowHash(account, r),
      category_id: categorize(r.description, r.type, kind),
      include: true,
      duplicate: false,
      manual: false,
    }));
    setRows(preview);
    markDuplicates(preview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, columns, kind, useInstallment, account, categorize, statementMonth]);

  async function markDuplicates(preview: PreviewRow[]) {
    const existing = new Set<string>();
    for (let i = 0; i < preview.length; i += 150) {
      const chunk = preview.slice(i, i + 150).map((r) => r.hash);
      const { data } = await supabase.from("transactions").select("hash").eq("household_id", household.id).in("hash", chunk);
      data?.forEach((d) => d.hash && existing.add(d.hash));
    }
    if (existing.size === 0) return;
    setRows((rs) => rs.map((r) => (existing.has(r.hash) ? { ...r, duplicate: true, include: false } : r)));
  }

  function setCategory(i: number, category_id: string) {
    setRows((rs) => {
      const target = rs[i];
      const pattern = suggestPattern(target.description);
      // Aplica la misma categoría a los demás movimientos del mismo comercio
      return rs.map((r, j) =>
        j === i || (!r.manual && suggestPattern(r.description) === pattern)
          ? { ...r, category_id: category_id || null, manual: true }
          : r,
      );
    });
  }

  function updateColumn(key: keyof ColumnMap, value: number) {
    if (!columns) return;
    setColumns({ ...columns, [key]: value });
  }

  async function save() {
    const selected = rows.filter((r) => r.include);
    if (!selected.length) return;
    setSaving(true);
    setError("");
    const { data: imp, error: impErr } = await supabase
      .from("imports")
      .insert({ household_id: household.id, file_name: fileName, account, person, rows_imported: selected.length, created_by: user.id })
      .select("id")
      .single();
    if (impErr || !imp) {
      setError(impErr?.message ?? "Error creando la importación");
      setSaving(false);
      return;
    }
    const payload = selected.map((r) => ({
      household_id: household.id,
      date: r.bookDate,
      description: r.description,
      notes: r.bookDate !== r.date ? `Compra original del ${r.date}` : null,
      amount: r.amount,
      original_amount: r.originalAmount,
      installments: r.installments,
      type: r.type,
      category_id: r.category_id,
      account,
      person,
      import_id: imp.id,
      hash: r.hash,
    }));
    const { error: txErr } = await supabase
      .from("transactions")
      .upsert(payload, { onConflict: "household_id,hash", ignoreDuplicates: true });
    if (txErr) {
      setError(txErr.message);
      setSaving(false);
      return;
    }

    let learned = 0;
    if (rememberRules) {
      const newRules = new Map<string, string>();
      selected
        .filter((r) => r.manual && r.category_id)
        .forEach((r) => {
          const p = suggestPattern(r.description);
          if (p.length >= 3) newRules.set(p, r.category_id!);
        });
      if (newRules.size) {
        await supabase.from("category_rules").upsert(
          [...newRules].map(([pattern, category_id]) => ({ household_id: household.id, pattern, category_id })),
          { onConflict: "household_id,pattern" },
        );
        learned = newRules.size;
      }
    }
    setSaving(false);
    setRows([]);
    setSheets([]);
    setResult(
      `✅ Se importaron ${selected.length} movimientos de "${account}".` +
        (learned ? ` Aprendimos ${learned} reglas nuevas para la próxima vez.` : ""),
    );
  }

  const included = rows.filter((r) => r.include);
  const totalGastos = included.filter((r) => r.type === "gasto").reduce((a, r) => a + r.amount, 0);
  const sinCategoria = included.filter(
    (r) => !r.category_id || categoryById.get(r.category_id)?.name === "Por verificar",
  ).length;
  const expenseCats = categories.filter((c) => c.kind !== "ingreso");
  const incomeCats = categories.filter((c) => c.kind !== "gasto");
  const headerCells = sheet && columns ? (sheet.rows[columns.headerRow] ?? []).map(String) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Importar extracto</h1>
        <p className="muted">
          Sube el Excel que descargas del banco. Clasificamos cada movimiento automáticamente; tú sólo revisas y guardas.
        </p>
      </div>

      {result && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {result}{" "}
          <Link href="/" className="font-medium underline">
            Ver dashboard
          </Link>
        </div>
      )}

      <div className="card grid gap-4 md:grid-cols-3">
        <div className="md:col-span-3">
          <label className="label">1. Archivo del banco</label>
          <input type="file" accept=".xlsx,.xlsm,.xls,.csv" onChange={onFile} className="input file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-emerald-800" />
          <p className="muted mt-1">
            Si el extracto está en Google Sheets: Archivo → Descargar → Microsoft Excel (.xlsx).
          </p>
        </div>
        {sheets.length > 0 && (
          <>
            <div>
              <label className="label">2. ¿De quién es?</label>
              <select className="input" value={person} onChange={(e) => setPerson(e.target.value)}>
                {people.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">3. Nombre de la tarjeta/cuenta</label>
              <input className="input" value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo de extracto</label>
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as StatementKind)}>
                <option value="tarjeta">Tarjeta de crédito</option>
                <option value="cuenta">Cuenta de ahorros / corriente</option>
              </select>
            </div>
            {sheets.length > 1 && (
              <div>
                <label className="label">Hoja</label>
                <select className="input" value={sheetIdx} onChange={(e) => selectSheet(sheets, Number(e.target.value))}>
                  {sheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      {s.name} {s.columns ? "" : "(sin movimientos detectados)"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {kind === "tarjeta" && (
              <div>
                <label className="label">Mes del extracto</label>
                <input type="month" className="input" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} />
                <p className="muted mt-1">Las cuotas de compras viejas se cuentan en este mes.</p>
              </div>
            )}
            {kind === "tarjeta" && columns && columns.installmentAmount >= 0 && (
              <label className="flex items-start gap-2 text-sm md:col-span-2">
                <input type="checkbox" className="mt-1" checked={useInstallment} onChange={(e) => setUseInstallment(e.target.checked)} />
                <span>
                  Para compras a cuotas, contar sólo <b>la cuota de este mes</b> (recomendado: así el total refleja lo que realmente
                  pagas este mes).
                </span>
              </label>
            )}
          </>
        )}
      </div>

      {sheet && (
        <details className="card" open={!columns}>
          <summary className="cursor-pointer font-medium">
            {columns ? "✅ Columnas detectadas automáticamente (toca para ajustar)" : "⚠️ No reconocimos el formato: indícanos las columnas"}
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div>
              <label className="label">Fila de títulos</label>
              <input
                type="number"
                min={1}
                className="input"
                value={(columns?.headerRow ?? 0) + 1}
                onChange={(e) => {
                  const headerRow = Math.max(0, Number(e.target.value) - 1);
                  const auto = detectColumns(sheet.rows.slice(headerRow, headerRow + 1));
                  setColumns(
                    auto
                      ? { ...auto, headerRow }
                      : { headerRow, date: 0, description: 1, amount: 2, debit: -1, credit: -1, installmentAmount: -1, installments: -1, auth: -1 },
                  );
                }}
              />
            </div>
            {columns &&
              (
                [
                  ["date", "Fecha"],
                  ["description", "Descripción"],
                  ["amount", "Valor"],
                  ["installmentAmount", "Valor cuota"],
                  ["installments", "Nº cuotas"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <select className="input" value={columns[key]} onChange={(e) => updateColumn(key, Number(e.target.value))}>
                    <option value={-1}>—</option>
                    {Array.from({ length: Math.max(headerCells.length, 10) }, (_, i) => (
                      <option key={i} value={i}>
                        {colLetter(i)} {headerCells[i] ? `· ${headerCells[i].slice(0, 20)}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </details>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows.length > 0 && (
        <div className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <b>{included.length}</b> movimientos para importar · gastos {money(totalGastos)}
              {sinCategoria > 0 && <span className="ml-2 text-amber-700">· {sinCategoria} por verificar</span>}
              {rows.some((r) => r.duplicate) && (
                <span className="ml-2 text-slate-500">· {rows.filter((r) => r.duplicate).length} ya estaban importados</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rememberRules} onChange={(e) => setRememberRules(e.target.checked)} />
                Recordar mis cambios de categoría
              </label>
              <button className="btn" onClick={save} disabled={saving || !included.length}>
                {saving ? "Guardando..." : `Guardar ${included.length}`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th className="text-right">Valor</th>
                  <th>Categoría</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.hash + i} className={r.include ? "" : "opacity-40"}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.include}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                      />
                    </td>
                    <td className="whitespace-nowrap">
                      {r.bookDate}
                      {r.bookDate !== r.date && <div className="text-xs text-slate-400">compra: {r.date}</div>}
                    </td>
                    <td>
                      {r.description}
                      {r.installments && r.installments !== "1/1" && <span className="ml-2 text-xs text-slate-500">cuota {r.installments}</span>}
                      {r.duplicate && <span className="ml-2 text-xs text-slate-500">(ya importado)</span>}
                    </td>
                    <td className={`whitespace-nowrap text-right font-medium ${r.type === "ingreso" ? "text-emerald-700" : ""}`}>
                      {r.type === "ingreso" ? "+" : ""}
                      {money(r.amount)}
                      {r.originalAmount && <div className="text-xs font-normal text-slate-400">de {money(r.originalAmount)}</div>}
                    </td>
                    <td>
                      <select
                        className={`input py-1 ${!r.category_id || categoryById.get(r.category_id)?.name === "Por verificar" ? "border-amber-400 bg-amber-50" : ""}`}
                        value={r.category_id ?? ""}
                        onChange={(e) => setCategory(i, e.target.value)}
                      >
                        <option value="">— Sin categoría —</option>
                        {(r.type === "gasto" ? expenseCats : incomeCats).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.kind === "excluido" ? " (no cuenta)" : ""}
                          </option>
                        ))}
                      </select>
                      {r.category_id && categoryById.get(r.category_id)?.kind === "excluido" && (
                        <div className="mt-1 text-xs text-slate-400">No suma en los totales de la familia</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sheet && columns && rows.length === 0 && (
        <p className="muted">No encontramos movimientos con fecha y valor en esta hoja. Revisa las columnas arriba.</p>
      )}
    </div>
  );
}
