import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RecommendPayload = {
  action?: "tipos" | "recommend";
  tipos?: string[];
  minRating?: number;
  maxPrecio?: number;
  latUsuario?: number;
  lonUsuario?: number;
  topN?: number;
};

function runPython(payload: RecommendPayload): Promise<any> {
  const negocioDir = path.resolve(process.cwd(), "..", "Negocio");
  const scriptPath = path.join(negocioDir, "recomendaciones_cli.py");
  const pythonCmd = process.env.PYTHON_PATH || "python3";

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonCmd, [scriptPath], { cwd: negocioDir });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      if (!stdout.trim()) {
        reject(new Error(stderr || `Python finalizo sin salida (code ${code})`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch {
        reject(new Error(`Salida JSON invalida: ${stdout}\n${stderr}`));
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

export async function GET() {
  try {
    const result = await runPython({ action: "tipos" });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "No se pudieron cargar tipos" },
        { status: 500 },
      );
    }

    return NextResponse.json({ tipos: result.tipos || [] });
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

    const result = await runPython({
      action: "recommend",
      tipos: body.tipos || [],
      minRating: body.minRating ?? 4.0,
      maxPrecio: body.maxPrecio ?? 300,
      latUsuario: body.latUsuario,
      lonUsuario: body.lonUsuario,
      topN: body.topN ?? 10,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "No se pudieron calcular recomendaciones" },
        { status: 400 },
      );
    }

    return NextResponse.json({ restaurants: result.restaurants || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado" },
      { status: 500 },
    );
  }
}
