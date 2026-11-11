import React, { useState } from 'react';
import { estimateSalesTax, formatCurrency } from '../lib/billingUtils.js';

export default function TaxCalculator() {
  const [amount, setAmount] = useState(1000);
  const [ratePercent, setRatePercent] = useState(7.25);

  const numericAmount = Number(amount) || 0;
  const numericRate = Number(ratePercent) || 0;
  const tax = estimateSalesTax(Math.max(numericAmount, 0), Math.max(numericRate, 0));

  return (
    <section className="tax-calculator">
      <h2>Tax Estimator</h2>
      <label>
        Amount
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
        />
      </label>
      <label>
        Rate (%)
        <input
          type="number"
          value={ratePercent}
          onChange={(e) => setRatePercent(e.target.value)}
          min="0"
          step="0.01"
        />
      </label>
      <p className="tax-estimate">Estimated tax: {formatCurrency(tax)}</p>
    </section>
  );
}
