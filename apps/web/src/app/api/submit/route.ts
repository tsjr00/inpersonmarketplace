import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from "@/lib/rate-limit";

// Use service role for server-side operations (no RLS restrictions)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  // Rate limit by IP address
  const clientIp = getClientIp(request);
  const rateLimitResult = checkRateLimit(`submit:${clientIp}`, rateLimits.submit);

  if (!rateLimitResult.success) {
    return rateLimitResponse(rateLimitResult);
  }

  try {
    const body = await request.json();
    const { kind, vertical, user_id, data } = body;

    if (kind === "vendor_signup") {
      // Validate user_id if provided - must match authenticated user
      if (user_id) {
        // Verify the authenticated user owns this user_id
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user || user.id !== user_id) {
          return NextResponse.json(
            { ok: false, error: "Unauthorized: user_id does not match authenticated user" },
            { status: 401 }
          );
        }

        // Ensure user_profile exists (trigger may have failed silently)
        // vendor_profiles.user_id references user_profiles.user_id
        const { data: existingProfile } = await supabaseAdmin
          .from("user_profiles")
          .select("user_id")
          .eq("user_id", user_id)
          .single();

        if (!existingProfile) {
          // Create user_profile if it doesn't exist using upsert to handle race conditions
          const { error: profileError } = await supabaseAdmin
            .from("user_profiles")
            .upsert(
              {
                user_id: user_id,
                email: user.email,
                display_name: user.user_metadata?.full_name || "",
              },
              { onConflict: "user_id" }
            );

          if (profileError) {
            console.error("Failed to create user_profile:", profileError);
            return NextResponse.json(
              { ok: false, error: `Failed to initialize user profile: ${profileError.message}` },
              { status: 500 }
            );
          }
        }

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

      // Check for referral code
      let referredByVendorId: string | null = null;
      if (body.referral_code) {
        const { data: referrer } = await supabaseAdmin
          .from("vendor_profiles")
          .select("id")
          .eq("referral_code", body.referral_code)
          .single();

        if (referrer) {
          referredByVendorId = referrer.id;
        }
      }

      // Create vendor profile with user_id (if provided)
      const insertData: {
        vertical_id: string;
        profile_data: unknown;
        status: string;
        user_id?: string;
        referred_by_vendor_id?: string;
      } = {
        vertical_id: vertical,
        profile_data: data,
        status: user_id ? "submitted" : "draft",
      };

      if (user_id) {
        insertData.user_id = user_id;
      }

      if (referredByVendorId) {
        insertData.referred_by_vendor_id = referredByVendorId;
      }

      const { data: vendor, error } = await supabaseAdmin
        .from("vendor_profiles")
        .insert(insertData)
        .select()
        .single();

      // If vendor was referred, create pending referral credit
      if (!error && vendor && referredByVendorId) {
        await supabaseAdmin
          .from("vendor_referral_credits")
          .insert({
            referrer_vendor_id: referredByVendorId,
            referred_vendor_id: vendor.id,
            credit_amount_cents: 1000, // $10.00
            status: "pending",
          });
      }

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
