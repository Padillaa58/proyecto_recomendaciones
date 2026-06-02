"""Backend de recomendaciones con K-Means.

Este modulo no levanta servidor web.
Expone funciones para que otro script (por ejemplo Flask/FastAPI) consuma
la logica de recomendaciones.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

from preprocesamiento import cargar_dataset, limpiar, normalizar, transformar


BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR.parent / "Datos" / "denue_inegi_72_1_filtrado.xlsx"
META_PATH = BASE_DIR / "restaurantes_meta.csv"
PROC_PATH = BASE_DIR / "restaurantes_procesados.csv"

N_CLUSTERS = 8
RANDOM_STATE = 42


@dataclass
class RecommenderContext:
    data: pd.DataFrame
    tipos: list[str]


def _haversine_km(
    lat1: np.ndarray,
    lon1: np.ndarray,
    lat2: float,
    lon2: float,
) -> np.ndarray:
    """Distancia Haversine en km entre arrays y un punto de referencia."""
    r = 6371.0

    lat1_rad = np.radians(lat1)
    lon1_rad = np.radians(lon1)
    lat2_rad = np.radians(lat2)
    lon2_rad = np.radians(lon2)

    d_lat = lat2_rad - lat1_rad
    d_lon = lon2_rad - lon1_rad

    a = (
        np.sin(d_lat / 2.0) ** 2
        + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * np.arctan2(np.sqrt(a), np.sqrt(1.0 - a))
    return r * c


def _build_preprocessed_files() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Genera meta + features escaladas desde el dataset original."""
    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            f"No se encontro el dataset en: {DATASET_PATH}. "
            "Actualiza DATASET_PATH en recomendaciones.py"
        )

    df_raw = cargar_dataset(str(DATASET_PATH))
    df_clean = limpiar(df_raw)
    df_meta, df_feat = transformar(df_clean)
    df_scaled, _ = normalizar(df_feat)

    df_meta.to_csv(META_PATH, index=False, encoding="utf-8")
    df_scaled.to_csv(PROC_PATH, index=False, encoding="utf-8")

    return df_meta, df_scaled


def _load_or_prepare_data() -> pd.DataFrame:
    """Carga datos preprocesados. Si no existen, los crea."""
    if META_PATH.exists() and PROC_PATH.exists():
        df_meta = pd.read_csv(META_PATH)
        df_proc = pd.read_csv(PROC_PATH)
    else:
        df_meta, df_proc = _build_preprocessed_files()

    if len(df_meta) != len(df_proc):
        raise ValueError(
            "restaurantes_meta.csv y restaurantes_procesados.csv tienen distinta longitud. "
            "Regenera ambos archivos con el preprocesamiento."
        )

    model = KMeans(n_clusters=N_CLUSTERS, random_state=RANDOM_STATE, n_init=10)
    clusters = model.fit_predict(df_proc)

    df = df_meta.copy()
    df["cluster"] = clusters
    return df


