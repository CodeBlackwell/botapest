"""Nation view: many repos as one map, grouped into states.

discover_repos() finds git repos one level under a root. summarize() reads
cheap git stats per repo (no file-content reads, so it scales to dozens).
load_nation() folds in an optional .botapest-nation.json that names the
states (repo clusters) and lineage roads between them.
"""
import json
import time
from collections import Counter
from pathlib import Path

from .seed import git

PALETTE = ["#16a085", "#5b8dd9", "#c0395b", "#d4a953", "#8e5d9f",
           "#b5651d", "#2980b9", "#4a6b5c", "#c9b78a", "#5c6b73"]


def discover_repos(root: str) -> list[str]:
    out = []
    for entry in sorted(Path(root).iterdir()):
        if entry.is_symlink() or not entry.is_dir():
            continue
        if (entry / ".git").exists():
            out.append(entry.name)
    return out


def summarize(repo: str) -> dict:
    files = git(repo, "ls-files").splitlines()
    last = git(repo, "log", "-1", "--format=%ct").strip()
    commits = git(repo, "rev-list", "--count", "HEAD").strip()
    exts = Counter(Path(f).suffix.lstrip(".").lower() for f in files if "." in f)
    age = round((time.time() - int(last)) / 86400) if last else 9999
    return {"files": len(files), "commits": int(commits or 0), "age_days": age,
            "lang": (exts.most_common(1) or [("", 0)])[0][0]}


def load_nation(root: str, manifest_path: str | None) -> dict:
    repos = discover_repos(root)
    path = Path(manifest_path) if manifest_path else Path(root) / ".botapest-nation.json"
    man = json.loads(path.read_text()) if path.exists() else {}

    state_of, states = {}, []
    for i, st in enumerate(man.get("states", [])):
        members = [r for r in st["repos"] if r in repos]
        if not members:
            continue
        for r in members:
            state_of[r] = st["id"]
        states.append({"id": st["id"], "name": st.get("name", st["id"]),
                       "color": st.get("color", PALETTE[i % len(PALETTE)]), "repos": members})
    loose = [r for r in repos if r not in state_of]
    if loose:
        for r in loose:
            state_of[r] = "frontier"
        states.append({"id": "frontier", "name": "Frontier", "color": "#7d6b8a", "repos": loose})

    cities = [{"repo": r, "state": state_of[r], **summarize(str(Path(root) / r))} for r in repos]
    roads = [e for e in man.get("roads", []) if e["from"] in repos and e["to"] in repos]
    return {"root": Path(root).resolve().name, "states": states, "cities": cities, "roads": roads}
