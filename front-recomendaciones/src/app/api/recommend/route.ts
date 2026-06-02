// Este archivo define las rutas API para obtener tipos de comida y generar recomendaciones
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BACKEND_BASE_URL =
  process.env.RAILWAY_BACKEND_URL ||
  "https://web-production-80eeb.up.railway.app";

type RecommendPayload = {
  tipos?: string[];
  minRating?: number;
  maxPrecio?: number;
  latUsuario?: number;
  lonUsuario?: number;
  topN?: number;
};

async function backendRequest(pathname: string, init?: RequestInit) {
  const url = `${BACKEND_BASE_URL}${pathname}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { ok: res.ok, status: res.status, json, text };
}

export async function GET() {
  try {
    const result = await backendRequest("/tipos", { method: "GET" });

    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.json?.error ||
            `No se pudieron cargar tipos desde Railway (${result.status})`,
        },
        { status: result.status || 500 },
      );
    }

    return NextResponse.json({ tipos: result.json?.tipos || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RecommendPayload;

    const payload = {
      tipos: body.tipos || [],
      minRating: body.minRating ?? 4.0,
      maxPrecio: body.maxPrecio ?? 300,
      latUsuario: body.latUsuario,
      lonUsuario: body.lonUsuario,
      topN: body.topN ?? 10,
    };

    const result = await backendRequest("/recommend", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!result.ok || !result.json) {
      return NextResponse.json(
        {
          error:
            result.json?.error ||
            `No se pudieron calcular recomendaciones en Railway (${result.status})`,
        },
        { status: result.status || 400 },
      );
    }

    return NextResponse.json({ restaurants: result.json.restaurants || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 },
    );
  }
}