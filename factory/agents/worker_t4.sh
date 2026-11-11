#!/bin/sh
set -e
ARCHETYPE="/home/gmhossen/Project/NEXORA/factory/archetypes/billing/frontend"
echo "==> [Agent T4] Scaffolding React Dashboard & Testing Utilities..."
mkdir -p frontend

cp -r "$ARCHETYPE/." frontend/
echo "==> [Agent T4] Completed React frontend construction."
