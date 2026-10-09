"use client";

import { addMonths, monthLabel } from "@/lib/format";

export default function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white p-1">
      <button className="rounded-md px-2 py-1 hover:bg-slate-100" onClick={() => onChange(addMonths(value, -1))} aria-label="Mes anterior">
        ‹
      </button>
      <span className="min-w-28 text-center text-sm font-medium capitalize">{monthLabel(value, true)}</span>
      <button className="rounded-md px-2 py-1 hover:bg-slate-100" onClick={() => onChange(addMonths(value, 1))} aria-label="Mes siguiente">
        ›
      </button>
    </div>
  );
}
