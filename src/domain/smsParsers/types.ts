export interface ParsedTransaction {
  amount: number;
  direction: 'debit' | 'credit';
  accountType: 'bank_account' | 'credit_card';
  accountLast4: string;
  bankLabel: string; // display only, e.g. 'Kotak', 'Axis' — never used for account matching
  merchant: string;
  date: string; // 'YYYY-MM-DD'
  dedupKey: string;
}

export interface BankParser {
  bankCode: string; // substring match against the SMS sender header, e.g. 'KOTAKB'
  parse(body: string): ParsedTransaction | null;
}
