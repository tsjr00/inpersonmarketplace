import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role for server-side operations (no RLS restrictions)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { kind, vertical, data } = body;

    if (kind === "vendor_signup") {
      // For now, store as a vendor profile without user association
      // This will be updated when auth is implemented
      const { data: vendor, error } = await supabaseAdmin
        .from("vendor_profiles")
        .insert({
          vertical_id: vertical,
          profile_data: data,
          status: "draft",
          // user_id will be set when auth is implemented
        })
        .select()
        .single();

      if (error) {
        console.error("Supabase error:", error);
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        vendor_id: vendor.id,
        message: "Vendor profile created. Sign in to manage your profile.",
      });
    }

    // Handle other submission types in the future
    return NextResponse.json(
      { ok: false, error: "Unknown submission type" },
      { status: 400 }
    );
  } catch (err) {
    console.error("Submit error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save submission" },
      { status: 500 }
    );
  }
}
