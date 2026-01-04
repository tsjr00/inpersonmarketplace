import { createClient } from "@supabase/supabase-js";

// Use anon key for public read access (server component)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function HomePage() {
  // Fetch active verticals from Supabase
  const { data: verticals, error } = await supabase
    .from("verticals")
    .select("vertical_id, name_public")
    .eq("is_active", true)
    .order("name_public");

  if (error) {
    console.error("Error fetching verticals:", error);
  }

  return (
    <main style={{ padding: 32 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>
        FastWrks – InPersonMarketplace
      </h1>

      <p style={{ marginTop: 12 }}>
        Config-driven marketplace platform. Select a vertical to get started.
      </p>

      <h2 style={{ marginTop: 24, fontSize: 20, fontWeight: 700 }}>
        Available Marketplaces
      </h2>

      {!verticals || verticals.length === 0 ? (
        <p style={{ marginTop: 12, color: "crimson" }}>
          No marketplaces available.
        </p>
      ) : (
        <ul style={{ marginTop: 12 }}>
          {verticals.map((v) => (
            <li key={v.vertical_id} style={{ fontSize: 16, marginTop: 8 }}>
              <a
                href={`/${v.vertical_id}/vendor-signup`}
                style={{ textDecoration: "underline" }}
              >
                {v.name_public} — Vendor Signup
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
