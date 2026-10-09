"use client";

import { useEffect, useState } from "react";
import { currentMonth } from "./format";

const KEY = "finanzas-mes";

/** Mes seleccionado ("YYYY-MM"), compartido entre pantallas y recordado en el navegador */
export function useMonth(): [string, (m: string) => void, boolean] {
  const [month, setMonthState] = useState(currentMonth());
  const [fromStorage, setFromStorage] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && /^\d{4}-\d{2}$/.test(saved)) {
        setMonthState(saved);
        setFromStorage(true);
      }
    } catch {}
  }, []);
  const setMonth = (m: string) => {
    setMonthState(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {}
  };
  return [month, setMonth, fromStorage];
}
