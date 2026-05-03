const { generateCsv } = require('../src/utils/csvExport');

describe('generateCsv', () => {
  it('generates CSV header row for empty input', () => {
    const csv = generateCsv([]);
    expect(csv).toBe('id,fromAccount,toAccount,amount,currency,type,timestamp,status');
  });

  it('generates data rows for transactions', () => {
    const tx = {
      id: 'txn_1',
      fromAccount: 'ACC-12345',
      toAccount: 'ACC-67890',
      amount: 100.5,
      currency: 'USD',
      type: 'transfer',
      timestamp: '2026-01-01T00:00:00.000Z',
      status: 'pending',
    };
    const lines = generateCsv([tx]).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '"txn_1","ACC-12345","ACC-67890","100.5","USD","transfer","2026-01-01T00:00:00.000Z","pending"'
    );
  });

  it('handles null fromAccount', () => {
    const tx = {
      id: 'txn_2',
      fromAccount: null,
      toAccount: 'ACC-67890',
      amount: 50,
      currency: 'EUR',
      type: 'deposit',
      timestamp: '2026-01-02T00:00:00.000Z',
      status: 'completed',
    };
    expect(generateCsv([tx])).toContain('"","ACC-67890"');
  });
});
