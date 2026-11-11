#!/bin/sh
set -e
ARCHETYPE="/home/gmhossen/Project/NEXORA/factory/archetypes/billing/backend"
echo "==> [Agent T2] Implementing Java Sales Tax & EU VAT Engine..."
mkdir -p backend/src/main/java/com/nexora/billing/service
mkdir -p backend/src/test/java/com/nexora/billing

cp "$ARCHETYPE/src/main/java/com/nexora/billing/service/TaxService.java" backend/src/main/java/com/nexora/billing/service/
cp "$ARCHETYPE/src/test/java/com/nexora/billing/TaxServiceTest.java" backend/src/test/java/com/nexora/billing/
echo "==> [Agent T2] Completed tax engine construction."
