# BRD-002: Enterprise Billing & Ledger Hub (Java 25 + React)

**Document ID:** BRD-NEXORA-002-JAVA-REACT  
**Project:** NEXORA Software Factory  
**Target Architecture:** Multi-Tier Enterprise Application (Java Backend + React Frontend)  
**Execution Topology:** 1 Root Task + 3 Concurrent Parallel Workers (Fan-Out)  

---

## 1. Executive Summary & Objective
Build an enterprise-grade **Billing & Transaction Management System** combining a robust **Java 25 (Gradle)** backend domain with a modern **React** frontend dashboard.

This project serves as an industrial benchmark to prove that the **NEXORA Go Macro-Orchestrator** seamlessly coordinates polyglot stacks, running Java compiler tests (`./gradlew test`) and React test runners (`npm test`) concurrently across isolated Git worktrees.

---

## 2. Technology Matrix & Invariants

| Layer | Technology | Build & Test Tool | Verification Command |
| :--- | :--- | :--- | :--- |
| **Backend Core** | Java 25 (Standard OOP / Clean Architecture) | Gradle 8.14 (Kotlin/Groovy DSL) | `./gradlew test` |
| **Frontend UI** | React 18+ (Clean Component Architecture) | Node 22 / NPM | `npm test -- --watchAll=false` or `node --test` |

- **Zero DB Infrastructure Required:** In-memory transactional models and thread-safe collections (`ConcurrentHashMap`, `CopyOnWriteArrayList`).
- **Directory Layout:**
  ```text
  NEXORA/
  ├── backend/
  │   ├── build.gradle
  │   ├── settings.gradle
  │   └── src/
  │       ├── main/java/com/nexora/billing/
  │       │   ├── model/ (Account, Transaction, Entry, Currency)
  │       │   ├── service/ (LedgerService, TaxService, FraudService)
  │       └── test/java/com/nexora/billing/
  │           ├── LedgerServiceTest.java
  │           ├── TaxServiceTest.java
  │           └── FraudServiceTest.java
  └── frontend/
      ├── package.json
      ├── src/
      │   ├── components/ (LedgerOverview, TransactionTable, TaxCalculator)
      │   └── App.jsx
      └── test/
          └── App.test.js
  ```

---

## 3. The 4 DAG Tasks (1 Root + 3 Parallel Fan-Out)

### 3.1 Root Task: `T1_java_backend_core`
- **Focus:** Initialize the Gradle project and implement the core Double-Entry Bookkeeping domain.
- **Domain Invariant:** Total Debits must exactly equal Total Credits.
- **Verification Command:** `cd backend && ./gradlew test --tests "*LedgerServiceTest*"`
- **Dependencies:** `[]` (Root task)
- **Worktree Branch:** `task/t1-java-backend-core`

---

### 3.2 Parallel Task: `T2_java_tax_engine`
- **Depends on:** `T1_java_backend_core`
- **Focus:** Multi-region tax calculator (US State Sales Tax lookup + EU VAT reverse-charge calculation).
- **Verification Command:** `cd backend && ./gradlew test --tests "*TaxServiceTest*"`
- **Worktree Branch:** `task/t2-java-tax-engine`

---

### 3.3 Parallel Task: `T3_java_fraud_engine`
- **Depends on:** `T1_java_backend_core`
- **Focus:** Transaction velocity checks (>3 transactions/min) and high-value threshold flags (> $10,000).
- **Verification Command:** `cd backend && ./gradlew test --tests "*FraudServiceTest*"`
- **Worktree Branch:** `task/t3-java-fraud-engine`

---

### 3.4 Parallel Task: `T4_react_frontend_ui`
- **Depends on:** `T1_java_backend_core`
- **Focus:** React web dashboard displaying account balances, double-entry transaction tables, and live tax calculations.
- **Verification Command:** `cd frontend && node --test test/*.test.js` (or `npm test -- --watchAll=false`)
- **Worktree Branch:** `task/t4-react-frontend-ui`

---

## 4. DAG JSON Specification

```json
{
  "tasks": [
    {
      "id": "T1_java_backend_core",
      "name": "Java 25 Gradle ledger domain and core double-entry accounting tests",
      "dependencies": [],
      "worktree_branch": "task/t1-java-backend-core",
      "verify_command": "cd backend && gradle test --tests '*LedgerServiceTest*'"
    },
    {
      "id": "T2_java_tax_engine",
      "name": "Java sales tax and EU VAT rule calculator",
      "dependencies": ["T1_java_backend_core"],
      "worktree_branch": "task/t2-java-tax-engine",
      "verify_command": "cd backend && gradle test --tests '*TaxServiceTest*'"
    },
    {
      "id": "T3_java_fraud_engine",
      "name": "Java risk scoring and transaction velocity audit service",
      "dependencies": ["T1_java_backend_core"],
      "worktree_branch": "task/t3-java-fraud-engine",
      "verify_command": "cd backend && gradle test --tests '*FraudServiceTest*'"
    },
    {
      "id": "T4_react_frontend_ui",
      "name": "React billing dashboard with ledger balances and transaction table",
      "dependencies": ["T1_java_backend_core"],
      "worktree_branch": "task/t4-react-frontend-ui",
      "verify_command": "test -f frontend/src/App.jsx && test -f frontend/package.json && node --test frontend/test/*.test.js"
    }
  ]
}
```
