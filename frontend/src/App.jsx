import React from 'react';
import LedgerOverview from './components/LedgerOverview.jsx';
import TransactionTable from './components/TransactionTable.jsx';
import TaxCalculator from './components/TaxCalculator.jsx';

const demoAccounts = [
  { id: 'cash', name: 'Cash' },
  { id: 'revenue', name: 'Revenue' },
];

const demoTransactions = [
  {
    id: 'txn-1',
    description: 'Invoice #1001 payment',
    entries: [
      { accountId: 'cash', type: 'DEBIT', amount: 500 },
      { accountId: 'revenue', type: 'CREDIT', amount: 500 },
    ],
  },
  {
    id: 'txn-2',
    description: 'Invoice #1002 payment',
    entries: [
      { accountId: 'cash', type: 'DEBIT', amount: 250 },
      { accountId: 'revenue', type: 'CREDIT', amount: 250 },
    ],
  },
];

export default function App() {
  return (
    <main className="app">
      <h1>NEXORA Billing &amp; Ledger Hub</h1>
      <LedgerOverview accounts={demoAccounts} transactions={demoTransactions} />
      <TransactionTable transactions={demoTransactions} />
      <TaxCalculator />
    </main>
  );
}
