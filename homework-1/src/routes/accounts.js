const express = require('express');
const router = express.Router();
const store = require('../store/transactions');

const ACCOUNT_REGEX = /^ACC-[A-Z0-9]{5}$/i;

function isValidAccountId(accountId) {
  return ACCOUNT_REGEX.test(accountId);
}

function computeBalance(accountId) {
  return store
    .findAll({ accountId })
    .filter(t => t.status === 'completed')
    .reduce((balance, t) => {
      if (t.toAccount === accountId && (t.type === 'deposit' || t.type === 'transfer')) {
        return balance + t.amount;
      }
      if (t.fromAccount === accountId && (t.type === 'withdrawal' || t.type === 'transfer')) {
        return balance - t.amount;
      }
      return balance;
    }, 0);
}

router.get('/:accountId/balance', (req, res) => {
  const { accountId } = req.params;
  if (!isValidAccountId(accountId)) {
    return res.status(400).json({ error: 'Invalid account ID format. Expected: ACC-XXXXX' });
  }
  const balance = Math.round(computeBalance(accountId) * 100) / 100;
  res.json({ accountId, balance });
});

router.get('/:accountId/summary', (req, res) => {
  const { accountId } = req.params;
  if (!isValidAccountId(accountId)) {
    return res.status(400).json({ error: 'Invalid account ID format. Expected: ACC-XXXXX' });
  }

  const allForAccount = store.findAll({ accountId });
  const completed = allForAccount.filter(t => t.status === 'completed');

  const totalDeposits =
    Math.round(completed.filter(t => t.toAccount === accountId).reduce((s, t) => s + t.amount, 0) * 100) / 100;

  const totalWithdrawals =
    Math.round(completed.filter(t => t.fromAccount === accountId).reduce((s, t) => s + t.amount, 0) * 100) / 100;

  const timestamps = allForAccount.map(t => t.timestamp).sort();
  const lastTransactionDate = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

  res.json({
    accountId,
    totalDeposits,
    totalWithdrawals,
    transactionCount: allForAccount.length,
    lastTransactionDate,
  });
});

router.get('/:accountId/interest', (req, res) => {
  const { accountId } = req.params;
  if (!isValidAccountId(accountId)) {
    return res.status(400).json({ error: 'Invalid account ID format. Expected: ACC-XXXXX' });
  }

  const { rate, days } = req.query;

  if (rate === undefined) return res.status(400).json({ error: 'Query parameter "rate" is required' });
  if (days === undefined) return res.status(400).json({ error: 'Query parameter "days" is required' });

  const rateNum = parseFloat(rate);
  const daysNum = parseInt(days, 10);

  if (isNaN(rateNum) || rateNum <= 0) return res.status(400).json({ error: '"rate" must be a positive number' });
  if (isNaN(daysNum) || daysNum <= 0) return res.status(400).json({ error: '"days" must be a positive integer' });

  const balance = Math.round(computeBalance(accountId) * 100) / 100;
  const interest = Math.round(balance * rateNum * (daysNum / 365) * 100) / 100;
  const projectedBalance = Math.round((balance + interest) * 100) / 100;

  res.json({ accountId, balance, rate: rateNum, days: daysNum, interest, projectedBalance });
});

module.exports = router;
