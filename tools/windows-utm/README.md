# Windows ARM64 UTM E2E runner (macOS)

This directory creates a **new, isolated** Windows 11 ARM64 virtual machine (VM) in [UTM](https://mac.getutm.app/) for reproducing Camofox Windows failures locally. It is developer tooling, not part of the Camofox runtime or CI job.

The GitHub Actions Windows job remains the normal test path. Use this only when a hosted Windows failure needs interactive or SSH-based investigation.

## What is checked in

- `build-installer-autoboot-iso.sh` creates a derived, verified copy of Microsoft's ARM64 installer with a UEFI fallback so UTM can boot it unattended.
- `build-fat-bootstrap.py` creates a UEFI-readable FAT32 bootstrap image from that installer.
- `build-provisioning-iso.sh` creates the one-time Windows Setup answer ISO and embeds **one supplied public SSH key**.
- `create-vm.sh` assembles those inputs into a new UTM bundle with an isolated sparse NVMe disk and loopback-only SSH forwarding.

Do not commit the Windows installer, generated ISOs or images, UTM bundles, VM disks, UEFI/TPM state, debug logs, or SSH keys.

## Requirements

- macOS on Apple silicon
- UTM installed in `/Applications/UTM.app`
- `qemu-img` on `PATH` (for example, `brew install qemu`)
- Python 3
- A Microsoft Windows 11 ARM64 ISO whose SHA-256 is:

  ```text
  638AA2C88E94385B00F4F178D071E3DF0B7D9E335577A83BD533B7F2EB65ADF0
  ```

  The scripts refuse another image rather than silently using an unreviewed Windows build.

## Create the VM

Run these commands from the repository root. Choose an artifact directory outside the repository; generated files are large.

```sh
mkdir -p "$HOME/Downloads/camofox-windows-e2e"
ssh-keygen -t ed25519 -f "$HOME/.ssh/camofox-windows-e2e" -C camofox-windows-e2e

# Replace this with the verified Microsoft ARM64 installer you downloaded.
WINDOWS_ISO="$HOME/Downloads/Win11_25H2_English_Arm64_v2.iso"
ARTIFACTS="$HOME/Downloads/camofox-windows-e2e"

# The derived installer retains Microsoft's files and adds only startup.nsh.
tools/windows-utm/build-installer-autoboot-iso.sh \
  --source "$WINDOWS_ISO" \
  --output "$ARTIFACTS/windows-installer.iso"

# This is for UTM firmware that cannot read the Windows UDF installer directly.
tools/windows-utm/build-fat-bootstrap.py \
  --source "$ARTIFACTS/windows-installer.iso" \
  --output "$ARTIFACTS/windows-fat-bootstrap.img"

# New-VM-only answer ISO. It embeds the public key, never the private key.
tools/windows-utm/build-provisioning-iso.sh \
  --public-key "$HOME/.ssh/camofox-windows-e2e.pub" \
  --output "$ARTIFACTS/camofox-windows-provisioning.iso"

# Creates a new VM; it refuses to overwrite an existing bundle.
tools/windows-utm/create-vm.sh \
  --installer "$ARTIFACTS/windows-installer.iso" \
  --provisioning "$ARTIFACTS/camofox-windows-provisioning.iso" \
  --bootstrap "$ARTIFACTS/windows-fat-bootstrap.img"
```

The final command opens UTM. Let Windows Setup finish. It creates the unprivileged `camofox-e2e` account, installs OpenSSH Server, and forwards guest port 22 only to `127.0.0.1:22222` on the Mac.

Once Windows is up, verify SSH:

```sh
ssh -i "$HOME/.ssh/camofox-windows-e2e" -p 22222 camofox-e2e@127.0.0.1
```

Then use that SSH session to run the bounded Windows test or inspect the Windows setup log at `C:\ProgramData\CamofoxE2E\provision.log`.

## Safety

`build-provisioning-iso.sh` creates an `Autounattend.xml` that wipes and partitions **disk 0**. Use its result only as installation media for a freshly created VM. Never attach it to an existing Windows machine or VM.

The VM creation script never overwrites an existing UTM bundle, and its SSH forward is loopback-only. Delete the entire generated UTM bundle and the artifact directory when the investigation is complete.
