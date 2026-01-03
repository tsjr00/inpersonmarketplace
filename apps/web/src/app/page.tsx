import fs from "fs";
import path from "path";

function getRepoRoot(): string {
  // apps/web → apps → BuildApp
  return path.resolve(process.cwd(), "..", "..");
}

export default function HomePage() {
  const root = getRepoRoot();
  const verticalsDir = path.join(root, "config", "verticals");

  let verticals: string[] = [];
  try {
    verticals = fs
      .readdirSync(verticalsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  } catch (e) {
    verticals = [];
  }

  return (
    <main style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>
        FastWrks – BuildApp
      </h1>

      <p style={{ marginTop: 12 }}>
        This page confirms the app can read vertical configs from the repo.
      </p>

      <h2 style={{ marginTop: 24, fontSize: 20, fontWeight: 700 }}>
        Detected Verticals
      </h2>

      {verticals.length === 0 ? (
        <p style={{ marginTop: 12, color: "crimson" }}>
          No vertical configs found.
        </p>
      ) : (
        <ul style={{ marginTop: 12 }}>
          {verticals.map((v) => (
            <li key={v} style={{ fontSize: 16, marginTop: 8 }}>
  		<a href={`/${v}/vendor-signup`} style={{ textDecoration: 			"underline" }}> {v} — vendor signup 
		</a>
	    </li>
          ))}
        </ul>
      )}
    </main>
  );
}
