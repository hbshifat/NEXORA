package com.nexora.billing.model;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

public final class Transaction {
    private final String id;
    private final String description;
    private final Instant timestamp;
    private final List<Entry> entries;

    public Transaction(String id, String description, Instant timestamp, List<Entry> entries) {
        this.id = Objects.requireNonNull(id, "id");
        this.description = Objects.requireNonNull(description, "description");
        this.timestamp = Objects.requireNonNull(timestamp, "timestamp");
        this.entries = List.copyOf(Objects.requireNonNull(entries, "entries"));
        if (this.entries.isEmpty()) {
            throw new IllegalArgumentException("transaction must have at least one entry");
        }
    }

    public String id() {
        return id;
    }

    public String description() {
        return description;
    }

    public Instant timestamp() {
        return timestamp;
    }

    public List<Entry> entries() {
        return entries;
    }

    public BigDecimal totalDebits() {
        return entries.stream()
                .filter(e -> e.type() == EntryType.DEBIT)
                .map(Entry::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public BigDecimal totalCredits() {
        return entries.stream()
                .filter(e -> e.type() == EntryType.CREDIT)
                .map(Entry::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** The transaction's double-entry invariant: total debits must equal total credits. */
    public boolean isBalanced() {
        return totalDebits().compareTo(totalCredits()) == 0;
    }

    /** The transaction's economic size — debits and credits are equal by {@link #isBalanced()}. */
    public BigDecimal totalAmount() {
        return totalDebits();
    }
}
