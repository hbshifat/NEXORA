package com.nexora.billing.service;

/**
 * The result of running a transaction through {@link FraudService}: whether
 * it exceeds the high-value threshold, and whether its account has tripped
 * the transaction-velocity limit.
 */
public record FraudAssessment(boolean highValue, boolean velocityBreach) {
    public boolean isSuspicious() {
        return highValue || velocityBreach;
    }
}
