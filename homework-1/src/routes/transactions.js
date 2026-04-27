const express = require('express');
const router = express.Router();
const store = require('../store/transactions');
const { validateTransaction } = require('../validators/transaction');
const { generateCsv } = require('../utils/csvExport');

// /export MUST be before /:id
router.get('/export', (req, res) => {
  const { accountId, type, from, to } = req.query;
  const transactions = store.findAll({ accountId, type, from, to });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(generateCsv(transactions));
});

router.get('/', (req, res) => {
  const { accountId, type, from, to } = req.query;
  res.json(store.findAll({ accountId, type, from, to }));
});

router.post('/', (req, res) => {
  const errors = validateTransaction(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }
  res.status(201).json(store.add(req.body));
});

router.get('/:id', (req, res) => {
  const transaction = store.findById(req.params.id);
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  res.json(transaction);
});

module.exports = router;
