const express = require('express');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const transactionRoutes = require('./routes/transactions');
const accountRoutes = require('./routes/accounts');

const app = express();

app.use(express.json());
app.use(rateLimiter);
app.use('/transactions', transactionRoutes);
app.use('/accounts', accountRoutes);
app.use(errorHandler);

module.exports = app;
