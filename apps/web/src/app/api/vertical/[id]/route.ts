import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getRepoRoot(): string {
  // cwd = BuildApp/apps/web
  // go up TWO levels to reach BuildApp
  return path.resolve(process.cwd(), "..", "..");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    // /api/vertical/{id}
    const id = parts[2];

    const root = getRepoRoot();
    const filePath = path.join(root, "config", "verticals", `${id}.json`);

    if (!id) {
      return NextResponse.json({ error: "Missing vertical id" }, { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Vertical not found", triedPath: filePath, cwd: process.cwd(), id },
        { status: 404 }
      );
    }

    const raw = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(raw);

    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load vertical config" },
      { status: 500 }
    );
  }
}
