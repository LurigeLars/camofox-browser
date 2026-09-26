#!/bin/bash
# Build a derived first-boot copy of Microsoft's Windows ARM64 ISO for UTM.
# The original ISO remains unmodified and is verified before its contents are copied.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/windows-utm/build-installer-autoboot-iso.sh --source PATH --output PATH

Creates a UDF/ISO copy of the verified Windows 11 ARM64 installer with a root
startup.nsh. If UTM's blank ARM UEFI store falls into its built-in shell, the
script starts the installer’s existing signed EFI boot application without any
host or guest input automation.
EOF
}

source_iso=''
output=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) source_iso=${2:?missing source ISO}; shift 2 ;;
    --output) output=${2:?missing output ISO}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
[[ -n "$source_iso" && -n "$output" ]] || { usage >&2; exit 2; }
[[ -f "$source_iso" ]] || { echo "Source ISO does not exist: $source_iso" >&2; exit 2; }
command -v hdiutil >/dev/null || { echo 'hdiutil is required (macOS).' >&2; exit 2; }
expected='638AA2C88E94385B00F4F178D071E3DF0B7D9E335577A83BD533B7F2EB65ADF0'
actual=$(shasum -a 256 "$source_iso" | awk '{print toupper($1)}')
[[ "$actual" == "$expected" ]] || { echo 'Source ISO checksum does not match the verified Microsoft Windows 11 ARM64 ISO.' >&2; exit 2; }

output=$(cd "$(dirname "$output")" && pwd)/$(basename "$output")
[[ "$output" == *.iso ]] || { echo 'Output filename must end in .iso.' >&2; exit 2; }
[[ ! -e "$output" ]] || { echo "Refusing to overwrite existing output: $output" >&2; exit 2; }
work=$(mktemp -d)
mount="$work/mount"
stage="$work/stage"
mkdir -p "$mount" "$stage"
cleanup() {
  mount | grep -Fq "on $mount " && hdiutil detach "$mount" >/dev/null 2>&1 || true
  chmod -R u+w "$work" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT
hdiutil attach -readonly -nobrowse "$source_iso" -mountpoint "$mount" >/dev/null
# ditto preserves the Windows installer tree while adding only the UEFI-shell fallback.
ditto "$mount" "$stage"
chmod -R u+w "$stage"
# UEFI Shell resolves startup.nsh only from its current mapped filesystem. Probe
# all expected removable mappings so this remains valid when UTM changes USB
# enumeration order between boots.
cat > "$stage/startup.nsh" <<'EOF'
map -r
if exist fs0:\EFI\BOOT\BOOTAA64.EFI then
  fs0:
  \EFI\BOOT\BOOTAA64.EFI
endif
if exist fs1:\EFI\BOOT\BOOTAA64.EFI then
  fs1:
  \EFI\BOOT\BOOTAA64.EFI
endif
if exist fs2:\EFI\BOOT\BOOTAA64.EFI then
  fs2:
  \EFI\BOOT\BOOTAA64.EFI
endif
EOF
# A read-only ISO can be auto-detached after the copy on some macOS versions.
# The EXIT cleanup also detaches it when it remains mounted.
hdiutil detach "$mount" >/dev/null 2>&1 || true
hdiutil makehybrid -udf -iso -joliet -default-volume-name WIN11_ARM64_UTM -o "$output" "$stage" >/dev/null
printf 'Created %s\nSHA-256 %s\n' "$output" "$(shasum -a 256 "$output" | awk '{print $1}')"
