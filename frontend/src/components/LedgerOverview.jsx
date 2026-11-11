import React from 'react';
import { computeAccountBalances, formatCurrency } from '../lib/billingUtils.js';

export default function LedgerOverview({ accounts, transactions }) {
  const balances = computeAccountBalances(accounts, transactions);

  return (
    <section className="ledger-overview">
      <h2>Ledger Overview</h2>
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td className={b.balance < 0 ? 'balance-negative' : 'balance-positive'}>
                {formatCurrency(b.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
