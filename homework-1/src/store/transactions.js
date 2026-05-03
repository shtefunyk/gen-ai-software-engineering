const transactions = [];

function generateId() {
  return `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function add(data) {
  const transaction = {
    id: generateId(),
    fromAccount: data.fromAccount || null,
    toAccount: data.toAccount || null,
    amount: data.amount,
    currency: data.currency,
    type: data.type,
    timestamp: new Date().toISOString(),
    status: 'pending',
  };
  transactions.push(transaction);
  return transaction;
}

function findAll({ accountId, type, from, to } = {}) {
  let result = [...transactions];

  if (accountId) {
    result = result.filter(t => t.fromAccount === accountId || t.toAccount === accountId);
  }
  if (type) {
    result = result.filter(t => t.type === type);
  }
  if (from) {
    result = result.filter(t => new Date(t.timestamp) >= new Date(from));
  }
  if (to) {
    const toDate = to.length === 10 ? new Date(to + 'T23:59:59.999Z') : new Date(to);
    result = result.filter(t => new Date(t.timestamp) <= toDate);
  }

  return result;
}

function findById(id) {
  return transactions.find(t => t.id === id) || null;
}

function clear() {
  transactions.length = 0;
}

module.exports = { add, findAll, findById, clear };
