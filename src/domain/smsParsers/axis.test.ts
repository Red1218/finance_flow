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

  it('parses a UPI AutoPay debit, which names no account number', () => {
    const body =
      'Your A/c has been debited towards NETFLIX for INR 199.00 on 08-10-26. 5277b18e9a6340b1af0d1bf4c008e5d1@ybl - Axis Bank';
    expect(axisParser.parse(body)).toEqual({
      amount: 199,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '',
      bankLabel: 'Axis',
      merchant: 'NETFLIX',
      date: '2026-10-08',
      dedupKey: 'AXISBK-AP:5277b18e9a6340b1af0d1bf4c008e5d1@ybl:2026-10-08',
    });
  });

  it('parses a one-line card/UPI debit that puts the merchant before the date', () => {
    const body =
      'INR 995.00 debited from A/c no. XX771994 on SRI MAHADEV 10-10-2026 14:57:30 IST. Avl bal: INR 8831.09. Not you? SMS BLOCKCARD XX1968 to +919951860002 - Axis Bank';
    expect(axisParser.parse(body)).toEqual({
      amount: 995,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '1994',
      bankLabel: 'Axis',
      merchant: 'SRI MAHADEV',
      date: '2026-10-10',
      dedupKey: 'AXISBK-DR:995:2026-10-10:8831.09',
    });
  });

  it('parses a one-line IMPS credit', () => {
    const body =
      'INR 12000.00 credited to A/c no. XX1994 at 09-10-26 10:18:25 IST\r\nRef: IMPS/P2A/628210326621/RAVI\r\nFor any details, call 18001035577 - Axis Bank';
    expect(axisParser.parse(body)).toEqual({
      amount: 12000,
      direction: 'credit',
      accountType: 'bank_account',
      accountLast4: '1994',
      bankLabel: 'Axis',
      merchant: 'RAVI',
      date: '2026-10-09',
      dedupKey: 'AXISBK:628210326621',
    });
  });

  it('parses a multi-line "Debit INR …" message', () => {
    const body =
      'Debit INR 500.00\r\nAxis Bank A/c XX1994\r\n01-10-26 22:48:13\r\nEBDP-RD/926050085107410/GU\r\nWhatsApp BAL to 917036165000\r\nNot You? SMS BLOCKALL CustID to 919951860002';
    expect(axisParser.parse(body)).toEqual({
      amount: 500,
      direction: 'debit',
      accountType: 'bank_account',
      accountLast4: '1994',
      bankLabel: 'Axis',
      merchant: 'EBDP-RD',
      date: '2026-10-01',
      dedupKey: 'AXISBK:926050085107410',
    });
  });

  it('ignores mandate set-up and upcoming-debit notices', () => {
    expect(axisParser.parse('Your UPI-Mandate mandate has been successfully created towards Google from 12-10-26 to 12-10-31 for INR 59.00 - Axis Bank')).toBeNull();
    expect(axisParser.parse('For the upcoming mandate set for 13-10-26, INR 59.00 will be debited from your A/c towards Google for NETFLIX, 1. To stop execution, pause mandate - Axis Bank')).toBeNull();
  });
});
