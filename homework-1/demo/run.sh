#!/bin/bash
cd "$(dirname "$0")/.."
echo "Installing dependencies..."
npm install
echo "Starting Banking Transactions API on http://localhost:3000"
npm start
