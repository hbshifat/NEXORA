package com.nexora.billing.model;

import java.util.Objects;

public final class Account {
    private final String id;
    private final String name;
    private final AccountType type;
    private final Currency currency;

    public Account(String id, String name, AccountType type, Currency currency) {
        this.id = Objects.requireNonNull(id, "id");
        this.name = Objects.requireNonNull(name, "name");
        this.type = Objects.requireNonNull(type, "type");
        this.currency = Objects.requireNonNull(currency, "currency");
    }

    public String id() {
        return id;
    }

    public String name() {
        return name;
    }

    public AccountType type() {
        return type;
    }

    public Currency currency() {
        return currency;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Account other)) return false;
        return id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }

    @Override
    public String toString() {
        return "Account{id='%s', name='%s', type=%s, currency=%s}".formatted(id, name, type, currency);
    }
}
