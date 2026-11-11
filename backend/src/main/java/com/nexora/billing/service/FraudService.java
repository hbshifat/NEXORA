package com.nexora.billing.service;

import com.nexora.billing.model.Transaction;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Flags two kinds of suspicious activity: single transactions above a
 * high-value threshold, and accounts exceeding a transaction-velocity limit
 * within a sliding one-minute window.
 */
public class FraudService {
    private static final BigDecimal HIGH_VALUE_THRESHOLD = new BigDecimal("10000");
    private static final int VELOCITY_LIMIT = 3;
    private static final Duration VELOCITY_WINDOW = Duration.ofMinutes(1);

    private final Map<String, List<Instant>> accountTransactionTimes = new ConcurrentHashMap<>();

    public boolean isHighValue(BigDecimal amount) {
        return amount.compareTo(HIGH_VALUE_THRESHOLD) > 0;
    }

    /**
     * Records a transaction timestamp for accountId and reports whether the
     * account has now exceeded {@value #VELOCITY_LIMIT} transactions within
     * the trailing one-minute window ending at timestamp.
     */
    public boolean recordAndCheckVelocity(String accountId, Instant timestamp) {
        List<Instant> times = accountTransactionTimes.computeIfAbsent(accountId, k -> new CopyOnWriteArrayList<>());
        times.add(timestamp);

        Instant windowStart = timestamp.minus(VELOCITY_WINDOW);
        long countInWindow = times.stream().filter(t -> !t.isBefore(windowStart) && !t.isAfter(timestamp)).count();
        return countInWindow > VELOCITY_LIMIT;
    }

    public FraudAssessment assess(String accountId, Transaction transaction, Instant timestamp) {
        boolean highValue = isHighValue(transaction.totalAmount());
        boolean velocityBreach = recordAndCheckVelocity(accountId, timestamp);
        return new FraudAssessment(highValue, velocityBreach);
    }
}
