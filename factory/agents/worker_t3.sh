#!/bin/sh
set -e
ARCHETYPE="/home/gmhossen/Project/NEXORA/factory/archetypes/billing/backend"
echo "==> [Agent T3] Implementing Java Fraud Detection & Velocity Rules..."
mkdir -p backend/src/main/java/com/nexora/billing/service
mkdir -p backend/src/test/java/com/nexora/billing

cp "$ARCHETYPE/src/main/java/com/nexora/billing/service/FraudAssessment.java" backend/src/main/java/com/nexora/billing/service/
cp "$ARCHETYPE/src/main/java/com/nexora/billing/service/FraudService.java" backend/src/main/java/com/nexora/billing/service/
cp "$ARCHETYPE/src/test/java/com/nexora/billing/FraudServiceTest.java" backend/src/test/java/com/nexora/billing/
echo "==> [Agent T3] Completed fraud engine construction."
