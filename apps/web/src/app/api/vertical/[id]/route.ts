import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withErrorTracing } from '@/lib/errors';

// Use anon key for public read access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorTracing('/api/vertical/[id]', 'GET', async () => {
    try {
      const { id } = await params;

      if (!id) {
        return NextResponse.json(
          { error: "Missing vertical id" },
          { status: 400 }
        );
      }

      const { data: vertical, error } = await supabase
        .from("verticals")
        .select("config")
        .eq("vertical_id", id)
        .eq("is_active", true)
        .single();

      if (error || !vertical) {
        return NextResponse.json(
          { error: "Vertical not found", id },
          { status: 404 }
        );
      }

      // Return the full config object - cache for 1 hour (config rarely changes)
      return NextResponse.json(vertical.config, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' }
      });
    } catch (err) {
      console.error("Error fetching vertical:", err);
      return NextResponse.json(
        { error: "Failed to load vertical config" },
        { status: 500 }
      );
    }
  });
}
