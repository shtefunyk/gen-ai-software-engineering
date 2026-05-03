const { VALID_CURRENCIES } = require('../utils/currencies');

const ACCOUNT_REGEX = /^ACC-[A-Z0-9]{5}$/i;
const VALID_TYPES = ['deposit', 'withdrawal', 'transfer'];

function validateTransaction(body) {
  const errors = [];
  const { amount, currency, type, fromAccount, toAccount } = body;

  if (amount === undefined || amount === null) {
    errors.push({ field: 'amount', message: 'Amount is required' });
  } else if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be a positive number' });
  } else if (!/^\d+(\.\d{1,2})?$/.test(amount.toString())) {
    errors.push({ field: 'amount', message: 'Amount must have at most 2 decimal places' });
  }

  if (!currency) {
    errors.push({ field: 'currency', message: 'Currency is required' });
  } else if (!VALID_CURRENCIES.has(currency.toUpperCase())) {
    errors.push({ field: 'currency', message: 'Invalid ISO 4217 currency code' });
  }

  if (!type) {
    errors.push({ field: 'type', message: 'Type is required' });
  } else if (!VALID_TYPES.includes(type)) {
    errors.push({ field: 'type', message: `Type must be one of: ${VALID_TYPES.join(', ')}` });
  } else {
    const needsFrom = type === 'withdrawal' || type === 'transfer';
    const needsTo = type === 'deposit' || type === 'transfer';

    if (needsFrom) {
      if (!fromAccount) {
        errors.push({ field: 'fromAccount', message: `fromAccount is required for ${type}` });
      } else if (!ACCOUNT_REGEX.test(fromAccount)) {
        errors.push({ field: 'fromAccount', message: 'Account must match format ACC-XXXXX' });
      }
    } else if (fromAccount && !ACCOUNT_REGEX.test(fromAccount)) {
      errors.push({ field: 'fromAccount', message: 'Account must match format ACC-XXXXX' });
    }

    if (needsTo) {
      if (!toAccount) {
        errors.push({ field: 'toAccount', message: `toAccount is required for ${type}` });
      } else if (!ACCOUNT_REGEX.test(toAccount)) {
        errors.push({ field: 'toAccount', message: 'Account must match format ACC-XXXXX' });
      }
    } else if (toAccount && !ACCOUNT_REGEX.test(toAccount)) {
      errors.push({ field: 'toAccount', message: 'Account must match format ACC-XXXXX' });
    }
  }

  return errors;
}

module.exports = { validateTransaction };
