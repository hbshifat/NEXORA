package com.nexora.billing.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Multi-region tax calculator: US state sales tax lookup, and EU VAT
 * reverse-charge calculation for cross-border B2B invoices.
 */
public class TaxService {
    private final Map<String, BigDecimal> usStateSalesTaxRates = new ConcurrentHashMap<>();

    public TaxService() {
        usStateSalesTaxRates.put("CA", new BigDecimal("0.0725"));
        usStateSalesTaxRates.put("NY", new BigDecimal("0.04"));
        usStateSalesTaxRates.put("TX", new BigDecimal("0.0625"));
        usStateSalesTaxRates.put("WA", new BigDecimal("0.065"));
        usStateSalesTaxRates.put("OR", BigDecimal.ZERO); // no state sales tax
        usStateSalesTaxRates.put("DE", BigDecimal.ZERO); // no state sales tax
    }

    public BigDecimal salesTaxRateFor(String stateCode) {
        BigDecimal rate = usStateSalesTaxRates.get(stateCode);
        if (rate == null) {
            throw new IllegalArgumentException("no sales tax rate configured for state: " + stateCode);
        }
        return rate;
    }

    public BigDecimal calculateUsStateSalesTax(String stateCode, BigDecimal taxableAmount) {
        if (taxableAmount.signum() < 0) {
            throw new IllegalArgumentException("taxableAmount must not be negative: " + taxableAmount);
        }
        BigDecimal rate = salesTaxRateFor(stateCode);
        return taxableAmount.multiply(rate).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Under the EU reverse-charge mechanism, a B2B cross-border seller
     * issues a net invoice with no VAT charged; the buyer self-assesses VAT
     * on that net amount, declaring it simultaneously as output and input
     * VAT so no cash changes hands. This returns that notional VAT amount,
     * which must still be recorded for audit purposes.
     */
    public BigDecimal calculateEuVatReverseCharge(BigDecimal netAmount, BigDecimal vatRate) {
        if (netAmount.signum() < 0) {
            throw new IllegalArgumentException("netAmount must not be negative: " + netAmount);
        }
        if (vatRate.signum() < 0) {
            throw new IllegalArgumentException("vatRate must not be negative: " + vatRate);
        }
        return netAmount.multiply(vatRate).setScale(2, RoundingMode.HALF_UP);
    }
}
