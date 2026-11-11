package com.nexora.billing;

import com.nexora.billing.model.AccountType;
import com.nexora.billing.model.Currency;
import com.nexora.billing.model.Entry;
import com.nexora.billing.model.EntryType;
import com.nexora.billing.model.Transaction;
import com.nexora.billing.service.LedgerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LedgerServiceTest {

    private LedgerService ledger;

    @BeforeEach
    void setUp() {
        ledger = new LedgerService();
        ledger.createAccount("cash", "Cash", AccountType.ASSET, Currency.USD);
        ledger.createAccount("revenue", "Revenue", AccountType.REVENUE, Currency.USD);
    }

    @Test
    void recordsABalancedTransaction() {
        Transaction txn = ledger.recordTransaction("Invoice #1001 payment", List.of(
                new Entry("cash", EntryType.DEBIT, new BigDecimal("500.00")),
                new Entry("revenue", EntryType.CREDIT, new BigDecimal("500.00"))));

        assertTrue(txn.isBalanced());
        assertEquals(new BigDecimal("500.00"), ledger.balanceOf("cash"));
        assertEquals(new BigDecimal("-500.00"), ledger.balanceOf("revenue"));
    }

    @Test
    void rejectsAnUnbalancedTransaction() {
        assertThrows(IllegalStateException.class, () -> ledger.recordTransaction("Bad entry", List.of(
                new Entry("cash", EntryType.DEBIT, new BigDecimal("500.00")),
                new Entry("revenue", EntryType.CREDIT, new BigDecimal("400.00")))));

        assertEquals(List.of(), ledger.transactions());
    }

    @Test
    void rejectsATransactionAgainstAnUnknownAccount() {
        assertThrows(IllegalArgumentException.class, () -> ledger.recordTransaction("Ghost account", List.of(
                new Entry("does-not-exist", EntryType.DEBIT, new BigDecimal("100.00")),
                new Entry("revenue", EntryType.CREDIT, new BigDecimal("100.00")))));
    }

    @Test
    void theWholeLedgerStaysBalancedAcrossMultipleTransactions() {
        ledger.recordTransaction("First sale", List.of(
                new Entry("cash", EntryType.DEBIT, new BigDecimal("500.00")),
                new Entry("revenue", EntryType.CREDIT, new BigDecimal("500.00"))));
        ledger.recordTransaction("Second sale", List.of(
                new Entry("cash", EntryType.DEBIT, new BigDecimal("250.00")),
                new Entry("revenue", EntryType.CREDIT, new BigDecimal("250.00"))));

        assertTrue(ledger.isLedgerBalanced());
        assertEquals(new BigDecimal("750.00"), ledger.balanceOf("cash"));
        assertEquals(2, ledger.transactions().size());
    }

    @Test
    void rejectsDuplicateAccountIds() {
        assertThrows(IllegalArgumentException.class,
                () -> ledger.createAccount("cash", "Cash Again", AccountType.ASSET, Currency.USD));
    }

    @Test
    void recordsTheGivenTimestamp() {
        Instant when = Instant.parse("2025-01-01T00:00:00Z");
        Transaction txn = ledger.recordTransaction("Timed entry", List.of(
                new Entry("cash", EntryType.DEBIT, new BigDecimal("10.00")),
                new Entry("revenue", EntryType.CREDIT, new BigDecimal("10.00"))), when);

        assertEquals(when, txn.timestamp());
    }
}
