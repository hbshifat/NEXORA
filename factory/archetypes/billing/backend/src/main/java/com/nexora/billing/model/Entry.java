package com.nexora.billing.model;

import java.math.BigDecimal;
import java.util.Objects;

public final class Entry {
    private final String accountId;
    private final EntryType type;
    private final BigDecimal amount;

    public Entry(String accountId, EntryType type, BigDecimal amount) {
        this.accountId = Objects.requireNonNull(accountId, "accountId");
        this.type = Objects.requireNonNull(type, "type");
        this.amount = Objects.requireNonNull(amount, "amount");
        if (amount.signum() <= 0) {
            throw new IllegalArgumentException("entry amount must be positive: " + amount);
        }
    }

    public String accountId() {
        return accountId;
    }

    public EntryType type() {
        return type;
    }

    public BigDecimal amount() {
        return amount;
    }

    @Override
    public String toString() {
        return "Entry{accountId='%s', type=%s, amount=%s}".formatted(accountId, type, amount);
    }
}
