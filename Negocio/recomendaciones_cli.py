"""CLI puente para consumir recomendaciones.py desde otros procesos.

Entrada: JSON por stdin.
Salida: JSON por stdout.
"""

from __future__ import annotations

import json
import sys
from typing import Any

from recomendaciones import load_recommender_context, recommend_restaurants


def _ok(payload: dict[str, Any]) -> None:
    print(json.dumps({"ok": True, **payload}, ensure_ascii=False))


def _error(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))


def main() -> int:
    try:
        raw = sys.stdin.read().strip()
        req = json.loads(raw) if raw else {}

        action = req.get("action", "recommend")
        ctx = load_recommender_context()

        if action == "tipos":
            _ok({"tipos": ctx.tipos})
            return 0

        resultados = recommend_restaurants(
            ctx=ctx,
            tipos=req.get("tipos", []),
            min_rating=float(req.get("minRating", 4.0)),
            max_precio=float(req.get("maxPrecio", 300.0)),
            lat_usuario=float(req.get("latUsuario")),
            lon_usuario=float(req.get("lonUsuario")),
            top_n=int(req.get("topN", 10)),
        )

        _ok({"restaurants": resultados.to_dict(orient="records")})
        return 0
    except Exception as exc:  # pragma: no cover
        _error(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
