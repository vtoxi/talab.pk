"""Lists UI strings used with the `t` pipe or i18n.t() that have no Urdu entry. Run from frontend/: python scripts/check-i18n.py"""
import glob
import re
import sys

src = open("src/app/core/i18n.ur.ts", encoding="utf-8").read()
keys = set()
for m in re.finditer(r"'((?:[^'\\]|\\.)*)'\s*:\s*'", src):
    keys.add(m.group(1).replace("\\'", "'"))
for m in re.finditer(r'"((?:[^"\\]|\\.)*)"\s*:\s*\'', src):
    keys.add(m.group(1))

# strings the app builds in code and passes through `| t` as variables
dynamic = [
    "Looking for something", "Owner", "Agent", "Admin",
    "📋 My request", "➕ Post a request", "📋 Requests for you", "⚙️ Admin panel",
    "⏳ Waiting", "✅ Accepted", "✖ Declined", "↩ Withdrawn",
    "Flat", "House", "Shop", "Office", "Room", "Plot", "flat", "house", "shop", "office", "room", "plot",
    "Islamabad", "Rawalpindi", "Other Punjab", "Other", "Residential", "Commercial",
    "Offer accepted.", "Offer rejected.", "Offer withdrawn.", "Proposed new terms",
    "Accept this offer?", "Decline this offer?", "Withdraw your offer?",
    "Father's or husband's name",
]

used = {}
for f in glob.glob("src/app/**/*.ts", recursive=True):
    p = f.replace("\\", "/")
    if "/admin/" in p or p.endswith(("i18n.ur.ts", "i18n.service.ts")):
        continue
    text = open(f, encoding="utf-8").read()
    for m in re.finditer(r"""(['"])((?:(?!\1).)+?)\1\)?\s*\|\s*t\b""", text):
        used.setdefault(m.group(2), p)
    for m in re.finditer(r"""i18n\.(?:t|err)\(\s*(?:[\w.?]+,\s*)?(['"])((?:(?!\1).)+?)\1""", text):
        used.setdefault(m.group(2), p)
for d in dynamic:
    used.setdefault(d, "(built in code)")

missing = sorted(k for k in used if k not in keys)
print(f"strings used: {len(used)} | Urdu entries: {len(keys)}")
for k in missing:
    print("MISSING:", repr(k), "<-", used[k])
sys.exit(1 if missing else 0)
