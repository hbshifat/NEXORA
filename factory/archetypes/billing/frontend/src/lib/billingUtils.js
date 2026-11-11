// Pure display/calculation logic shared by the dashboard components. Kept
// free of JSX so it can run under Node's native test runner without a
// build step or a JSX transform.

export function formatCurrency(amount, currencyCode = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(amount);
}

/**
 * Computes each account's net balance (total debits minus total credits)
 * from a list of double-entry transactions.
 */
export function computeAccountBalances(accounts, transactions) {
  const balances = new Map(accounts.map((a) => [a.id, 0]));

  for (const txn of transactions) {
    for (const entry of txn.entries) {
      if (!balances.has(entry.accountId)) continue;
      const delta = entry.type === 'DEBIT' ? entry.amount : -entry.amount;
      balances.set(entry.accountId, balances.get(entry.accountId) + delta);
    }
  }

  return accounts.map((a) => ({ id: a.id, name: a.name, balance: balances.get(a.id) }));
}

/** The double-entry invariant: a transaction's debits must equal its credits. */
export function isTransactionBalanced(transaction) {
  const debits = transaction.entries
    .filter((e) => e.type === 'DEBIT')
    .reduce((sum, e) => sum + e.amount, 0);
  const credits = transaction.entries
    .filter((e) => e.type === 'CREDIT')
    .reduce((sum, e) => sum + e.amount, 0);
  return Math.abs(debits - credits) < 1e-9;
}

export function estimateSalesTax(amount, ratePercent) {
  if (amount < 0) throw new Error('amount must be non-negative');
  if (ratePercent < 0) throw new Error('rate must be non-negative');
  return Math.round(amount * (ratePercent / 100) * 100) / 100;
}

export function summarizeTaxEstimates(estimates) {
  return estimates.reduce((sum, e) => sum + e.amount, 0);
}
