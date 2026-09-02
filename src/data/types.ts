export type AccountType = 'CASH' | 'BANK' | 'CREDIT_CARD' | 'WALLET';
export type CategoryKind = 'EXPENSE' | 'INCOME';
export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT';
export type BudgetPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency_code: string;
  opening_balance: number | string;
  is_default: boolean;
  mask: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  kind: CategoryKind;
  is_system: boolean;
  icon_name: string | null;
  color_hex: string | null;
  archived_at: string | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  amount: number | string;
  currency_code: string;
  description: string | null;
  occurred_at: string;
  transfer_group_id: string | null;
  archived_at: string | null;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  amount: number | string;
  currency_code: string;
  period_kind: BudgetPeriod;
  start_date: string;
  end_date: string;
  archived_at: string | null;
}

export interface Preferences {
  id: string;
  user_id: string;
  theme: 'SYSTEM' | 'LIGHT' | 'DARK';
  currency_code: string;
  week_start: 'MONDAY' | 'SUNDAY';
  decimal_precision: number;
  default_expense_category_id: string | null;
  default_income_category_id: string | null;
  budget_alerts_enabled: boolean;
  daily_reminder_enabled: boolean;
  reminder_time: string | null;
}

export interface RecurringItem {
  id: string;
  user_id: string;
  name: string;
  category_id: string | null;
  account_id: string | null;
  amount: number | string;
  currency_code: string;
  cadence: BudgetPeriod;
  next_due_date: string;
  is_paused: boolean;
  archived_at: string | null;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number | string;
  saved_amount: number | string;
  monthly_target: number | string | null;
  currency_code: string;
  is_paused: boolean;
  archived_at: string | null;
}
