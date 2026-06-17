import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from "@/lib/rate-limit";
import { withErrorTracing } from '@/lib/errors';
import { FOOD_TRUCK_PERMIT_REQUIREMENTS } from '@/lib/onboarding/category-requirements';
import { sendNotification } from '@/lib/notifications';
import { vendorSignupSchema } from '@/lib/validation/vendor-signup';

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/submit', 'POST', async () => {
    // Rate limit by IP address
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(`submit:${clientIp}`, rateLimits.submit);

    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult);
    }

    // C6 FIX: Create service client per-request (not module-level)
    const supabaseAdmin = createServiceClient()

    try {
      const body = await request.json();

      // M-3: Validate vendor signup submissions with Zod
      if (body.kind === "vendor_signup") {
        const parsed = vendorSignupSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { ok: false, error: "Invalid submission data", details: parsed.error.flatten().fieldErrors },
            { status: 400 }
          );
        }
      }

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
            // Must include buyer_tier explicitly due to constraint user_profiles_buyer_tier_check
            const { error: profileError } = await supabaseAdmin
              .from("user_profiles")
              .upsert(
                {
                  user_id: user_id,
                  email: user.email,
                  display_name: user.user_metadata?.full_name || "",
                  buyer_tier: "standard",
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
            .eq("vertical_id", vertical)
            .single();

          if (referrer) {
            referredByVendorId = referrer.id;
          }
        }

        // Part A — production-category enforcement (Option A: server hard-reject).
        // FM signups declare production_category (TEXT[] of '1'..'4') at the front
        // gate. Selling is limited to categories 1 & 2; cat 3/4 must NOT create a
        // vendor profile (the front gate is client-side — this is the trust
        // boundary). Verticals that don't send the field (food_trucks) leave
        // sell_eligible at its DB default (TRUE).
        const declaredCategories: string[] = Array.isArray((data as Record<string, unknown>)?.production_category)
          ? ((data as Record<string, unknown>).production_category as unknown[]).map(String)
          : [];
        if (declaredCategories.length > 0 && !declaredCategories.every((c) => c === '1' || c === '2')) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Thanks for your interest in selling with us! Farmers Marketing is built for homemade, handmade, homegrown, and hand-finished or personalized goods that you make yourself. Based on your answers, your products aren't a fit for selling on the platform right now. You can still join a market in person — reach out to a market manager about renting booth space. And if what you make changes down the road, we'd love to have you apply again.",
            },
            { status: 400 }
          );
        }

        // Create vendor profile with user_id (if provided)
        const insertData: {
          vertical_id: string;
          profile_data: unknown;
          status: string;
          user_id?: string;
          referred_by_vendor_id?: string;
          production_category?: string[];
          sell_eligible?: boolean;
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

        // Eligible FM declaration (cat 1/2 only — 3/4 rejected above).
        if (declaredCategories.length > 0) {
          insertData.production_category = declaredCategories;
          insertData.sell_eligible = true;
        }

        const { data: vendor, error } = await supabaseAdmin
          .from("vendor_profiles")
          .insert(insertData)
          .select()
          .single();

        // Set requested_categories on auto-created vendor_verifications row
        // M7: Works for both FM and FT — reads vendor_type or categories field from signup form
        if (!error && vendor) {
          const profileData = data as Record<string, unknown>
          // Check both 'vendor_type' (FT) and 'categories' (FM) field names
          const vendorType = profileData?.vendor_type || profileData?.categories
          // Map vendor_type/categories selection(s) to categories for onboarding
          let categories: string[] = []
          if (Array.isArray(vendorType)) {
            categories = vendorType as string[]
          } else if (typeof vendorType === 'string' && vendorType) {
            categories = [vendorType]
          }
          if (categories.length > 0) {
            await supabaseAdmin
              .from('vendor_verifications')
              .update({ requested_categories: categories })
              .eq('vendor_profile_id', vendor.id)
          }

          // Food trucks: initialize permit requirements in category_verifications
          if (vertical === 'food_trucks') {
            const permitInit: Record<string, { status: string }> = {}
            for (const permit of FOOD_TRUCK_PERMIT_REQUIREMENTS) {
              permitInit[permit.docType] = { status: 'not_submitted' }
            }
            await supabaseAdmin
              .from('vendor_verifications')
              .update({ category_verifications: permitInit })
              .eq('vendor_profile_id', vendor.id)
          }
        }

          // Set prohibited items acknowledged at signup time
          const acks = (data as Record<string, unknown>)?.acknowledgments as Record<string, unknown> | undefined
          if (acks?.prohibitedItems) {
            await supabaseAdmin
              .from('vendor_verifications')
              .update({ prohibited_items_acknowledged_at: new Date().toISOString() })
              .eq('vendor_profile_id', vendor.id)
          }

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

        // Manager-invite auto-association — Phase B Win 2 follow-through.
        // When vendor arrived via /vendor-signup?market=<id> (manager's
        // invite link), auto-create the market_vendors row as approved=false
        // so the manager can review + activate from their dashboard.
        // Non-blocking — signup succeeds even if this insert fails.
        if (!error && vendor && body.market_id_from_invite) {
          const marketIdFromInvite = body.market_id_from_invite as string;
          // Validate market exists before inserting (defensive against
          // spoofed URL or stale invite link). One extra read but protects
          // against orphan rows.
          const { data: marketExists } = await supabaseAdmin
            .from("markets")
            .select("id")
            .eq("id", marketIdFromInvite)
            .maybeSingle();

          if (marketExists) {
            const { error: mvError } = await supabaseAdmin
              .from("market_vendors")
              .upsert(
                {
                  market_id: marketIdFromInvite,
                  vendor_profile_id: vendor.id,
                  approved: false,
                },
                { onConflict: "market_id,vendor_profile_id" }
              );
            if (mvError) {
              // Non-blocking — signup still succeeds. Log for debugging.
              console.warn(
                `[vendor_signup] market_vendors auto-create failed for vendor ${vendor.id} market ${marketIdFromInvite}: ${mvError.message}`
              );
            } else if (body.market_agreement_accepted === true) {
              // Phase B agreement loop: vendor checked the agreement
              // checkbox on the co-branded signup page. Capture the
              // acceptance snapshot in vendor_market_agreement_acceptances
              // (mig 138). Non-atomic with the market_vendors upsert
              // above — if this insert fails, the vendor is associated
              // but no signature is on file; logged for follow-up.
              // Re-prompt via dashboard load (future polish).
              const { fetchMarketOptinForVendor } = await import(
                "@/lib/markets/optin-public"
              );
              const { computeAgreementVersionFromSnapshot } = await import(
                "@/lib/markets/agreement-version"
              );
              const { snapshot } = await fetchMarketOptinForVendor(
                marketIdFromInvite
              );
              // B-close-1 (2026-05-16): mirror State C info-sharing
              // capture on the new-vendor path. When info_sharing_accepted
              // is true, append the synthetic `_info_sharing_consent`
              // entry so manager-side consent detection works uniformly
              // across both join flows (vendor-docs route + vendors
              // route check the same snapshot shape).
              const finalSnapshot =
                body.info_sharing_accepted === true
                  ? [
                      ...snapshot,
                      {
                        statement_id: "_info_sharing_consent",
                        category: "_meta",
                        statement_text:
                          "Vendor authorizes the platform to share their onboarding documentation with the market manager.",
                        placeholder_values: {},
                      },
                    ]
                  : snapshot;
              // B-close-3 (2026-05-16): auto-compute agreement_version
              // from the snapshot's real statement_ids (synthetic
              // entries excluded). Matches the State C join path so
              // both vendor-creation flows produce identical version
              // strings for identical statement sets.
              const autoVersion =
                computeAgreementVersionFromSnapshot(snapshot);
              const { error: vmaaError } = await supabaseAdmin
                .from("vendor_market_agreement_acceptances")
                .insert({
                  vendor_profile_id: vendor.id,
                  market_id: marketIdFromInvite,
                  statements_snapshot: finalSnapshot,
                  agreement_version: autoVersion,
                });
              if (vmaaError && vmaaError.code !== "23505") {
                console.warn(
                  `[vendor_signup] acceptance row write failed for vendor ${vendor.id} market ${marketIdFromInvite}: ${vmaaError.message}`
                );
              }
            }
          }
        }

        if (error) {
          console.error("Supabase error:", error);
          return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
          );
        }

        // H8 FIX: Notify admin(s) of new vendor application
        if (vendor) {
          const profileData = data as Record<string, unknown>
          const vendorName = (profileData?.business_name as string) || (profileData?.farm_name as string) || 'New vendor'
          // Query admin users to notify
          const { data: admins } = await supabaseAdmin
            .from('user_profiles')
            .select('user_id')
            .or('role.eq.admin,role.eq.platform_admin')
          if (admins && admins.length > 0) {
            await Promise.all(
              admins.map((admin) =>
                sendNotification(admin.user_id, 'new_vendor_application', {
                  vendorName,
                }, { vertical })
              )
            )
          }
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
  });
}
