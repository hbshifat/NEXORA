#!/usr/bin/env bash
# NEXORA software factory installer.
#
# Copies the /factory skill, its seven agents and the dashboard into a project,
# creates a backlog if there is none, and adds the factory's run-state paths to
# .gitignore. Safe to run again: that upgrades the factory's own files and leaves
# yours alone.
#
# Usage:
#   ./install.sh [--force] [--dry-run] [target-project-dir]
#
# Options:
#   --force     overwrite files at the factory's paths that the factory did not
#               install (for example your own .claude/agents/builder.md)
#   --dry-run   print what would change and write nothing
#   -h, --help  show this help
#
# The target defaults to the current folder and must be a git repository.
#
# Environment:
#   FACTORY_VERSION   version label recorded in the install manifest
#                     (get.sh sets it; otherwise taken from git or "local")
#
# Written for bash 3.2 (stock macOS). Everything runs inside main(), called on
# the last line.

set -euo pipefail

# Files the factory owns: replaced on every install and upgrade.
MANAGED_FILES="
.claude/skills/factory/SKILL.md
.claude/agents/spec-writer.md
.claude/agents/builder.md
.claude/agents/review-security.md
.claude/agents/review-ux.md
.claude/agents/review-ui.md
.claude/agents/review-code.md
.claude/agents/approver.md
factory/dashboard.html
"

# Files that belong to the user once created: written only when missing.
SEED_FILES="
factory/backlog.md
"

# Run state the factory keeps out of git.
GITIGNORE_LINES="
factory/board.json
factory/jobs/
.worktrees/
"

MANIFEST="factory/.install.json"

say()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit "${2:-1}"; }

usage() { sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; }

main() {
  local force=0 dry=0 target=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --force) force=1 ;;
      --dry-run) dry=1 ;;
      -h|--help) usage; exit 0 ;;
      -*) die "unknown option: $1 (see --help)" 64 ;;
      *) [ -z "$target" ] || die "two target folders given: '$target' and '$1'" 64; target="$1" ;;
    esac
    shift
  done

  local src
  src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  target="${target:-$PWD}"

  # --- checks -----------------------------------------------------------
  [ "$(id -u)" -ne 0 ] || die "don't run this as root or with sudo. Run it as your normal user." 1
  [ -d "$target" ] || die "'$target' is not a folder." 64
  target="$(cd "$target" && pwd)"
  [ "$src" != "$target" ] || die "the target is the factory's own repository. Pass the project you want to install into." 64
  git -C "$target" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || die "'$target' is not a git repository. Run 'git init' there first." 64

  local f
  for f in $MANAGED_FILES $SEED_FILES; do
    [ -f "$src/$f" ] || die "the installer source is missing $f. Is '$src' a complete copy of the factory?" 1
  done

  local version="${FACTORY_VERSION:-}"
  if [ -z "$version" ]; then
    version="$(git -C "$src" describe --tags --always 2>/dev/null || echo local)"
  fi

  local upgrading=0
  [ ! -f "$target/$MANIFEST" ] || upgrading=1

  say "NEXORA software factory $version -> $target"
  [ "$dry" -eq 0 ] || say "(dry run: nothing will be written)"

  # --- conflicts: decide everything before writing anything ------------
  # On a first install, an existing file that differs from ours was not put
  # there by the factory, so it is the user's and must not be overwritten.
  if [ "$upgrading" -eq 0 ] && [ "$force" -eq 0 ]; then
    local conflicts=""
    for f in $MANAGED_FILES; do
      if [ -e "$target/$f" ] && ! cmp -s "$src/$f" "$target/$f"; then
        conflicts="$conflicts
  $f"
      fi
    done
    if [ -n "$conflicts" ]; then
      die "these files already exist and are not the factory's:$conflicts
Nothing was changed. Rename or move them, or rerun with --force to overwrite them." 1
    fi
  fi

  # --- managed files ----------------------------------------------------
  local added=0 updated=0 same=0
  for f in $MANAGED_FILES; do
    if [ ! -e "$target/$f" ]; then
      added=$((added + 1)); say "  + $f"
    elif cmp -s "$src/$f" "$target/$f"; then
      same=$((same + 1)); continue
    else
      updated=$((updated + 1)); say "  ~ $f"
    fi
    if [ "$dry" -eq 0 ]; then
      mkdir -p "$(dirname "$target/$f")"
      cp "$src/$f" "$target/$f"
    fi
  done

  # --- seed files -------------------------------------------------------
  for f in $SEED_FILES; do
    if [ -e "$target/$f" ]; then
      say "  = $f (kept yours)"
    else
      added=$((added + 1)); say "  + $f"
      if [ "$dry" -eq 0 ]; then
        mkdir -p "$(dirname "$target/$f")"
        cp "$src/$f" "$target/$f"
      fi
    fi
  done

  # --- .gitignore -------------------------------------------------------
  local gi="$target/.gitignore" line missing=""
  for line in $GITIGNORE_LINES; do
    if [ ! -f "$gi" ] || ! grep -qxF "$line" "$gi"; then
      missing="$missing $line"
    fi
  done
  if [ -n "$missing" ]; then
    say "  ~ .gitignore (adding:$missing)"
    if [ "$dry" -eq 0 ]; then
      # Start on a fresh line if the file does not end with one.
      if [ -s "$gi" ] && [ "$(tail -c 1 "$gi" | od -An -c | tr -d ' ')" != '\n' ]; then
        printf '\n' >> "$gi"
      fi
      printf '\n# NEXORA software factory: run state stays on disk, out of git.\n' >> "$gi"
      for line in $missing; do printf '%s\n' "$line" >> "$gi"; done
    fi
  fi

  # --- manifest ---------------------------------------------------------
  if [ "$dry" -eq 0 ]; then
    mkdir -p "$target/factory"
    {
      printf '{\n'
      printf '  "name": "nexora-factory",\n'
      printf '  "version": "%s",\n' "$version"
      printf '  "installed_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      printf '  "files": ['
      local first=1
      for f in $MANAGED_FILES; do
        if [ "$first" -eq 1 ]; then first=0; printf '\n'; else printf ',\n'; fi
        printf '    "%s"' "$f"
      done
      printf '\n  ]\n}\n'
    } > "$target/$MANIFEST"
  fi

  # --- summary ----------------------------------------------------------
  local verb="installed"
  [ "$upgrading" -eq 0 ] || verb="upgraded"
  [ "$dry" -eq 0 ] || verb="would be $verb"
  say ""
  say "Factory $verb: $added added, $updated updated, $same unchanged."

  if ! git -C "$target" rev-parse --verify --quiet refs/heads/main >/dev/null; then
    warn "this repository has no 'main' branch. The factory creates 'dev' from 'main' and releases to 'main', so create one before running /factory."
  fi

  [ "$dry" -eq 0 ] || return 0
  say ""
  say "Next steps:"
  say "  1. Commit the factory files. /factory refuses to run with uncommitted changes:"
  say "       git add .claude factory .gitignore && git commit -m \"chore: add NEXORA software factory\""
  say "  2. Open Claude Code in this folder and run:  /factory <describe a feature>"
  say "  3. Watch it live:  cd factory && python3 -m http.server   then open http://localhost:8000/dashboard.html"
}

main "$@"
