import { axisParser } from './axis';

describe('axisParser', () => {
  it('parses a P2M debit', () => {
    const body =
      'INR 6800.00 debited\nA/c no. XX1994\n07-09-26, 11:01:15\n' +
      'UPI/P2M/313051540148/Thanvir Bros Pvt Lt\n' +
      'Not you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank';
    expect(axisParser.parse(body)).toEqual({
      amount: 6800,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '1994',
      bankLabel: 'Axis',
      merchant: 'Thanvir Bros Pvt Lt',
      date: '2026-09-07',
      dedupKey: 'AXISBK:313051540148',
    });
  });

  it('parses a P2A credit, stripping the trailing bank-code/Paym suffix and IST marker', () => {
    const body =
      'INR 15000.00 credited\nA/c no. XX1994\n03-09-26, 19:20:56 IST\n' +
      'UPI/P2A/881446193797/GUNREDDY /KKBK/Paym - Axis Bank';
    expect(axisParser.parse(body)).toEqual({
      amount: 15000,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '1994',
      bankLabel: 'Axis',
      merchant: 'GUNREDDY',
      date: '2026-09-03',
      dedupKey: 'AXISBK:881446193797',
    });
  });

  it('parses a P2A debit (person-to-person send, not just receive)', () => {
    const body =
      'INR 1.00 debited\nA/c no. XX1994\n10-09-26, 07:30:43\n' +
      'UPI/P2A/671684758099/GUNREDDY VENKAT RED\n' +
      'Not you? SMS BLOCKUPI Cust ID to\n919951860002\nAxis Bank';
    expect(axisParser.parse(body)).toEqual({
      amount: 1,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '1994',
      bankLabel: 'Axis',
      merchant: 'GUNREDDY VENKAT RED',
      date: '2026-09-10',
      dedupKey: 'AXISBK:671684758099',
    });
  });

  it('parses a cash/cheque deposit, including its 4-digit year and 6-digit account tail', () => {
    const body =
      'INR 500.00 credited to Axis Bank A/c no. XX771994 on 09-02-2026 00:31:24.' +
      ' Info-BNA-DEPOSIT/AXIS BANK LIMITED/AXPR/2605. Avl Bal INR 832.61.';
    expect(axisParser.parse(body)).toEqual({
      amount: 500,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '771994',
      bankLabel: 'Axis',
      merchant: 'Deposit',
      date: '2026-02-09',
      dedupKey: 'AXISBK-DEP:500:2026-02-09:771994',
    });
  });

  it('returns null for a PIN-set notification', () => {
    const body =
      'PIN for Axis Bank Debit Card no. XX1968 is set. Ensure card is enabled for' +
      ' online, contactless, intl usage for a seamless experience. Visit https://ccm.axis.bank.in/AXISBK/CuTEqFr2';
    expect(axisParser.parse(body)).toBeNull();
  });

  it('returns null for an app-welcome notice', () => {
    const body = 'Welcome to the Axis Mobile App! Current Txn. Limit: INR 50,000. Will be upgraded to INR 2 lakhs after 24 hrs.';
    expect(axisParser.parse(body)).toBeNull();
  });

  it('returns null for a new-device login alert', () => {
    const body = 'You have just logged into Internet Banking from a new device or browser. Call 18001035577, if not initiated by you - Axis Bank';
    expect(axisParser.parse(body)).toBeNull();
  });

  it('returns null for a transfer-limit-change alert', () => {
    const body = 'Your overall fund transfer limit has been reduced to INR 50,000. Limit can be increased after 1 Day. For any queries, call us on 18001055577 (Toll Free) - Axis Bank';
    expect(axisParser.parse(body)).toBeNull();
  });

  it('returns null for a security-question-reset alert', () => {
    const body = 'Your security questions have been reset. Pls log in again to set the new security questions & answers - Axis Bank';
    expect(axisParser.parse(body)).toBeNull();
  });
});
