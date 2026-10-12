import { idfcParser } from './idfc';

describe('idfcParser', () => {
  it('parses a UPI debit', () => {
    const body =
      'Your A/c XX8102 debited by Rs. 196.00 on 04/10/26; Ola Cabs credited. RRN 037082377631. Available balance Rs. 977.36. Team IDFC FIRST Bank';
    expect(idfcParser.parse(body)).toEqual({
      amount: 196,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '8102',
      bankLabel: 'IDFC',
      merchant: 'Ola Cabs',
      date: '2026-10-04',
      dedupKey: 'IDFCFB:037082377631',
    });
  });

  it('parses a debit with a thousands separator', () => {
    const body =
      'Your A/c XX8102 debited by Rs. 1,885.64 on 01/10/26; Bharti Airtel Limite credited. RRN 559653093973. Available balance Rs. 6,773.36. Team IDFC FIRST Bank';
    expect(idfcParser.parse(body)).toMatchObject({ amount: 1885.64, merchant: 'Bharti Airtel Limite' });
  });

  it('parses a credit, keying it on amount, date and resulting balance (no reference in the message)', () => {
    const body =
      'Your A/C XXXXX708102 is credited with INR 1,000.00 on 01/10/26 17:00. Your new balance is INR 4,673.36. Team IDFC FIRST Bank';
    expect(idfcParser.parse(body)).toEqual({
      amount: 1000,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '8102',
      bankLabel: 'IDFC',
      merchant: '',
      date: '2026-10-01',
      dedupKey: 'IDFCFB-CR:1000:2026-10-01:4673.36',
    });
  });

  it('parses an IMPS transfer out, which only shows the last 3 digits of each account', () => {
    const body =
      'Your a/c ending XXXXXXXX102 is debited by Rs. 7000.00 on 01-Oct-26 and a/c ending XXXXXXX721 credited (IMPS Ref no 627414917392 ). Team IDFC FIRST Bank';
    expect(idfcParser.parse(body)).toEqual({
      amount: 7000,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '102',
      bankLabel: 'IDFC',
      merchant: 'A/c ending 721',
      date: '2026-10-01',
      dedupKey: 'IDFCFB:627414917392',
    });
  });

  it('parses an IMPS credit from an account linked to a mobile number', () => {
    const body =
      'Your a/c no. XXXXXXXX102 is credited by Rs. 1.00 on 18-Aug-26 by a/c linked to mobile XXXXXXXXX336 (IMPS Ref no 623006914929 ). Team IDFC FIRST Bank';
    expect(idfcParser.parse(body)).toEqual({
      amount: 1,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '102',
      bankLabel: 'IDFC',
      merchant: '',
      date: '2026-08-18',
      dedupKey: 'IDFCFB:623006914929',
    });
  });

  it('ignores non-transaction messages', () => {
    expect(idfcParser.parse('Your OTP is 123456. Team IDFC FIRST Bank')).toBeNull();
  });
});