def _safe_float(value: str | None, default: float) -> float:
    if value is None or value.strip() == "":
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _score_recommendations(
    df: pd.DataFrame,
    tipos: Iterable[str],
    min_rating: float,
    max_precio: float,
    lat_usuario: float,
    lon_usuario: float,
    top_n: int = 10,
) -> pd.DataFrame:
    """Aplica filtro de preferencias + ranking.

    Prioridad principal: cercania al usuario.
    """
    work = df.copy()
    tipos = [t for t in tipos if t]

    if tipos:
        work = work[work["nombre_act"].isin(tipos)]

    work = work[work["rating"] >= min_rating]
    work = work[work["precio"] <= max_precio]

    if work.empty:
        return work

    work["dist_km"] = _haversine_km(
        work["latitud"].to_numpy(),
        work["longitud"].to_numpy(),
        lat_usuario,
        lon_usuario,
    )

    # Cluster preferido: el mas frecuente en el subconjunto filtrado.
    cluster_objetivo = int(work["cluster"].mode().iloc[0])
    work["cluster_match"] = (work["cluster"] == cluster_objetivo).astype(float)

    # Score de distancia: entre mas cerca, mas alto.
    work["dist_score"] = 1.0 / (1.0 + work["dist_km"])

    # Ajuste secundario por calidad/precio.
    work["rating_score"] = work["rating"] / 5.0
    work["price_score"] = 1.0 - np.minimum(work["precio"] / max(max_precio, 1.0), 1.0)
    work["quality_score"] = 0.7 * work["rating_score"] + 0.3 * work["price_score"]

    work["score_final"] = (
        0.75 * work["dist_score"]
        + 0.15 * work["cluster_match"]
        + 0.10 * work["quality_score"]
    )

    cols_show = [
        "nom_estab",
        "nombre_act",
        "rating",
        "precio",
        "latitud",
        "longitud",
        "dist_km",
        "cluster",
        "score_final",
    ]

    ranked_all = work.sort_values(
        ["dist_km", "score_final"],
        ascending=[True, False],
    )[cols_show].reset_index(drop=True)

    # Si el usuario selecciona varios tipos, intercalamos resultados por tipo
    # para evitar que una sola categoria domine todo el top N.
    tipos_unicos = sorted(set(tipos))
    if len(tipos_unicos) <= 1:
        return ranked_all.head(top_n).sort_values(
            ["dist_km", "score_final"], ascending=[True, False]
        )

    by_tipo: dict[str, list[dict]] = {}
    for tipo in tipos_unicos:
        rows = ranked_all[ranked_all["nombre_act"] == tipo]
        by_tipo[tipo] = rows.to_dict(orient="records")

    selected: list[dict] = []
    seen: set[tuple[str, float, float]] = set()

    # Primera vuelta: intentar incluir al menos uno por tipo seleccionado.
    for tipo in tipos_unicos:
        if by_tipo[tipo]:
            row = by_tipo[tipo].pop(0)
            key = (row["nom_estab"], row["latitud"], row["longitud"])
            if key not in seen:
                selected.append(row)
                seen.add(key)
            if len(selected) >= top_n:
                return pd.DataFrame(selected, columns=cols_show).sort_values(
                    ["dist_km", "score_final"], ascending=[True, False]
                )

    # Siguientes vueltas: round-robin por tipo.
    while len(selected) < top_n:
        added_this_round = False
        for tipo in tipos_unicos:
            if not by_tipo[tipo]:
                continue
            row = by_tipo[tipo].pop(0)
            key = (row["nom_estab"], row["latitud"], row["longitud"])
            if key in seen:
                continue
            selected.append(row)
            seen.add(key)
            added_this_round = True
            if len(selected) >= top_n:
                break
        if not added_this_round:
            break

    if len(selected) < top_n:
        # Relleno con mejores restantes para completar top N.
        for row in ranked_all.to_dict(orient="records"):
            key = (row["nom_estab"], row["latitud"], row["longitud"])
            if key in seen:
                continue
            selected.append(row)
            seen.add(key)
            if len(selected) >= top_n:
                break

    return pd.DataFrame(selected, columns=cols_show).sort_values(
        ["dist_km", "score_final"], ascending=[True, False]
    )


def load_recommender_context() -> RecommenderContext:
    """Carga data y catalogo de tipos."""
    df = _load_or_prepare_data()
    tipos_disponibles = sorted(df["nombre_act"].dropna().unique().tolist())
    return RecommenderContext(data=df, tipos=tipos_disponibles)


def recommend_restaurants(
    ctx: RecommenderContext,
    tipos: Iterable[str] | None,
    min_rating: float,
    max_precio: float,
    lat_usuario: float,
    lon_usuario: float,
    top_n: int = 10,
) -> pd.DataFrame:
    """Funcion publica para obtener recomendaciones.

    Devuelve un DataFrame ordenado por score_final.
    """
    tipos = tipos or []

    if np.isnan(lat_usuario) or np.isnan(lon_usuario):
        raise ValueError("lat_usuario y lon_usuario deben ser valores numericos validos")

    top_n = max(1, min(int(top_n), 30))
    min_rating = _safe_float(str(min_rating), 4.0)
    max_precio = _safe_float(str(max_precio), 300.0)

    return _score_recommendations(
        ctx.data,
        tipos=tipos,
        min_rating=min_rating,
        max_precio=max_precio,
        lat_usuario=lat_usuario,
        lon_usuario=lon_usuario,
        top_n=top_n,
    )
