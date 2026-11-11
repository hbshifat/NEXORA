package com.nexora.billing;

import com.nexora.billing.service.TaxService;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class TaxServiceTest {

    private final TaxService taxService = new TaxService();

    @Test
    void calculatesCaliforniaSalesTax() {
        BigDecimal tax = taxService.calculateUsStateSalesTax("CA", new BigDecimal("1000.00"));
        assertEquals(new BigDecimal("72.50"), tax);
    }

    @Test
    void calculatesNewYorkSalesTax() {
        BigDecimal tax = taxService.calculateUsStateSalesTax("NY", new BigDecimal("250.00"));
        assertEquals(new BigDecimal("10.00"), tax);
    }

    @Test
    void chargesNoSalesTaxInStatesWithoutIt() {
        BigDecimal tax = taxService.calculateUsStateSalesTax("OR", new BigDecimal("1000.00"));
        assertEquals(new BigDecimal("0.00"), tax);
    }

    @Test
    void rejectsAnUnknownStateCode() {
        assertThrows(IllegalArgumentException.class,
                () -> taxService.calculateUsStateSalesTax("ZZ", new BigDecimal("100.00")));
    }

    @Test
    void rejectsANegativeTaxableAmount() {
        assertThrows(IllegalArgumentException.class,
                () -> taxService.calculateUsStateSalesTax("CA", new BigDecimal("-1.00")));
    }

    @Test
    void calculatesEuVatReverseCharge() {
        BigDecimal vat = taxService.calculateEuVatReverseCharge(new BigDecimal("2000.00"), new BigDecimal("0.20"));
        assertEquals(new BigDecimal("400.00"), vat);
    }

    @Test
    void rejectsANegativeNetAmountForReverseCharge() {
        assertThrows(IllegalArgumentException.class,
                () -> taxService.calculateEuVatReverseCharge(new BigDecimal("-1.00"), new BigDecimal("0.20")));
    }
}
