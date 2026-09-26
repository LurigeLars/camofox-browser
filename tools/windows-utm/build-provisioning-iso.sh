#!/bin/bash
# Build a Windows Setup answer ISO that provisions loopback-forwarded SSH for UTM E2E.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/windows-utm/build-provisioning-iso.sh --public-key PATH --output PATH

Creates a first-install-only Windows answer ISO. The public key is embedded in the
ISO; no private key is read, copied, or printed.
EOF
}

public_key_file=''
output=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-key) public_key_file=${2:-}; shift 2 ;;
    --output) output=${2:-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done

[[ -n "$public_key_file" && -n "$output" ]] || { usage >&2; exit 2; }
[[ -f "$public_key_file" ]] || { echo "Public-key file does not exist: $public_key_file" >&2; exit 2; }
command -v hdiutil >/dev/null || { echo 'hdiutil is required (macOS).' >&2; exit 2; }

public_key=$(tr -d '\r\n' < "$public_key_file")
if [[ ! "$public_key" =~ ^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com|ssh-rsa)[[:space:]][A-Za-z0-9+/=]+([[:space:]].*)?$ ]]; then
  echo 'Expected one single-line OpenSSH public key.' >&2
  exit 2
fi

output=$(cd "$(dirname "$output")" && pwd)/$(basename "$output")
[[ "$output" == *.iso ]] || { echo 'Output filename must end in .iso.' >&2; exit 2; }
mkdir -p "$(dirname "$output")"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
printf '%s\n' "$public_key" > "$work/camofox-e2e.pub"

cat > "$work/Autounattend.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
  <!-- This answer file only ever targets disk 0 of the newly created UTM VM. -->
  <settings pass="windowsPE">
    <component name="Microsoft-Windows-Setup" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <DiskConfiguration>
        <Disk wcm:action="add" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <DiskID>0</DiskID>
          <WillWipeDisk>true</WillWipeDisk>
          <CreatePartitions>
            <CreatePartition wcm:action="add"><Order>1</Order><Type>EFI</Type><Size>260</Size></CreatePartition>
            <CreatePartition wcm:action="add"><Order>2</Order><Type>MSR</Type><Size>16</Size></CreatePartition>
            <CreatePartition wcm:action="add"><Order>3</Order><Type>Primary</Type><Extend>true</Extend></CreatePartition>
          </CreatePartitions>
          <ModifyPartitions>
            <ModifyPartition wcm:action="add"><Order>1</Order><PartitionID>1</PartitionID><Format>FAT32</Format><Label>System</Label></ModifyPartition>
            <ModifyPartition wcm:action="add"><Order>2</Order><PartitionID>3</PartitionID><Format>NTFS</Format><Label>Windows</Label><Letter>C</Letter></ModifyPartition>
          </ModifyPartitions>
        </Disk>
        <WillShowUI>OnError</WillShowUI>
      </DiskConfiguration>
      <ImageInstall>
        <OSImage>
          <InstallTo><DiskID>0</DiskID><PartitionID>3</PartitionID></InstallTo>
          <InstallToAvailablePartition>false</InstallToAvailablePartition>
          <WillShowUI>OnError</WillShowUI>
        </OSImage>
      </ImageInstall>
      <UserData>
        <!-- Microsoft’s public generic Pro setup key selects the edition; it does not activate Windows. -->
        <ProductKey><Key>VK7JG-NPHTM-C97JM-9MPGT-3V66T</Key><WillShowUI>OnError</WillShowUI></ProductKey>
        <AcceptEula>true</AcceptEula>
        <FullName>Camofox E2E</FullName>
        <Organization>Camofox</Organization>
      </UserData>
    </component>
  </settings>
  <settings pass="specialize">
    <component name="Microsoft-Windows-Deployment" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <RunSynchronous>
        <RunSynchronousCommand wcm:action="add" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <Order>1</Order>
          <Description>Provision Camoufox Windows E2E SSH</Description>
          <Path>powershell.exe -NoProfile -ExecutionPolicy Bypass -Command &quot;$volume = Get-Volume | Where-Object { $_.FileSystemLabel -eq 'CAMOFOX_E2E' } | Select-Object -First 1; if (-not $volume) { throw 'CAMOFOX_E2E media is not mounted' }; &amp; &quot;&quot;$($volume.DriveLetter):\provision.ps1&quot;&quot;&quot;</Path>
        </RunSynchronousCommand>
      </RunSynchronous>
    </component>
  </settings>
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="arm64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <OOBE>
        <HideEULAPage>true</HideEULAPage>
        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
        <ProtectYourPC>3</ProtectYourPC>
        <SkipMachineOOBE>true</SkipMachineOOBE>
        <SkipUserOOBE>true</SkipUserOOBE>
      </OOBE>
    </component>
  </settings>
