import * as XLSX from "xlsx";

/**
 * Lector de extractos bancarios (Excel / CSV).
 *
 * Detecta automáticamente la fila de encabezados buscando columnas como
 * "Fecha", "Movimientos/Descripción" y "Valor". Funciona con el extracto
 * detallado de tarjetas Bancolombia (Visa/Master), con extractos de cuentas
 * de ahorro y con casi cualquier CSV que tenga esas tres columnas.
 * Las columnas extra (por ejemplo el "cuadrito" de categorías que hacían a
 * mano al lado) se ignoran.
 */

export type StatementKind = "tarjeta" | "cuenta";

export interface ColumnMap {
  headerRow: number;
  date: number;
  description: number;
  amount: number; // -1 si el extracto trae débito/crédito por separado
  debit: number;
  credit: number;
  installmentAmount: number;
  installments: number;
  auth: number;
}

export interface ParsedRow {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // siempre positivo: lo que cuenta en el mes
  originalAmount: number | null;
  installments: string | null;
  type: "gasto" | "ingreso";
  ref: string; // nro de autorización u orden en el archivo (para no duplicar)
}

export interface ParsedSheet {
  name: string;
  rows: unknown[][];
  columns: ColumnMap | null;
  kind: StatementKind;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function readWorkbook(data: ArrayBuffer, fileName = ""): ParsedSheet[] {
  const isText = /\.(csv|txt|tsv)$/i.test(fileName) || !looksBinary(data);
  const wb = isText
    ? // En CSV leemos el texto nosotros (acentos bien) y sin que SheetJS adivine números: "-150.000,00" no es -150
      XLSX.read(decodeText(data), { type: "string", raw: true })
    : XLSX.read(data, { type: "array", cellDates: false });
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
    });
    const columns = detectColumns(rows);
    const kind: StatementKind = columns && (columns.installments >= 0 || columns.installmentAmount >= 0) ? "tarjeta" : "cuenta";
    return { name, rows, columns, kind };
  });
}

/** Los .xlsx empiezan por "PK" (zip) y los .xls por D0 CF 11 E0 */
function looksBinary(data: ArrayBuffer) {
  const b = new Uint8Array(data.slice(0, 4));
  return (b[0] === 0x50 && b[1] === 0x4b) || (b[0] === 0xd0 && b[1] === 0xcf);
}

function decodeText(data: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(data);
  // Si no es UTF-8 válido, probablemente viene de Excel en Windows (latin-1)
  return utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(data) : utf8.replace(/^\uFEFF/, "");
}

function findCol(header: string[], patterns: RegExp[], exclude?: RegExp): number {
  for (const p of patterns) {
    const i = header.findIndex((h) => p.test(h) && !(exclude && exclude.test(h)));
    if (i >= 0) return i;
  }
  return -1;
}

export function detectColumns(rows: unknown[][]): ColumnMap | null {
  const limit = Math.min(rows.length, 80);
  for (let r = 0; r < limit; r++) {
    const header = (rows[r] ?? []).map(norm);
    const date = findCol(header, [/^fecha( de)?( transaccion| movimiento| compra)?$/, /^fecha/]);
    const description = findCol(header, [/^movimientos?$/, /descripcion/, /concepto/, /detalle/, /establecimiento/, /comercio/]);
    const amount = findCol(header, [/^valor movimiento$/, /^valor( original| total)?$/, /^monto/, /^importe/, /^valor/], /cuota|saldo/);
    const debit = findCol(header, [/debito/, /^cargos?$/, /retiro/]);
    const credit = findCol(header, [/credito/, /^abonos?$/, /deposito/]);
    if (date < 0 || description < 0 || (amount < 0 && debit < 0 && credit < 0)) continue;
    return {
      headerRow: r,
      date,
      description,
      amount,
      debit: amount >= 0 ? -1 : debit,
      credit: amount >= 0 ? -1 : credit,
      installmentAmount: findCol(header, [/valor cuota/, /^cuota mes/]),
      installments: findCol(header, [/numero de cuotas/, /^cuotas$/, /^cuota$/]),
      auth: findCol(header, [/autorizacion/, /^documento/, /^dcto/, /^referencia/]),
    };
  }
  return null;
}

