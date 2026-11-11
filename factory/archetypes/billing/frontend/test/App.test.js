// Exercises the dashboard's display/calculation logic (src/lib/billingUtils.js)
// used by LedgerOverview, TransactionTable, and TaxCalculator. Deliberately
// does not import the .jsx components themselves: Node's native test runner
// has no JSX transform, so rendering is left to the real build (Vite) —
// this suite covers the pure logic those components depend on.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency,
  computeAccountBalances,
  isTransactionBalanced,
  estimateSalesTax,
  summarizeTaxEstimates,
} from '../src/lib/billingUtils.js';

describe('formatCurrency', () => {
  test('formats a positive amount as USD by default', () => {
    assert.equal(formatCurrency(500), '$500.00');
  });

  test('formats a negative amount', () => {
    assert.equal(formatCurrency(-250), '-$250.00');
  });

  test('supports other currency codes', () => {
    assert.equal(formatCurrency(100, 'EUR'), '€100.00');
  });
});

describe('computeAccountBalances', () => {
  const accounts = [
    { id: 'cash', name: 'Cash' },
    { id: 'revenue', name: 'Revenue' },
  ];

  test('nets debits and credits per account across transactions', () => {
    const transactions = [
      {
        id: 'txn-1',
        entries: [
          { accountId: 'cash', type: 'DEBIT', amount: 500 },
          { accountId: 'revenue', type: 'CREDIT', amount: 500 },
        ],
      },
      {
        id: 'txn-2',
        entries: [
          { accountId: 'cash', type: 'DEBIT', amount: 250 },
          { accountId: 'revenue', type: 'CREDIT', amount: 250 },
        ],
      },
    ];

    const balances = computeAccountBalances(accounts, transactions);
    assert.deepEqual(balances, [
      { id: 'cash', name: 'Cash', balance: 750 },
      { id: 'revenue', name: 'Revenue', balance: -750 },
    ]);
  });

  test('ignores entries for accounts not in the given list', () => {
    const transactions = [
      {
        id: 'txn-1',
        entries: [
          { accountId: 'cash', type: 'DEBIT', amount: 100 },
          { accountId: 'unknown-account', type: 'CREDIT', amount: 100 },
        ],
      },
    ];

    const balances = computeAccountBalances(accounts, transactions);
    assert.equal(balances.find((b) => b.id === 'cash').balance, 100);
  });

  test('returns a zero balance for an account with no transactions', () => {
    const balances = computeAccountBalances(accounts, []);
    assert.deepEqual(balances, [
      { id: 'cash', name: 'Cash', balance: 0 },
      { id: 'revenue', name: 'Revenue', balance: 0 },
    ]);
  });
});

describe('isTransactionBalanced', () => {
  test('is true when debits equal credits', () => {
    const txn = {
      entries: [
        { accountId: 'cash', type: 'DEBIT', amount: 500 },
        { accountId: 'revenue', type: 'CREDIT', amount: 500 },
      ],
    };
    assert.equal(isTransactionBalanced(txn), true);
  });

  test('is false when debits and credits differ', () => {
    const txn = {
      entries: [
        { accountId: 'cash', type: 'DEBIT', amount: 500 },
        { accountId: 'revenue', type: 'CREDIT', amount: 400 },
      ],
    };
    assert.equal(isTransactionBalanced(txn), false);
  });
});

describe('estimateSalesTax', () => {
  test('computes a percentage-based estimate', () => {
    assert.equal(estimateSalesTax(1000, 7.25), 72.5);
  });

  test('returns zero for a zero rate', () => {
    assert.equal(estimateSalesTax(1000, 0), 0);
  });

  test('rejects a negative amount', () => {
    assert.throws(() => estimateSalesTax(-1, 7.25));
  });

  test('rejects a negative rate', () => {
    assert.throws(() => estimateSalesTax(1000, -1));
  });
});

describe('summarizeTaxEstimates', () => {
  test('sums a list of tax estimates', () => {
    const total = summarizeTaxEstimates([{ amount: 72.5 }, { amount: 10 }, { amount: 0 }]);
    assert.equal(total, 82.5);
  });

  test('returns zero for an empty list', () => {
    assert.equal(summarizeTaxEstimates([]), 0);
  });
});