</unattend>
EOF

cat > "$work/provision.ps1" <<'EOF'
$ErrorActionPreference = 'Stop'
$root = 'C:\ProgramData\CamofoxE2E'
$log = Join-Path $root 'provision.log'
$taskName = 'CamofoxE2E-InstallOpenSSH'
New-Item -ItemType Directory -Path $root -Force | Out-Null
function Write-Log([string]$Message) { "$(Get-Date -Format o) $Message" | Tee-Object -FilePath $log -Append }
function Install-OpenSsh {
  $capability = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
  if ($capability.State -ne 'Installed') {
    Write-Log "Installing OpenSSH Server capability (state: $($capability.State))."
    Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Out-Null
  }
}
function Configure-Ssh {
  $keyPath = Join-Path $root 'camofox-e2e_authorized_keys'
  if (-not (Test-Path $keyPath)) { throw "Missing authorized key: $keyPath" }
  $user = Get-LocalUser -Name 'camofox-e2e' -ErrorAction SilentlyContinue
  if (-not $user) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $password = ConvertTo-SecureString (([Convert]::ToBase64String($bytes)) + 'aA1!') -AsPlainText -Force
    New-LocalUser -Name 'camofox-e2e' -Password $password -AccountNeverExpires -Description 'Camofox Windows E2E runner' | Out-Null
    Remove-Variable password, bytes
    Write-Log 'Created the camofox-e2e local account with a random non-recoverable password.'
  }
  $config = 'C:\ProgramData\ssh\sshd_config'
  $marker = '# Camofox Windows E2E provisioning'
  if (-not (Select-String -Path $config -SimpleMatch $marker -Quiet -ErrorAction SilentlyContinue)) {
    Add-Content -Path $config -Value @"

$marker
PasswordAuthentication no
PubkeyAuthentication yes
Match User camofox-e2e
    AuthorizedKeysFile C:/ProgramData/CamofoxE2E/camofox-e2e_authorized_keys
"@
  }
  & icacls $root /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'Administrators:(OI)(CI)F' | Out-Null
  if (-not (Get-NetFirewallRule -DisplayName 'Camofox E2E SSH' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'Camofox E2E SSH' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 | Out-Null
  }
  Set-Service sshd -StartupType Automatic
  Restart-Service sshd -Force
}

# On first execution, retain the script and the public key locally before Setup ejects this ISO.
$keyPath = Join-Path $root 'camofox-e2e_authorized_keys'
if (-not (Test-Path $keyPath)) {
  $volume = Get-Volume | Where-Object { $_.FileSystemLabel -eq 'CAMOFOX_E2E' } | Select-Object -First 1
  if (-not $volume) { throw 'CAMOFOX_E2E media is not mounted' }
  Copy-Item "$($volume.DriveLetter):\camofox-e2e.pub" $keyPath -Force
  Copy-Item $PSCommandPath (Join-Path $root 'provision.ps1') -Force
}

# Retry during subsequent boots if Windows Update was not ready in specialize.
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File $root\provision.ps1"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
try {
  Install-OpenSsh
  Configure-Ssh
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Log 'Provisioning complete. OpenSSH is ready for key-only camofox-e2e access.'
} catch {
  Write-Log "Provisioning deferred: $($_.Exception.Message)"
  exit 0
}
EOF

# The UEFI shell searches its current mapped filesystem for startup.nsh. Put an
# identical fallback on this secondary ISO too, then probe every removable
# filesystem explicitly so UTM's firmware mapping order cannot matter.
cat > "$work/startup.nsh" <<'EOF'
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

rm -f "$output"
hdiutil makehybrid -iso -joliet -default-volume-name CAMOFOX_E2E -o "$output" "$work" >/dev/null
printf 'Created %s\nSHA-256 %s\n' "$output" "$(shasum -a 256 "$output" | awk '{print $1}')"
