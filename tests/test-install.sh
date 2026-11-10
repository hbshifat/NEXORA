#!/usr/bin/env bash
# Tests for install.sh and get.sh. Run from anywhere:
#   bash tests/test-install.sh
# Needs only bash, git, tar and coreutils. Never touches the network.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d 2>/dev/null || mktemp -d -t factory-test)"
trap 'rm -rf "$WORK"' EXIT

PASSED=0
FAILED=0
pass() { PASSED=$((PASSED + 1)); printf '  ok   %s\n' "$1"; }
fail() { FAILED=$((FAILED + 1)); printf '  FAIL %s\n' "$1"; }
check() { local name="$1"; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }

MANAGED=".claude/skills/factory/SKILL.md
.claude/agents/spec-writer.md
.claude/agents/builder.md
.claude/agents/review-security.md
.claude/agents/review-ux.md
.claude/agents/review-ui.md
.claude/agents/review-code.md
.claude/agents/approver.md
factory/dashboard.html"

new_repo() {
  local d
  d="$(mktemp -d "$WORK/repo.XXXXXX")"
  git -C "$d" init -q -b main
  git -C "$d" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
  printf '%s' "$d"
}

all_managed_match() {
  local f
  for f in $MANAGED; do cmp -s "$ROOT/$f" "$1/$f" || return 1; done
}

none_exist() { local p; for p in "$@"; do [ ! -e "$p" ] || return 1; done; }

count_line() { grep -cxF "$2" "$1" || true; }

echo "install.sh"

# 1. Fresh install
R="$(new_repo)"
OUT="$(bash "$ROOT/install.sh" "$R" 2>&1)"
check "fresh install copies every managed file" all_managed_match "$R"
check "fresh install seeds the backlog" cmp -s "$ROOT/factory/backlog.md" "$R/factory/backlog.md"
check "fresh install adds board.json to .gitignore" [ "$(count_line "$R/.gitignore" factory/board.json)" = 1 ]
check "fresh install adds jobs/ to .gitignore" [ "$(count_line "$R/.gitignore" factory/jobs/)" = 1 ]
check "fresh install adds .worktrees/ to .gitignore" [ "$(count_line "$R/.gitignore" .worktrees/)" = 1 ]
check "fresh install writes the manifest" grep -q '"name": "nexora-factory"' "$R/factory/.install.json"
check "fresh install prints next steps" grep -q '/factory <describe a feature>' <<<"$OUT"
check "installed tree has no quick-notes app" [ ! -e "$R/quick-notes" ]

# 2. Running twice is safe and keeps user edits
printf -- '- [ ] my own backlog item\n' >> "$R/factory/backlog.md"
cp "$R/factory/backlog.md" "$WORK/backlog.before"
OUT="$(bash "$ROOT/install.sh" "$R" 2>&1)"
check "second run does not duplicate .gitignore lines" [ "$(count_line "$R/.gitignore" factory/board.json)" = 1 ]
check "second run keeps the user's backlog" cmp -s "$WORK/backlog.before" "$R/factory/backlog.md"
check "second run reports an upgrade" grep -q 'Factory upgraded' <<<"$OUT"

# 3. Upgrade replaces a stale factory file
printf 'stale\n' > "$R/.claude/agents/builder.md"
bash "$ROOT/install.sh" "$R" >/dev/null 2>&1
check "upgrade replaces a changed factory file" cmp -s "$ROOT/.claude/agents/builder.md" "$R/.claude/agents/builder.md"

# 4. Existing .gitignore without a trailing newline
R="$(new_repo)"
printf 'node_modules/' > "$R/.gitignore"
bash "$ROOT/install.sh" "$R" >/dev/null 2>&1
check "keeps an existing .gitignore line intact" [ "$(count_line "$R/.gitignore" node_modules/)" = 1 ]
check "appends after a file with no trailing newline" [ "$(count_line "$R/.gitignore" .worktrees/)" = 1 ]

