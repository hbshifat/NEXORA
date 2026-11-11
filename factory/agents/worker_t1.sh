#!/bin/sh
set -e
ARCHETYPE="/home/gmhossen/Project/NEXORA/factory/archetypes/billing/backend"
echo "==> [Agent T1] Scaffolding Java 25 Gradle Backend & Ledger Domain..."
mkdir -p backend/src/main/java/com/nexora/billing/model
mkdir -p backend/src/main/java/com/nexora/billing/service
mkdir -p backend/src/test/java/com/nexora/billing

cp "$ARCHETYPE/build.gradle" backend/
cp "$ARCHETYPE/settings.gradle" backend/
cp "$ARCHETYPE/gradle.properties" backend/
cp -r "$ARCHETYPE/src/main/java/com/nexora/billing/model" backend/src/main/java/com/nexora/billing/
cp "$ARCHETYPE/src/main/java/com/nexora/billing/service/LedgerService.java" backend/src/main/java/com/nexora/billing/service/
cp "$ARCHETYPE/src/test/java/com/nexora/billing/LedgerServiceTest.java" backend/src/test/java/com/nexora/billing/
echo "==> [Agent T1] Completed domain construction."
