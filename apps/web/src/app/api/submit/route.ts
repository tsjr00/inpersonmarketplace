import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getBuildAppRoot(): string {
  // cwd = BuildApp/apps/web -> go up to BuildApp
  return path.resolve(process.cwd(), "..", "..");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const buildRoot = getBuildAppRoot();
    const dataDir = path.join(buildRoot, "data");
    const outFile = path.join(dataDir, "submissions.ndjson");

    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const record = {
      ...body,
      received_at: new Date().toISOString(),
    };

    fs.appendFileSync(outFile, JSON.stringify(record) + "\n", "utf-8");

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Failed to save submission" }, { status: 500 });
  }
}
