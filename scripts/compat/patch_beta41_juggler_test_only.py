#!/usr/bin/env python3
"""EXPERIMENT ONLY: apply daijro/camoufox PR #976 Juggler changes to beta.41's omni.ja.

Never use this as a production installer. The released binary's original ZIP SHA256
must be verified before this program runs. All source edits fail closed against
exact preimages; no browser settings, popup blocker, or fingerprinting are changed.
"""
import os
import pathlib
import stat
import sys
import tempfile
import zipfile

def replace_once(data, old, new, label):
    assert data.count(old) == 1, f"{label}: expected one exact preimage, found {data.count(old)}"
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

def main(root):
    names = {"Protocol.js", "PageHandler.js", "NetworkObserver.js"}
    found = []
    for archive in pathlib.Path(root).rglob("omni.ja"):
        with zipfile.ZipFile(archive, "r") as src:
            matches = {n: n.rsplit("/", 1)[-1] for n in src.namelist()
                       if n.rsplit("/", 1)[-1] in names and "juggler" in n.lower()}
            if set(matches.values()) == names and len(matches) == 3:
                found.append((archive, matches))
    assert len(found) == 1, f"Expected one Juggler omni.ja, found {len(found)} at {root}"
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
                assert verify.testzip() is None, "Modified omni.ja CRC check failed"
                for entry, data in staged.items():
                    assert verify.read(entry) == data
            os.chmod(temporary, stat.S_IMODE(archive.stat().st_mode))
            os.replace(temporary, archive)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    print(f"Applied exact PR #976 Juggler transformations to {archive}")
    print(f"Patched members: {', '.join(sorted(matched))}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_beta41_juggler_test_only.py /path/to/extracted/camoufox")
    main(sys.argv[1])
