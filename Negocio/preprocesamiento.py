"""
preprocesamiento.py
====================
Proyecto: Sistema de recomendación de restaurantes (IPN - ESCOM)
Asignatura: Machine Learning

Este script realiza la Fase 1 y Fase 2 del pipeline:
  RF1 - Carga del dataset
  RF2 - Limpieza, transformación (one-hot encoding + ordinal) y normalización

Salida: restaurantes_procesados.csv  → listo para aplicar K-Means
"""

import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
import json
import os

# ─────────────────────────────────────────────
# RF1 · CARGA DEL DATASET
# ─────────────────────────────────────────────

RUTA_DATASET = "../Datos/denue_inegi_72_1_filtrado.xlsx"   # cambia si el archivo está en otra ruta

def cargar_dataset(ruta: str) -> pd.DataFrame:
    """Lee el archivo xlsx y devuelve un DataFrame."""
    df = pd.read_excel(ruta)
    print(f"[RF1] Dataset cargado: {df.shape[0]} registros, {df.shape[1]} columnas")
    return df


# ─────────────────────────────────────────────
# RF2 · PREPROCESAMIENTO
# ─────────────────────────────────────────────

# Columnas que necesita el sistema de recomendación (RF5)
COLUMNAS_ID = ["id", "nom_estab", "latitud", "longitud"]

# Columnas que se usarán como features para K-Means
COLUMNAS_FEATURES = ["nombre_act", "per_ocu", "precio", "rating"]


def limpiar(df: pd.DataFrame) -> pd.DataFrame:
    """
    Elimina filas con nulos en las columnas relevantes
    y registros con coordenadas fuera del rango de CDMX.
    """
    antes = len(df)

    # 1. Nulos en columnas clave
    cols_clave = COLUMNAS_ID + COLUMNAS_FEATURES
    df = df.dropna(subset=cols_clave)

    # 2. Valores inválidos en precio y rating
    df = df[(df["precio"] > 0) & (df["precio"] <= 500)]
    df = df[(df["rating"] >= 1.0) & (df["rating"] <= 5.0)]

    # 3. Coordenadas fuera de CDMX (bounding box aprox.)
    df = df[
        (df["latitud"].between(19.0, 19.7)) &
        (df["longitud"].between(-99.4, -98.9))
    ]

    print(f"[RF2-Limpieza] {antes} → {len(df)} registros  ({antes - len(df)} eliminados)")
    return df.reset_index(drop=True)


# Mapeo ordinal para tamaño del establecimiento
ORDEN_PER_OCU = {
    "0 a 5 personas":    1,
    "6 a 10 personas":   2,
    "11 a 30 personas":  3,
    "31 a 50 personas":  4,
    "51 a 100 personas": 5,
    "101 a 250 personas":6,
    "251 y más personas":7,
}

def transformar(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    - Codificación ordinal de per_ocu (tiene orden natural).
    - One-hot encoding de nombre_act (tipo de cocina/servicio).
    Devuelve:
      df_meta  → columnas de identidad para mostrar al usuario (RF5)
      df_feat  → columnas numéricas listas para escalar
    """
    df = df.copy()

    # Codificación ordinal: per_ocu
    df["per_ocu_ord"] = df["per_ocu"].map(ORDEN_PER_OCU).fillna(1).astype(int)

    # One-hot encoding: nombre_act (tipo de establecimiento)
    # Se usan prefijos cortos para legibilidad
    dummies = pd.get_dummies(df["nombre_act"], prefix="tipo").astype(int)

    # DataFrame de identidad (se conserva para reconstruir el resultado final)
    df_meta = df[COLUMNAS_ID + ["per_ocu", "nombre_act", "precio", "rating"]].copy()

    # DataFrame de features numéricas
    df_feat = pd.concat(
        [
            df[["precio", "rating", "per_ocu_ord", "latitud", "longitud"]],
            dummies,
        ],
        axis=1,
    )

    print(f"[RF2-Transform] Features generadas: {df_feat.shape[1]} columnas")
    print(f"  → Numéricas base: precio, rating, per_ocu_ord, latitud, longitud")
    print(f"  → One-hot tipos:  {dummies.shape[1]} columnas")
    return df_meta, df_feat


def normalizar(df_feat: pd.DataFrame) -> tuple[pd.DataFrame, StandardScaler]:
    """
    Aplica StandardScaler a todas las features.
    Devuelve el DataFrame normalizado y el scaler (para inversión posterior si se necesita).
    """
    scaler = StandardScaler()
    arr_scaled = scaler.fit_transform(df_feat)
    df_scaled = pd.DataFrame(arr_scaled, columns=df_feat.columns)
    print(f"[RF2-Normaliz.] StandardScaler aplicado sobre {df_scaled.shape[1]} features")
    return df_scaled, scaler


# ─────────────────────────────────────────────
# PIPELINE COMPLETO
# ─────────────────────────────────────────────

def preprocesar(ruta: str = RUTA_DATASET):
    """
    Ejecuta RF1 + RF2 completo y guarda dos archivos:
      - restaurantes_meta.csv      → datos de identidad del restaurante
      - restaurantes_procesados.csv → features normalizadas para K-Means
    """
    # RF1 - Carga
    df_raw = cargar_dataset(ruta)

    # RF2a - Limpieza
    df_clean = limpiar(df_raw)

    # RF2b - Transformación
    df_meta, df_feat = transformar(df_clean)

    # RF2c - Normalización
    df_scaled, scaler = normalizar(df_feat)

    # Guardar resultados
    df_meta.to_csv("restaurantes_meta.csv", index=False, encoding="utf-8")
    df_scaled.to_csv("restaurantes_procesados.csv", index=False, encoding="utf-8")

    # Guardar nombres de columnas de features (útil para K-Means)
    with open("features_columns.json", "w") as f:
        json.dump(df_feat.columns.tolist(), f, ensure_ascii=False, indent=2)

    print("\n✅ Preprocesamiento completado:")
    print(f"   restaurantes_meta.csv        → {len(df_meta)} registros (identidad)")
    print(f"   restaurantes_procesados.csv  → {df_scaled.shape} (features para K-Means)")
    print(f"   features_columns.json        → lista de columnas")

    return df_meta, df_scaled, scaler


# ─────────────────────────────────────────────
# PUNTO DE ENTRADA
# ─────────────────────────────────────────────

if __name__ == "__main__":
    df_meta, df_scaled, scaler = preprocesar()

    # Vista rápida de los datos resultantes
    print("\n── Primeras filas de restaurantes_meta.csv ──")
    print(df_meta.head(3).to_string())

    print("\n── Primeras filas de restaurantes_procesados.csv ──")
    print(df_scaled.iloc[:3, :6].to_string())   # solo primeras 6 features para no saturar