# 5. A user's own agent with the same name blocks a first install
R="$(new_repo)"
mkdir -p "$R/.claude/agents"
printf 'my own builder\n' > "$R/.claude/agents/builder.md"
if bash "$ROOT/install.sh" "$R" >"$WORK/out" 2>&1; then rc=0; else rc=$?; fi
check "conflict exits non-zero" [ "$rc" -ne 0 ]
check "conflict names the file" grep -q '.claude/agents/builder.md' "$WORK/out"
check "conflict leaves the user's file alone" grep -qx 'my own builder' "$R/.claude/agents/builder.md"
check "conflict writes nothing else" none_exist "$R/factory" "$R/.gitignore"

# 6. --force overwrites it
bash "$ROOT/install.sh" --force "$R" >/dev/null 2>&1
check "--force overwrites a conflicting file" all_managed_match "$R"

# 7. --dry-run writes nothing
R="$(new_repo)"
OUT="$(bash "$ROOT/install.sh" --dry-run "$R" 2>&1)"
check "--dry-run lists files it would add" grep -q '+ .claude/agents/approver.md' <<<"$OUT"
check "--dry-run writes nothing" none_exist "$R/.claude" "$R/factory" "$R/.gitignore"

# 8. Refusals
mkdir -p "$WORK/plain"
if bash "$ROOT/install.sh" "$WORK/plain" >/dev/null 2>&1; then rc=0; else rc=$?; fi
check "refuses a folder that is not a git repository" [ "$rc" -ne 0 ]
if bash "$ROOT/install.sh" "$ROOT" >/dev/null 2>&1; then rc=0; else rc=$?; fi
check "refuses to install into its own repository" [ "$rc" -ne 0 ]
if bash "$ROOT/install.sh" "$WORK/missing" >/dev/null 2>&1; then rc=0; else rc=$?; fi
check "refuses a folder that does not exist" [ "$rc" -ne 0 ]

# 9. Warns when there is no main branch
R="$WORK/master-repo"; mkdir -p "$R"
git -C "$R" init -q -b master
git -C "$R" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
OUT="$(bash "$ROOT/install.sh" "$R" 2>&1)"
check "warns when the repository has no main branch" grep -q "no 'main' branch" <<<"$OUT"

echo "get.sh"

# Build a tarball the way GitHub serves one: everything under one top folder.
PACK="$WORK/pack/NEXORA-test"
mkdir -p "$PACK"
(cd "$ROOT" && tar -cf - install.sh get.sh .claude factory/backlog.md factory/dashboard.html) | (cd "$PACK" && tar -xf -)
tar -czf "$WORK/pack.tgz" -C "$WORK/pack" NEXORA-test

R="$(new_repo)"
OUT="$(cd "$R" && FACTORY_TARBALL="file://$WORK/pack.tgz" bash "$ROOT/get.sh" 2>&1)"
check "get.sh installs into the current folder" all_managed_match "$R"
check "get.sh records the version" grep -q '"version": "custom"' "$R/factory/.install.json"

R="$(new_repo)"
FACTORY_TARBALL="file://$WORK/pack.tgz" bash "$ROOT/get.sh" --target "$R" --dry-run >/dev/null 2>&1
check "get.sh passes --dry-run through" [ ! -e "$R/.claude" ]

R="$(new_repo)"
FACTORY_TARBALL="file://$WORK/pack.tgz" bash "$ROOT/get.sh" --ref v9.9.9 "$R" >/dev/null 2>&1
check "get.sh records --ref as the version" grep -q '"version": "v9.9.9"' "$R/factory/.install.json"

mkdir -p "$WORK/old/NEXORA-old" && printf 'x\n' > "$WORK/old/NEXORA-old/README.md"
tar -czf "$WORK/old.tgz" -C "$WORK/old" NEXORA-old
R="$(new_repo)"
if FACTORY_TARBALL="file://$WORK/old.tgz" bash "$ROOT/get.sh" "$R" >"$WORK/out" 2>&1; then rc=0; else rc=$?; fi
check "get.sh explains a version without install.sh" grep -q 'predates the installer' "$WORK/out"

if bash "$ROOT/get.sh" --bogus >/dev/null 2>&1; then rc=0; else rc=$?; fi
check "get.sh rejects unknown options" [ "$rc" -eq 64 ]

echo
echo "$PASSED passed, $FAILED failed"
[ "$FAILED" -eq 0 ]
