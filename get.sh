#!/usr/bin/env bash
# NEXORA software factory: one-line installer.
#
#   curl -fsSL https://raw.githubusercontent.com/hbshifat/NEXORA/main/get.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/hbshifat/NEXORA/main/get.sh | bash -s -- --ref v0.2.0
#
# Downloads the factory and runs its install.sh against your project.
#
# Options:
#   --target <dir>       project to install into (default: the current folder)
#   --ref <tag|branch>   version to install (default: the latest GitHub release,
#                        or the main branch when there is no release yet)
#   -h, --help           show this help
# Passed through to install.sh: --force, --dry-run.
#
# Environment:
#   FACTORY_REF       same as --ref
#   FACTORY_REPO      GitHub owner/repo to fetch from (default hbshifat/NEXORA)
#   FACTORY_TARBALL   exact tarball URL to fetch instead (file:// works; used by tests)
#
# Written for bash 3.2 (stock macOS). The whole script lives in main(), called on
# the last line, so a download cut off halfway through runs nothing.

set -euo pipefail

say()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit "${2:-1}"; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<'EOF'
NEXORA software factory: one-line installer.

  curl -fsSL https://raw.githubusercontent.com/hbshifat/NEXORA/main/get.sh | bash

Options:
  --target <dir>       project to install into (default: the current folder)
  --ref <tag|branch>   version to install (default: latest release, else main)
  --force              overwrite files at the factory's paths that are not the factory's
  --dry-run            show what would change and write nothing
  -h, --help           show this help
EOF
}

latest_release() {
  # Prints the latest release tag, or nothing. No python or jq needed.
  curl -fsSL "https://api.github.com/repos/$1/releases/latest" 2>/dev/null \
    | sed -n 's/^[[:space:]]*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -n 1 || true
}

main() {
  local target="" ref="${FACTORY_REF:-}"
  local repo="${FACTORY_REPO:-hbshifat/NEXORA}"
  local url="${FACTORY_TARBALL:-}"
  local pass=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --target) [ $# -ge 2 ] || die "--target needs a folder" 64; target="$2"; shift 2 ;;
      --target=*) target="${1#--target=}"; shift ;;
      --ref) [ $# -ge 2 ] || die "--ref needs a tag or branch name" 64; ref="$2"; shift 2 ;;
      --ref=*) ref="${1#--ref=}"; shift ;;
      -h|--help) usage; exit 0 ;;
      --force|--dry-run) pass+=("$1"); shift ;;
      -*) die "unknown option: $1 (see --help)" 64 ;;
      *) [ -z "$target" ] || die "two target folders given: '$target' and '$1'" 64; target="$1"; shift ;;
    esac
  done
  target="${target:-$PWD}"

  [ "$(id -u)" -ne 0 ] || die "don't run this as root or with sudo. Run it as your normal user, inside your project folder." 1
  [ -d "$target" ] || die "'$target' is not a folder. Create it first, or pass --target <an existing folder>." 64
  have git || die "git is missing. The factory is built on git; install it and run this again." 69
  if [ -z "$url" ]; then
    have curl || die "curl is missing. Install it and run this again." 69
  fi
  have tar || die "tar is missing. Install it and run this again." 69

  # --- pick a version ----------------------------------------------------
  local label
  if [ -n "$url" ]; then
    label="$url"
    [ -n "$ref" ] || ref="custom"
  else
    if [ -z "$ref" ]; then
      ref="$(latest_release "$repo")"
      if [ -z "$ref" ]; then
        warn "no published release found; installing from the main branch."
        ref="main"
      fi
    fi
    url="https://codeload.github.com/$repo/tar.gz/$ref"
    label="$repo@$ref"
  fi

  # --- download ----------------------------------------------------------
  local tmp
  tmp="$(mktemp -d 2>/dev/null || mktemp -d -t nexora-factory)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT INT TERM

  say "Downloading $label"
  curl -fsSL "$url" -o "$tmp/pack.tgz" \
    || die "download failed: $url. Check the version name and your internet connection." 1
  mkdir -p "$tmp/x"
  tar -xzf "$tmp/pack.tgz" -C "$tmp/x" || die "the download is not a valid tarball: $url" 1

  local src="" d
  if [ -f "$tmp/x/install.sh" ]; then
    src="$tmp/x"
  else
    for d in "$tmp"/x/*/; do
      if [ -f "${d}install.sh" ]; then src="${d%/}"; break; fi
    done
  fi
  [ -n "$src" ] || die "'$label' has no install.sh. That version predates the installer; try --ref main." 1

  # --- install -----------------------------------------------------------
  FACTORY_VERSION="$ref" bash "$src/install.sh" ${pass[@]+"${pass[@]}"} "$target"
}

main "$@"
