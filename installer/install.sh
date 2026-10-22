#!/usr/bin/env bash
set -euo pipefail

module_id="racooze-cos-populator"
foundry_data="${1:-}"
package_path="${2:-}"
force="${3:-}"
backup=""

if [[ -z "$foundry_data" || -z "$package_path" ]]; then
  echo "Usage: $0 <FoundryUserData> <release-zip> [--force]" >&2
  exit 2
fi

if [[ -n "$force" && "$force" != "--force" ]]; then
  echo "Unknown option: $force" >&2
  exit 2
fi

if [[ ! -d "$foundry_data" ]]; then
  echo "Foundry user-data directory does not exist: $foundry_data" >&2
  exit 2
fi

if [[ ! -f "$package_path" || "${package_path##*.}" != "zip" ]]; then
  echo "Release ZIP does not exist: $package_path" >&2
  exit 2
fi

checksum_file="$package_path.sha256"
if [[ -f "$checksum_file" ]]; then
  read -r expected_hash _ < "$checksum_file"
  if [[ ! "$expected_hash" =~ ^[[:xdigit:]]{64}$ ]]; then
    echo "The checksum file is malformed: $checksum_file" >&2
    exit 4
  fi
  actual_hash="$(sha256sum -- "$package_path" | cut -d ' ' -f 1)"
  if [[ "${actual_hash,,}" != "${expected_hash,,}" ]]; then
    echo "The release ZIP failed SHA-256 verification." >&2
    exit 4
  fi
  echo "Verified SHA-256 checksum."
else
  echo "Warning: no sibling .sha256 file was found; package integrity was not verified." >&2
fi

while IFS= read -r entry; do
  normalized="${entry//\\//}"
  if [[ "$normalized" == /* || "$normalized" =~ ^[A-Za-z]:/ || "$normalized" == ../* || "$normalized" == */../* || "$normalized" == */.. ]]; then
    echo "The ZIP contains an unsafe path: $entry" >&2
    exit 4
  fi
done < <(unzip -Z1 -- "$package_path")

if LC_ALL=C zipinfo -l -- "$package_path" | grep -Eq '^l'; then
  echo "The ZIP contains a symbolic link, which is not allowed." >&2
  exit 4
fi

modules_directory="$foundry_data/Data/modules"
target="$modules_directory/$module_id"
mkdir -p "$modules_directory"

if [[ -e "$target" && "$force" != "--force" ]]; then
  echo "The module is already installed. Re-run with --force to preserve it as a backup." >&2
  exit 3
fi

staging_root="$(mktemp -d "${TMPDIR:-/tmp}/$module_id.XXXXXXXX")"
cleanup() {
  status=$?
  if [[ -d "$staging_root" ]]; then
    rm -rf -- "$staging_root"
  fi
  if [[ $status -ne 0 && -n "$backup" && ! -e "$target" && -e "$backup" ]]; then
    mv -- "$backup" "$target"
    echo "Installation failed. The previous module was restored to $target" >&2
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ -e "$target" ]]; then
  backup="$modules_directory/$module_id.backup-$(date +%Y%m%d-%H%M%S)"
  mv -- "$target" "$backup"
  echo "Existing module moved to $backup"
fi

unzip -q -- "$package_path" -d "$staging_root"
if [[ ! -f "$staging_root/module.json" ]]; then
  echo "The ZIP does not contain module.json at its root." >&2
  exit 4
fi

if ! grep -Eq '"id"[[:space:]]*:[[:space:]]*"racooze-cos-populator"' "$staging_root/module.json"; then
  echo "The ZIP contains an unexpected module id." >&2
  exit 4
fi

mv -- "$staging_root" "$target"
trap - EXIT
echo "Installed $module_id to $target"
