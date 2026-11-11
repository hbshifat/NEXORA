import React from 'react';
import { formatCurrency, isTransactionBalanced } from '../lib/billingUtils.js';

export default function TransactionTable({ transactions }) {
  return (
    <section className="transaction-table">
      <h2>Transactions</h2>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Entries</th>
            <th>Balanced</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <tr key={txn.id}>
              <td>{txn.description}</td>
              <td>
                {txn.entries.map((entry, i) => (
                  <div key={i} className="entry-line">
                    <span className={`entry-type entry-type-${entry.type.toLowerCase()}`}>{entry.type}</span>
                    {' '}
                    {entry.accountId}: {formatCurrency(entry.amount)}
                  </div>
                ))}
              </td>
              <td>{isTransactionBalanced(txn) ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
