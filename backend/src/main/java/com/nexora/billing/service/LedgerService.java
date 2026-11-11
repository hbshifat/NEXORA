package com.nexora.billing.service;

import com.nexora.billing.model.Account;
import com.nexora.billing.model.AccountType;
import com.nexora.billing.model.Currency;
import com.nexora.billing.model.Entry;
import com.nexora.billing.model.EntryType;
import com.nexora.billing.model.Transaction;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory double-entry ledger. Every recorded transaction must have total
 * debits equal to total credits, so the ledger as a whole is always
 * balanced — this is the domain invariant the rest of the billing system
 * (tax, fraud) is built on top of.
 */
public class LedgerService {
    private final Map<String, Account> accounts = new ConcurrentHashMap<>();
    private final List<Transaction> transactions = new CopyOnWriteArrayList<>();
    private final AtomicLong transactionSequence = new AtomicLong();

    public Account createAccount(String id, String name, AccountType type, Currency currency) {
        Account account = new Account(id, name, type, currency);
        if (accounts.putIfAbsent(id, account) != null) {
            throw new IllegalArgumentException("account already exists: " + id);
        }
        return account;
    }

    public Account getAccount(String id) {
        Account account = accounts.get(id);
        if (account == null) {
            throw new IllegalArgumentException("no such account: " + id);
        }
        return account;
    }

    public List<Account> accounts() {
        return List.copyOf(accounts.values());
    }

    public Transaction recordTransaction(String description, List<Entry> entries) {
        return recordTransaction(description, entries, Instant.now());
    }

    public Transaction recordTransaction(String description, List<Entry> entries, Instant timestamp) {
        for (Entry entry : entries) {
            getAccount(entry.accountId()); // throws if the account doesn't exist
        }

        String id = "txn-" + transactionSequence.incrementAndGet();
        Transaction transaction = new Transaction(id, description, timestamp, entries);
        if (!transaction.isBalanced()) {
            throw new IllegalStateException(
                    "unbalanced transaction: debits=" + transaction.totalDebits()
                            + " credits=" + transaction.totalCredits());
        }

        transactions.add(transaction);
        return transaction;
    }

    public BigDecimal balanceOf(String accountId) {
        getAccount(accountId); // throws if the account doesn't exist

        BigDecimal debits = BigDecimal.ZERO;
        BigDecimal credits = BigDecimal.ZERO;
        for (Transaction transaction : transactions) {
            for (Entry entry : transaction.entries()) {
                if (!entry.accountId().equals(accountId)) {
                    continue;
                }
                if (entry.type() == EntryType.DEBIT) {
                    debits = debits.add(entry.amount());
                } else {
                    credits = credits.add(entry.amount());
                }
            }
        }
        return debits.subtract(credits);
    }

    public List<Transaction> transactions() {
        return List.copyOf(transactions);
    }

    /** The ledger-wide version of {@link Transaction#isBalanced()}: total debits must equal total credits. */
    public boolean isLedgerBalanced() {
        BigDecimal totalDebits = BigDecimal.ZERO;
        BigDecimal totalCredits = BigDecimal.ZERO;
        for (Transaction transaction : transactions) {
            totalDebits = totalDebits.add(transaction.totalDebits());
            totalCredits = totalCredits.add(transaction.totalCredits());
        }
        return totalDebits.compareTo(totalCredits) == 0;
    }
}
