"""Prueba rapida del backend de recomendaciones."""

from recomendaciones import load_recommender_context, recommend_restaurants


def main() -> None:
    ctx = load_recommender_context()

    # Coordenadas de ejemplo (Centro CDMX)
    lat_usuario = 19.4326
    lon_usuario = -99.1332

    # Toma hasta 2 tipos disponibles para garantizar coincidencias
    tipos_ejemplo = ctx.tipos[:2]

    resultados = recommend_restaurants(
        ctx=ctx,
        tipos=tipos_ejemplo,
        min_rating=4.0,
        max_precio=300,
        lat_usuario=lat_usuario,
        lon_usuario=lon_usuario,
        top_n=10,
    )

    print("Tipos usados:", tipos_ejemplo if tipos_ejemplo else "(sin filtro)")

    if resultados.empty:
        print("No hubo resultados con los filtros de prueba.")
    else:
        print("\nTop recomendaciones:\n")
        print(resultados.to_string(index=False))


if __name__ == "__main__":
    main()
