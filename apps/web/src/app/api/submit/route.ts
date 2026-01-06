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
    const { kind, vertical, user_id, data } = body;

    if (kind === "vendor_signup") {
      // Validate user_id if provided
      if (user_id) {
        // Check if vendor profile already exists for this user+vertical
        const { data: existing } = await supabaseAdmin
          .from("vendor_profiles")
          .select("id")
          .eq("user_id", user_id)
          .eq("vertical_id", vertical)
          .single();

        if (existing) {
          return NextResponse.json(
            { ok: false, error: "You already have a vendor profile for this marketplace" },
            { status: 400 }
          );
        }
      }

      // Create vendor profile with user_id (if provided)
      const insertData: {
        vertical_id: string;
        profile_data: unknown;
        status: string;
        user_id?: string;
      } = {
        vertical_id: vertical,
        profile_data: data,
        status: user_id ? "submitted" : "draft",
      };

      if (user_id) {
        insertData.user_id = user_id;
      }

      const { data: vendor, error } = await supabaseAdmin
        .from("vendor_profiles")
        .insert(insertData)
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
        message: user_id
          ? "Vendor profile created and linked to your account."
          : "Vendor profile created. Sign in to manage your profile.",
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
