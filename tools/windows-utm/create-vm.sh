#!/bin/bash
# Create and register an isolated Windows 11 ARM64 UTM VM for Camoufox E2E.
# Does not read from or modify any existing UTM VM bundle.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/windows-utm/create-vm.sh --installer PATH --provisioning PATH --bootstrap PATH [--output PATH] [--ssh-port PORT]

Creates a new UTM bundle with a fresh sparse NVMe disk and copies a verified
Windows installer, CAMOFOX_E2E provisioning ISO, and FAT bootstrap image into
that bundle. Existing VMs are never cloned or changed.
EOF
}

output="$HOME/Library/Containers/com.utmapp.UTM/Data/Documents/Camofox Windows E2E.utm"
installer=''
provisioning=''
bootstrap=''
ssh_port=22222
while [[ $# -gt 0 ]]; do
  case "$1" in
    --installer) installer=${2:?missing installer path}; shift 2 ;;
    --provisioning) provisioning=${2:?missing provisioning ISO path}; shift 2 ;;
    --bootstrap) bootstrap=${2:?missing FAT bootstrap image path}; shift 2 ;;
    --output) output=${2:?missing output path}; shift 2 ;;
    --ssh-port) ssh_port=${2:?missing SSH port}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

firmware='/Applications/UTM.app/Contents/Resources/qemu/edk2-arm-vars.fd'
qemu_img="$(command -v qemu-img || true)"
expected_installer='638AA2C88E94385B00F4F178D071E3DF0B7D9E335577A83BD533B7F2EB65ADF0'

[[ -n "$installer" && -n "$provisioning" && -n "$bootstrap" ]] || { usage >&2; exit 2; }
[[ "$ssh_port" =~ ^[1-9][0-9]{0,4}$ ]] && ((ssh_port <= 65535)) || { echo 'SSH port must be 1 through 65535.' >&2; exit 2; }
for file in "$installer" "$provisioning" "$bootstrap" "$firmware" "$qemu_img"; do
  [[ -e "$file" ]] || { echo "Required file is missing: $file" >&2; exit 2; }
done
[[ ! -e "$output" ]] || { echo "Refusing to overwrite existing VM bundle: $output" >&2; exit 2; }
[[ "$(shasum -a 256 "$installer" | awk '{print toupper($1)}')" == "$expected_installer" ]] || { echo 'Windows installer checksum does not match Microsoft’s published English ARM64 value.' >&2; exit 2; }
if lsof -nP -iTCP:"$ssh_port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Host TCP port $ssh_port is already in use." >&2
  exit 2
fi

uuid=$(uuidgen | tr '[:lower:]' '[:upper:]')
disk_uuid=$(uuidgen | tr '[:lower:]' '[:upper:]')
installer_uuid=$(uuidgen | tr '[:lower:]' '[:upper:]')
provisioning_uuid=$(uuidgen | tr '[:lower:]' '[:upper:]')
bootstrap_uuid=$(uuidgen | tr '[:lower:]' '[:upper:]')
random_byte() { od -An -N1 -tu1 /dev/urandom | tr -d '[:space:]'; }
mac=$(printf '02:%02X:%02X:%02X:%02X:%02X' "$(random_byte)" "$(random_byte)" "$(random_byte)" "$(random_byte)" "$(random_byte)")
mkdir -p "$output/Data"
trap 'rm -rf "$output"' ERR INT TERM

cp -p "$installer" "$output/Data/windows-installer.iso"
cp -p "$provisioning" "$output/Data/camofox-provisioning.iso"
cp -p "$bootstrap" "$output/Data/windows-fat-bootstrap.img"
cp -p "$firmware" "$output/Data/efi_vars.fd"
"$qemu_img" create -f qcow2 "$output/Data/$disk_uuid.qcow2" 80G >/dev/null

python3 - "$output/config.plist" "$uuid" "$disk_uuid" "$installer_uuid" "$provisioning_uuid" "$bootstrap_uuid" "$mac" "$ssh_port" <<'PY'
import plistlib, sys
path, uuid, disk, install_cd, provision_cd, bootstrap_disk, mac, port = sys.argv[1:]
def drive(identifier, name, image_type, interface, read_only=False):
    return {'Identifier': identifier, 'ImageName': name, 'ImageType': image_type,
            'Interface': interface, 'InterfaceVersion': 1, 'ReadOnly': read_only}
config = {
 'Backend': 'QEMU', 'ConfigurationVersion': 4,
 'Information': {'Icon': 'windows', 'IconCustom': False, 'Name': 'Camofox Windows E2E', 'UUID': uuid},
 'System': {'Architecture': 'aarch64', 'CPU': 'default', 'CPUCount': 8, 'CPUFlagsAdd': [], 'CPUFlagsRemove': [],
            'ForceMulticore': False, 'JITCacheSize': 0, 'MemorySize': 16384, 'Target': 'virt'},
 'QEMU': {'AdditionalArguments': [], 'BalloonDevice': False, 'DebugLog': True, 'Hypervisor': True,
          'PS2Controller': False, 'RNGDevice': True, 'RTCLocalTime': True, 'TPMDevice': True, 'TSO': False, 'UEFIBoot': True},
 'Input': {'MaximumUsbShare': 3, 'UsbBusSupport': '3.0', 'UsbSharing': False},
 'Sharing': {'ClipboardSharing': False, 'DirectoryShareMode': 'None', 'DirectoryShareReadOnly': True},
 'Display': [{'DownscalingFilter': 'Linear', 'DynamicResolution': False, 'Hardware': 'virtio-ramfb-gl', 'NativeResolution': False, 'UpscalingFilter': 'Nearest'}],
 'Drive': [drive(bootstrap_disk, 'windows-fat-bootstrap.img', 'Disk', 'USB', True), drive(provision_cd, 'camofox-provisioning.iso', 'CD', 'USB', True), drive(install_cd, 'windows-installer.iso', 'Disk', 'USB', True), drive(disk, disk + '.qcow2', 'Disk', 'NVMe')],
 'Network': [{'Hardware': 'virtio-net-pci', 'IsolateFromHost': False, 'MacAddress': mac, 'Mode': 'Emulated',
              'PortForward': [{'Protocol': 'TCP', 'HostAddress': '127.0.0.1', 'HostPort': int(port), 'GuestAddress': '127.0.0.1', 'GuestPort': 22}]}],
 'Serial': [], 'Sound': [{'Hardware': 'intel-hda'}]
}
with open(path, 'wb') as f: plistlib.dump(config, f, sort_keys=False)
PY
plutil -lint "$output/config.plist" >/dev/null
"$qemu_img" check "$output/Data/$disk_uuid.qcow2" >/dev/null
trap - ERR INT TERM
printf 'Created isolated UTM bundle: %s\nUUID: %s\nSSH: ssh -i ~/.ssh/camofox-windows-e2e -p %s camofox-e2e@127.0.0.1\n' "$output" "$uuid" "$ssh_port"
open -g -a UTM "$output"