/** Convierte "141.688,51", "9,648,444.00", "$37.267", "(1.000)", 12345 a número */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$\s]|COP|USD/gi, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // El separador que aparece de último es el decimal
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    normalized = s.split(thou).join("").replace(dec, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const tail = parts[parts.length - 1];
    // "1.234.567" o "1,234" => miles ; "12,5" o "141688,51" => decimal
    const isThousands = parts.length > 2 || tail.length === 3;
    normalized = isThousands ? parts.join("") : parts.slice(0, -1).join("") + "." + tail;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) =>
  y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null;

/** Convierte fechas de Excel (número), "30/09/2026", "2026-09-30", "30 sep 2026" a YYYY-MM-DD */
export function parseDate(v: unknown): string | null {
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null;
    // Fecha serial de Excel: días desde el 30/12/1899
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = norm(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return iso(y, +m[2], +m[1]); // Colombia: día/mes/año
  }
  m = s.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z.]*[\s-]+(\d{4})/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  return null;
}

export interface ExtractOptions {
  kind: StatementKind;
  /** En tarjetas: usar el valor de la cuota del mes en vez del valor total de la compra */
  useInstallmentValue: boolean;
}

export function extractRows(sheet: ParsedSheet, columns: ColumnMap, opts: ExtractOptions): ParsedRow[] {
  const out: ParsedRow[] = [];
  for (let r = columns.headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const date = parseDate(row[columns.date]);
    const description = String(row[columns.description] ?? "").replace(/\s+/g, " ").trim();
    if (!date || !description) continue;

    let signed: number | null;
    if (columns.amount >= 0) {
      signed = parseAmount(row[columns.amount]);
    } else {
      const debit = columns.debit >= 0 ? Math.abs(parseAmount(row[columns.debit]) ?? 0) : 0;
      const credit = columns.credit >= 0 ? Math.abs(parseAmount(row[columns.credit]) ?? 0) : 0;
      // Lo tratamos como cuenta: débito = sale plata (negativo)
      signed = credit - debit;
      if (opts.kind === "tarjeta") signed = -signed;
    }
    if (signed === null || signed === 0) continue;

    // Tarjeta: positivo = compra (gasto), negativo = pago/abono/devolución.
    // Cuenta:  negativo = salió plata (gasto), positivo = entró plata (ingreso).
    const isExpense = opts.kind === "tarjeta" ? signed > 0 : signed < 0;
    const full = Math.abs(signed);

    let amount = full;
    let installments: string | null = null;
    if (columns.installments >= 0) {
      const raw = String(row[columns.installments] ?? "").trim();
      installments = raw || null;
    }
    if (opts.kind === "tarjeta" && opts.useInstallmentValue && columns.installmentAmount >= 0) {
      const cuota = parseAmount(row[columns.installmentAmount]);
      if (cuota !== null && cuota !== 0) amount = Math.abs(cuota);
    }

    const auth = columns.auth >= 0 ? String(row[columns.auth] ?? "").trim() : "";
    out.push({
      date,
      description,
      amount: Math.round(amount * 100) / 100,
      originalAmount: amount !== full ? full : null,
      installments,
      type: isExpense ? "gasto" : "ingreso",
      ref: auth && auth !== "000000" ? auth : `r${r}`,
    });
  }
  return out;
}

/** Hash corto y estable para detectar movimientos ya importados */
export function rowHash(account: string, row: ParsedRow): string {
  // La misma compra a cuotas aparece cada mes (6/10, 7/10...): la cuota hace parte de la identidad
  const cuota = row.installments && row.installments !== "1/1" ? row.installments : "";
  const str = [account, row.date, row.description.toUpperCase(), row.originalAmount ?? row.amount, row.ref, cuota]
    .filter((x) => x !== "")
    .join("|");
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Mes al que corresponde un extracto de tarjeta ("YYYY-MM"): el más frecuente entre las compras nuevas
 * (sin cuotas o en la cuota 1). Las cuotas de compras viejas traen su fecha original y no cuentan aquí.
 */
export function guessStatementMonth(rows: ParsedRow[]): string | null {
  const fresh = rows.filter((r) => !r.installments || /^1\//.test(r.installments));
  const pool = fresh.length ? fresh : rows;
  const counts = new Map<string, number>();
  pool.forEach((r) => counts.set(r.date.slice(0, 7), (counts.get(r.date.slice(0, 7)) ?? 0) + 1));
  let best: string | null = null;
  counts.forEach((n, m) => {
    if (!best || n > counts.get(best)! || (n === counts.get(best)! && m > best)) best = m;
  });
  return best;
}
