"""Escribe status.js con el estado de las actualizaciones para la barra de arriba de la página.

Variables que usa (las pone el workflow):
  DESCARGA_OK   1 si esta corrida bajó el mundo, 0 si no
  EVENTO        schedule, workflow_dispatch o push
  GH_TOKEN      token de GitHub para leer las corridas anteriores
  GITHUB_REPOSITORY, GITHUB_RUN_ID
"""
import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent
AR = timezone(timedelta(hours=-3))


def runs() -> list:
    repo, token = os.environ.get("GITHUB_REPOSITORY"), os.environ.get("GH_TOKEN")
    if not repo or not token:
        return []
    url = f"https://api.github.com/repos/{repo}/actions/workflows/actualizar.yml/runs?per_page=40"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"})
    try:
        data = json.load(urllib.request.urlopen(req, timeout=30))
    except Exception as e:
        print(f"No pude leer las corridas anteriores: {e}")
        return []
    out, since = [], datetime.now(timezone.utc) - timedelta(hours=24)
    for r in data.get("workflow_runs", []):
        if str(r["id"]) == os.environ.get("GITHUB_RUN_ID") or r["status"] != "completed":
            continue
        t = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
        if t < since:
            continue
        out.append({"hora": t.astimezone(AR).strftime("%Y-%m-%d %H:%M"), "evento": r["event"],
                    "ok": r["conclusion"] == "success"})
    return out


def main() -> None:
    status = {
        "generado": datetime.now(AR).strftime("%Y-%m-%d %H:%M"),
        "evento": os.environ.get("EVENTO", "local"),
        "descarga_ok": os.environ.get("DESCARGA_OK", "1") == "1",
        "corridas": runs(),
    }
    (ROOT / "status.js").write_text("window.STATUS = " + json.dumps(status, ensure_ascii=False) + ";\n", encoding="utf-8")
    fallas = [c for c in status["corridas"] if not c["ok"]]
    print(f"Estado: descarga {'ok' if status['descarga_ok'] else 'FALLÓ'}, {len(fallas)} fallas en 24 h")


if __name__ == "__main__":
    main()
