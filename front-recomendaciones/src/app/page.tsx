"use client";

import { useEffect, useMemo, useState } from "react";

type Restaurant = {
  nom_estab: string;
  nombre_act: string;
  rating: number;
  precio: number;
  latitud: number;
  longitud: number;
  dist_km: number;
  cluster: number;
  score_final: number;
};

export default function Home() {
  const [showLocationModal, setShowLocationModal] = useState<boolean>(true);
  const [tipos, setTipos] = useState<string[]>([]);
  const [selectedTipos, setSelectedTipos] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<number>(4);
  const [maxPrecio, setMaxPrecio] = useState<number>(300);
  const [topN, setTopN] = useState<number>(10);
  const [latUsuario, setLatUsuario] = useState<string>("");
  const [lonUsuario, setLonUsuario] = useState<string>("");
  const [locationStatus, setLocationStatus] = useState<string>(
    "Ubicacion no capturada",
  );
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [showNotification, setShowNotification] = useState<boolean>(false);

  const categoryNameMap: { [key: string]: string } = {
    "Bares, cantinas y similares": "Bares y similares",
    "Cafeterías, fuentes de sodas, neverías, refresquerías y similares": "Fuentes de soda y neverias",
    "Departamentos y casas amueblados con servicios de hotelería": "Alojamientos amueblados con servicio de hotel y cocina",
    "Restaurantes con servicio de preparación de alimentos a la carta o de comida corrida": "Restaurantes de servicio a la mesa",
    "Restaurantes con servicio de preparación de antojitos": "Restaurante de antojitos",
    "Restaurantes con servicio de preparación de pescados y mariscos": "Restaurantes de mariscos",
    "Restaurantes con servicio de preparación de pizzas, hamburguesas, hot dogs y pollos rostizados para llevar": "Restaurantes de comida rápida para llevar",
    "Restaurantes con servicio de preparación de tacos y tortas": "Restaurantes de tacos y tortas",
    "Restaurantes que preparan otro tipo de alimentos para llevar": "Restaurantes de comida para llevar",
    "Servicios de preparación de alimentos en unidades móviles": "Servicios de alimentos en unidades moviles",
    "Servicios de preparación de alimentos para ocasiones especiales": "Servicios de alimentos para ocasiones especiales",
    "Servicios de preparación de otros alimentos para consumo inmediato": "Servicios de otros alimentos para consumo inmediato",
  };

  // Mapa inverso: nombre corto → nombre original del CSV
  const reverseCategoryMap: { [key: string]: string } = Object.fromEntries(
    Object.entries(categoryNameMap).map(([original, short]) => [short, original])
  );

  const shortenCategoryName = (name: string): string => {
    for (const [original, short] of Object.entries(categoryNameMap)) {
      if (name.toLowerCase().trim() === original.toLowerCase().trim()) {
        return short;
      }
    }
    return name;
  };

  useEffect(() => {
    const loadTipos = async () => {
      try {
        const res = await fetch("/api/recommend");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "No se pudieron cargar los tipos");
        }
        const tiposOriginales = data.tipos || [];
        const tiposAcortados = tiposOriginales.map((tipo: string) => shortenCategoryName(tipo));
        setTipos(tiposAcortados);
      } catch (err) {
        console.error("Error cargando tipos:", err);
        setError(err instanceof Error ? err.message : "Error inesperado");
      }
    };

    loadTipos();
  }, []);

  const canSubmit = useMemo(() => {
    if (!latUsuario || !lonUsuario) return false;
    const lat = Number(latUsuario);
    const lon = Number(lonUsuario);
    return Number.isFinite(lat) && Number.isFinite(lon);
  }, [latUsuario, lonUsuario]);

  const toggleTipo = (tipo: string) => {
    setSelectedTipos((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo],
    );
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Tu navegador no soporta geolocalizacion");
      return;
    }

    setLocationStatus("Solicitando ubicacion...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatUsuario(pos.coords.latitude.toString());
        setLonUsuario(pos.coords.longitude.toString());
        setLocationStatus(
          `Ubicacion lista (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`,
        );
      },
      (err) => {
        setLocationStatus(`No se pudo obtener ubicacion: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 3000);
      return;
    }

    setError("");
    setHasSearched(true);
    setRestaurants([]);
    setLoading(true);
    try {
      const lat = Number(latUsuario);
      const lon = Number(lonUsuario);

      // Convertir los nombres cortos de vuelta a los nombres originales del CSV
      const tiposOriginales = selectedTipos.map(
        (t) => reverseCategoryMap[t] ?? t
      );

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipos: tiposOriginales,
          minRating,
          maxPrecio,
          latUsuario: lat,
          lonUsuario: lon,
          topN,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudieron generar recomendaciones");
      }

      setRestaurants(data.restaurants || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#ffe0b2_0%,#f8fafc_45%,#e2e8f0_100%)] px-4 py-10 text-zinc-900">
      {showNotification && (
        <div className="fixed top-4 right-4 z-40 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">
            Se necesita la ubicación
          </div>
        </div>
      )}

      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/65 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-modal-title"
            className="w-full max-w-lg rounded-3xl border border-amber-100 bg-white p-6 shadow-2xl"
          >
            <h2
              id="location-modal-title"
              className="text-2xl font-black tracking-tight text-amber-900"
            >
              Aviso importante
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-700">
              Esta pagina solo funciona correctamente si tienes la ubicacion
              activa y nos permites acceder a ella desde tu navegador.
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              Sin esa autorizacion no podremos calcular cercania ni generar
              recomendaciones precisas.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-100"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto grid w-full max-w-6xl gap-6">
        <section className="rounded-3xl border border-amber-100 bg-white/90 p-6 shadow-xl shadow-amber-100/70 backdrop-blur">
          <h1 className="text-4xl font-black tracking-tight text-amber-900">
            ¿Dónde comer hoy?
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            El ranking prioriza cercania, rating y precio.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="text-sm font-bold text-zinc-700">
                  Tipo de restaurante
                </label>
                <div className="mt-2 max-h-56 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  {tipos.length === 0 ? (
                    <p className="text-xs text-zinc-500">Cargando tipos...</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tipos.map((tipo) => {
                        const active = selectedTipos.includes(tipo);
                        return (
                          <button
                            key={tipo}
                            type="button"
                            onClick={() => toggleTipo(tipo)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              active
                                ? "border-amber-700 bg-amber-700 text-white"
                                : "border-zinc-300 bg-white text-zinc-700 hover:border-amber-500"
                            }`}
                          >
                            {tipo}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-bold text-zinc-700">
                  Rating minimo
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.1}
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2"
                />

                <label className="text-sm font-bold text-zinc-700">
                  Precio maximo
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxPrecio}
                  onChange={(e) => setMaxPrecio(Number(e.target.value))}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2"
                />

                <label className="text-sm font-bold text-zinc-700">
                  Numero de resultados
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value))}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2"
                />

                <button
                  type="button"
                  onClick={handleLocate}
                  className="mt-2 rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-800"
                >
                  Obtener mi ubicacion
                </button>
                <p className="text-xs text-zinc-600">{locationStatus}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className={`rounded-xl px-5 py-2 text-sm font-bold text-white transition ${
                  loading
                    ? "cursor-not-allowed bg-zinc-500"
                    : !canSubmit
                      ? "cursor-pointer bg-zinc-500"
                      : "bg-zinc-900 hover:bg-zinc-700"
                }`}
              >
                {loading ? "Calculando..." : "Buscar recomendaciones"}
              </button>
              {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            </div>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {restaurants.map((r, idx) => {
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.latitud},${r.longitud}`)}`;

            return (
              <article
                key={`${r.nom_estab}-${idx}`}
                className="rounded-2xl border border-amber-100 bg-white p-5 shadow-lg shadow-zinc-200"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2 className="text-lg font-extrabold leading-6 text-zinc-900">
                    {r.nom_estab}
                  </h2>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                    #{idx + 1}
                  </span>
                </div>

                <p className="text-sm font-semibold text-zinc-700">{r.nombre_act}</p>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-zinc-700">
                  <p>
                    <span className="font-bold">Rating:</span> {r.rating.toFixed(1)}
                  </p>
                  <p>
                    <span className="font-bold">Precio:</span> ${r.precio.toFixed(0)}
                  </p>
                  <p>
                    <span className="font-bold">Distancia:</span> {r.dist_km.toFixed(2)} km
                  </p>
                  <p>
                    <span className="font-bold">Cluster:</span> {r.cluster}
                  </p>
                </div>

                <p className="mt-3 text-xs text-zinc-500">
                  Score final: {r.score_final.toFixed(4)}
                </p>

                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
                >
                  Ver en mapa
                </a>
              </article>
            );
          })}
        </section>

        {hasSearched && !loading && !error && restaurants.length === 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow">
            No se encontraron recomendaciones con los filtros seleccionados.
            Prueba bajando el rating minimo, subiendo el precio maximo o
            seleccionando mas tipos de restaurante.
          </section>
        )}
      </main>
    </div>
  );
}
