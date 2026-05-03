const HEADERS = ['id', 'fromAccount', 'toAccount', 'amount', 'currency', 'type', 'timestamp', 'status'];

function generateCsv(transactions) {
  const rows = transactions.map(t =>
    HEADERS.map(h => `"${(t[h] ?? '').toString().replace(/"/g, '""')}"`).join(',')
  );
  return [HEADERS.join(','), ...rows].join('\n');
}

module.exports = { generateCsv };
