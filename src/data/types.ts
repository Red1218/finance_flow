export type TransactionType = 'EXPENSE' | 'INCOME' | 'TRANSFER_OUT' | 'TRANSFER_IN';
export type CategoryKind = 'EXPENSE' | 'INCOME';

export type AccountType = 'CASH' | 'BANK' | 'CREDIT_CARD' | 'WALLET';
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
  // Bank accounts only: the debit card's last 4 — card swipe and ATM SMS quote
  // the card, not the account number.
  card_mask: string | null;
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
  // Income only: the expense this money was paid back for (a friend's share).
  paid_back_for: string | null;
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
  sms_detection_enabled: boolean;
}

// A row of recurring_items used as a monthly bill (see src/domain/bills.ts).
// category_id / account_id / is_paused are unused by the app for now.
export interface Bill {
  id: string;
  user_id: string;
  name: string;
  amount: number | string;
  currency_code: string;
  cadence: BudgetPeriod;
  due_day: number;
  next_due_date: string; // "YYYY-MM-DD"
  category_id: string | null;
  account_id: string | null;
  is_paused: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}
