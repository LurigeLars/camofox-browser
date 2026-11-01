#!/usr/bin/env python3
"""Reproducible upstream daijro/camoufox PR #976 Juggler compatibility patch.

Input: SHA256-verified upstream Camoufox beta.41 release archive.
Output: modified omni.ja checked against a pinned SHA256 digest.
Fail closed if source layout/preimages or output digest change. Does not
alter Firefox popup blocker, camouflage features, or executable binary.
"""
import argparse
import hashlib
import os
import pathlib
import stat
import sys
import tempfile
import zipfile

def replace_once(data, old, new, label):
    if data.count(old) != 1:
        raise ValueError(f"{label}: expected one exact preimage, found {data.count(old)}")
    return data.replace(old, new)

def transform(basename, raw):
    text = raw.decode("utf-8")
    if basename == "Protocol.js":
        text = replace_once(text, """    'setRequestInterception': {
      params: {
        enabled: t.Boolean,
      },
    },""", """    'setRequestInterception': {
      params: {
        enabled: t.Boolean,
        bypassServiceWorker: t.Optional(t.Boolean),
      },
    },""", "Network protocol schema")
    elif basename == "PageHandler.js":
        text = replace_once(text,
            "async ['Network.setRequestInterception']({enabled}) {\n    if (enabled)\n      this._pageNetwork.enableRequestInterception();",
            "async ['Network.setRequestInterception']({enabled, bypassServiceWorker}) {\n    if (enabled)\n      this._pageNetwork.enableRequestInterception(bypassServiceWorker);",
            "PageHandler forwarding")
    elif basename == "NetworkObserver.js":
        text = replace_once(text,
            "    this._requestInterceptionEnabled = false;\n    // This is requestId",
            "    this._requestInterceptionEnabled = false;\n    this._bypassServiceWorker = false;\n    // This is requestId",
            "NetworkObserver state")
        text = replace_once(text,
            "  enableRequestInterception() {\n    this._requestInterceptionEnabled = true;\n  }",
            "  enableRequestInterception(bypassServiceWorker = false) {\n    this._requestInterceptionEnabled = true;\n    this._bypassServiceWorker = !!bypassServiceWorker;\n  }",
            "NetworkObserver enable")
        text = replace_once(text,
            "  disableRequestInterception() {\n    this._requestInterceptionEnabled = false;",
            "  disableRequestInterception() {\n    this._requestInterceptionEnabled = false;\n    this._bypassServiceWorker = false;",
            "NetworkObserver disable")
        text = replace_once(text,
            "    const interceptController = this._fallThroughInterceptController();",
            "    const interceptController = this._shouldBypassServiceWorker() ? undefined : this._fallThroughInterceptController();",
            "NetworkObserver service-worker routing")
        text = replace_once(text,
            "  _fallThroughInterceptController() {",
            "  _shouldBypassServiceWorker() {\n    return !!this._pageNetwork?._bypassServiceWorker && this._shouldIntercept();\n  }\n\n  _fallThroughInterceptController() {",
            "NetworkObserver helper")
    else:
        raise ValueError(f"Unexpected module {basename}")
    return text.encode("utf-8")

def main(root, expected_sha256=None):
    names = {"Protocol.js", "PageHandler.js", "NetworkObserver.js"}
    found = []
    for archive in pathlib.Path(root).rglob("omni.ja"):
        with zipfile.ZipFile(archive, "r") as src:
            matches = {n: n.rsplit("/", 1)[-1] for n in src.namelist()
                       if n.rsplit("/", 1)[-1] in names and "juggler" in n.lower()}
            if set(matches.values()) == names and len(matches) == 3:
                found.append((archive, matches))
    if len(found) != 1:
        raise ValueError(f"Expected one Juggler omni.ja, found {len(found)} at {root}")
    archive, matched = found[0]
    staged = {}
    with zipfile.ZipFile(archive, "r") as src:
        for entry, basename in matched.items():
            staged[entry] = transform(basename, src.read(entry))
        handle, temporary = tempfile.mkstemp(prefix=".juggler-test-", suffix=".ja", dir=archive.parent)
        os.close(handle)
        try:
            with zipfile.ZipFile(temporary, "w") as dst:
                dst.comment = src.comment
                for member in src.infolist():
                    data = staged.get(member.filename)
                    dst.writestr(member, data if data is not None else src.read(member))
            with zipfile.ZipFile(temporary, "r") as verify:
                if verify.testzip() is not None:
                    raise ValueError("Modified omni.ja CRC check failed")
                for entry, data in staged.items():
                    if verify.read(entry) != data:
                        raise ValueError(f"Modified omni.ja content mismatch: {entry}")
            digest = hashlib.file_digest(open(temporary, "rb"), "sha256").hexdigest()
            if expected_sha256 and digest != expected_sha256:
                raise ValueError(f"Patched omni.ja SHA256 mismatch: got {digest}")
            os.chmod(temporary, stat.S_IMODE(archive.stat().st_mode))
            os.replace(temporary, archive)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    print(f"Applied exact PR #976 Juggler transformations to {archive}")
    print(f"PATCHED_OMNI_SHA256={digest}")
    print(f"Patched members: {', '.join(sorted(matched))}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("browser_root")
    parser.add_argument("--expect-sha256", help="Required in production builds; verify the exact patched omni.ja bytes")
    args = parser.parse_args()
    if args.expect_sha256 and (len(args.expect_sha256) != 64 or any(c not in "0123456789abcdef" for c in args.expect_sha256)):
        parser.error("Expected 64-character lowercase SHA256 digest")
    main(args.browser_root, args.expect_sha256)
