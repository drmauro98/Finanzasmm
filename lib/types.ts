export type CategoryKind = "gasto" | "ingreso" | "ahorro" | "excluido";

export interface Category {
  id: string;
  household_id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  monthly_budget: number;
}

export interface Rule {
  id: string;
  pattern: string;
  category_id: string;
}

export interface Transaction {
  id: string;
  household_id: string;
  date: string;
  description: string;
  amount: number;
  original_amount: number | null;
  installments: string | null;
  type: "gasto" | "ingreso";
  category_id: string | null;
  account: string;
  person: string;
  notes: string | null;
  import_id: string | null;
}

export interface Debt {
  id: string;
  name: string;
  lender: string | null;
  owner: string;
  original_amount: number;
  balance: number;
  monthly_payment: number;
  monthly_rate: number;
  installments_left: number;
  active: boolean;
  notes: string | null;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  monthly_contribution: number;
}

export interface Member {
  user_id: string;
  display_name: string;
}
