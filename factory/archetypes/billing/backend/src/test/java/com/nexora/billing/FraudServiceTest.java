package com.nexora.billing;

import com.nexora.billing.model.Entry;
import com.nexora.billing.model.EntryType;
import com.nexora.billing.model.Transaction;
import com.nexora.billing.service.FraudAssessment;
import com.nexora.billing.service.FraudService;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FraudServiceTest {

    private final FraudService fraudService = new FraudService();

    @Test
    void flagsTransactionsAboveTheHighValueThreshold() {
        assertTrue(fraudService.isHighValue(new BigDecimal("10000.01")));
        assertFalse(fraudService.isHighValue(new BigDecimal("10000.00")));
        assertFalse(fraudService.isHighValue(new BigDecimal("9999.99")));
    }

    @Test
    void doesNotBreachVelocityForThreeOrFewerTransactionsPerMinute() {
        Instant base = Instant.parse("2025-01-01T00:00:00Z");

        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base));
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(10)));
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(20)));
    }

    @Test
    void breachesVelocityOnTheFourthTransactionWithinAMinute() {
        Instant base = Instant.parse("2025-01-01T00:00:00Z");

        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base));
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(10)));
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(20)));
        assertTrue(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(30)));
    }

    @Test
    void velocityIsTrackedIndependentlyPerAccount() {
        Instant base = Instant.parse("2025-01-01T00:00:00Z");

        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base));
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(10)));
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(20)));
        // acct-2's first transaction should not inherit acct-1's velocity count.
        assertFalse(fraudService.recordAndCheckVelocity("acct-2", base.plusSeconds(30)));
    }

    @Test
    void transactionsOutsideTheOneMinuteWindowDoNotCount() {
        Instant base = Instant.parse("2025-01-01T00:00:00Z");

        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base));
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(10)));
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(20)));
        // More than a minute after the first three: the window has rolled past them.
        assertFalse(fraudService.recordAndCheckVelocity("acct-1", base.plusSeconds(90)));
    }

    @Test
    void assessCombinesHighValueAndVelocitySignals() {
        Transaction highValueTxn = new Transaction("txn-1", "Big purchase", Instant.parse("2025-01-01T00:00:00Z"),
                List.of(
                        new Entry("cash", EntryType.DEBIT, new BigDecimal("15000.00")),
                        new Entry("revenue", EntryType.CREDIT, new BigDecimal("15000.00"))));

        FraudAssessment assessment = fraudService.assess("acct-1", highValueTxn, highValueTxn.timestamp());

        assertTrue(assessment.highValue());
        assertFalse(assessment.velocityBreach());
        assertTrue(assessment.isSuspicious());
    }
}
