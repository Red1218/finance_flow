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
  // receivedAt: when the SMS arrived — the date for messages that carry none.
  parse(body: string, receivedAt?: Date): ParsedTransaction | null;
}
