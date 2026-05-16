"use client";

import { use, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import { defaultBranding, VerticalBranding } from "@/lib/branding";
import { getMarketLimit } from "@/lib/constants";
import { colors, spacing, typography, radius, shadows } from "@/lib/design-tokens";
import { term } from "@/lib/vertical";
import { getTaxNotice } from "@/lib/vendor/tax-notice";
import { getCategoryRequirement, requiresDocuments, FOOD_TRUCK_PERMIT_REQUIREMENTS } from "@/lib/onboarding/category-requirements";
import type { Category } from "@/lib/constants";
import CategoryDocumentUpload from "@/components/vendor/CategoryDocumentUpload";
import FoodTruckPermitUpload from "@/components/vendor/FoodTruckPermitUpload";
import COIUpload from "@/components/vendor/COIUpload";
import MarketAgreementBlock from "@/components/market-manager/MarketAgreementBlock";
import MarketDetailBlock from "@/components/market-manager/MarketDetailBlock";

type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
};

export default function VendorSignup({ params }: { params: Promise<{ vertical: string }> }) {
  const { vertical } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.farmers_market);

  // Store actual File objects for upload after form submission
  const fileObjectsRef = useRef<Record<string, File>>({});

  // Referral tracking
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState<string | null>(null);

  // Manager invite tracking (?market=<id>) — Phase B co-branded signup.
  // When set, renders a banner identifying the inviting market. Signup
  // behavior is otherwise unchanged.
  const [marketName, setMarketName] = useState<string | null>(null);

  // Phase B (2026-05-16): fuller market detail for the invite landing
  // intro card. Fetched from /api/markets/[id]/optin-public alongside
  // the agreement statements (MarketAgreementBlock makes its own fetch
  // for those; this state just powers the welcome copy + location/
  // schedule lines on the State A and State C landings).
  const [marketDetail, setMarketDetail] = useState<{
    description: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    website: string | null;
    logo_url: string | null;
    schedules: Array<{ day_of_week: number; start_time: string | null; end_time: string | null }>;
  } | null>(null);

  // Phase B agreement loop — extra state for the 4 user states the
  // invite link handles. See market_manager_v2_plan.md §5 and
  // phase_b_agreement_loop_plan_2026-05-15.md §5.
  /** User's vendor_profile.id in this vertical, if one exists. Used to
   *  distinguish State C (existing vendor not at market) from State B
   *  (logged-in buyer with no vendor profile). */
  const [vendorProfileId, setVendorProfileId] = useState<string | null>(null);
  /** Whether the existing-vendor user is already at the inviting market.
   *  null = unknown / not applicable. State D renders when true. */
  const [isVendorAtThisMarket, setIsVendorAtThisMarket] = useState<boolean | null>(null);
  /** Submit gate when ?market=<id> is set. Tracks the MarketAgreementBlock
   *  checkbox value. */
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  /** Loading state for the State C "Join this market" button. */
  const [joiningMarket, setJoiningMarket] = useState(false);
  /** Error state for the State C "Join this market" button. */
  const [joinError, setJoinError] = useState<string | null>(null);
  /** State C only — info-sharing authorization (the SECOND checkbox on
   *  the existing-vendor landing). Forward-looking consent: when the
   *  manager-side document visibility feature ships later, this consent
   *  determines whether their existing onboarding docs are visible to
   *  the manager. Stored alongside the market opt-in acceptance. */
  const [infoSharingAccepted, setInfoSharingAccepted] = useState(false);
  /** B-close-3 (2026-05-16) — staleness of the vendor's latest acceptance
   *  for this market. When `is_stale=true`, State D renders the re-accept
   *  block instead of the "you're already here" friendly message.
   *  null = not yet fetched / not applicable. */
  const [agreementStaleness, setAgreementStaleness] = useState<{
    is_stale: boolean;
    current_version: string;
    last_accepted_version: string | null;
    has_any_acceptance: boolean;
  } | null>(null);
  /** State D re-accept button loading state. */
  const [reAccepting, setReAccepting] = useState(false);
  /** State D re-accept error message. */
  const [reAcceptError, setReAcceptError] = useState<string | null>(null);
  /** State D re-accept success — flips render to a "you're up to date" thank-you. */
  const [reAcceptDone, setReAcceptDone] = useState(false);

  // Step 2 state (post-submission: "Here's what you'll need")
  const [step, setStep] = useState<1 | 2>(1);
  const [vendorId, setVendorId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [onboardingStatus, setOnboardingStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Vendor acknowledgments
  const [acknowledgments, setAcknowledgments] = useState({
    locallyProduced: false,
    legalCompliance: false,
    productSafety: false,
    platformTerms: false,
    accurateInfo: false,
    vendorServiceAgreement: false,
    prohibitedItems: false,
  });
  const [marketLimitInfo, setMarketLimitInfo] = useState<{
    atLimit: boolean;
    alreadyInMarket: boolean;
    tier: string;
    marketCount: number;
    limit: number;
  } | null>(null);

  // Check for referral code in URL
  useEffect(() => {
    async function checkReferral() {
      const ref = searchParams.get('ref');
      if (ref) {
        setReferralCode(ref);
        // Look up the referring vendor
        const { data: referrer } = await supabase
          .from('vendor_profiles')
          .select('profile_data')
          .eq('referral_code', ref)
          .single();

        if (referrer?.profile_data) {
          const name = (referrer.profile_data as Record<string, unknown>).farm_name ||
                       (referrer.profile_data as Record<string, unknown>).business_name ||
                       'A fellow vendor';
          setReferrerName(name as string);
        }
      }
    }
    checkReferral();
  }, [searchParams, supabase]);

  // Manager invite tracking — fetch market name + detail if ?market=<id>
  // present. Uses /api/markets/[id]/optin-public which is the public-read
  // endpoint that also returns the agreement statements (those are
  // separately fetched by MarketAgreementBlock — small duplication, but
  // keeps the agreement component self-contained).
  useEffect(() => {
    async function checkMarketInvite() {
      const marketId = searchParams.get('market');
      if (!marketId) return;
      try {
        const res = await fetch(`/api/markets/${marketId}/optin-public`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.market_name === 'string') setMarketName(data.market_name);
        setMarketDetail({
          description: data?.description ?? null,
          address: data?.address ?? null,
          city: data?.city ?? null,
          state: data?.state ?? null,
          website: data?.website ?? null,
          logo_url: data?.logo_url ?? null,
          schedules: Array.isArray(data?.schedules) ? data.schedules : [],
        });
      } catch {
        // Silent — landing falls back to generic copy. No blocking.
      }
    }
    checkMarketInvite();
  }, [searchParams]);

  // Check authentication and market limits
  useEffect(() => {
    async function checkAuthAndLimits() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        // Check vendor profiles for this user
        const { data: profiles } = await supabase
          .from('vendor_profiles')
          .select('id, vertical_id, tier, status')
          .eq('user_id', user.id)
          .neq('status', 'rejected');

        const existingProfiles = profiles || [];
        const tier = (existingProfiles[0]?.tier as string) || 'free';
        const limit = getMarketLimit(tier, vertical);
        const alreadyInMarket = existingProfiles.some(p => p.vertical_id === vertical);
        const atLimit = existingProfiles.length >= limit && !alreadyInMarket;

        setMarketLimitInfo({
          atLimit,
          alreadyInMarket,
          tier,
          marketCount: existingProfiles.length,
          limit
        });

        // Capture vendor profile id for THIS vertical — used by Phase B
        // invite flow to detect State C (existing vendor not at this
        // market) vs State D (existing vendor at this market).
        const verticalProfile = existingProfiles.find(p => p.vertical_id === vertical);
        const vpid = (verticalProfile?.id as string) ?? null;
        if (vpid) setVendorProfileId(vpid);

        const marketIdParam = searchParams.get('market');

        // Standard flow: already a vendor here AND no manager invite →
        // their dashboard. Phase B invite flow (marketIdParam set) skips
        // this redirect so the page can render States C or D below.
        if (alreadyInMarket && !marketIdParam) {
          router.push(`/${vertical}/vendor/dashboard`);
          return;
        }

        // Phase B invite flow: existing vendor + ?market= → check if
        // already at this market (State D) or not (State C).
        if (alreadyInMarket && marketIdParam && vpid) {
          const { data: mvRow } = await supabase
            .from('market_vendors')
            .select('id')
            .eq('vendor_profile_id', vpid)
            .eq('market_id', marketIdParam)
            .maybeSingle();
          setIsVendorAtThisMarket(!!mvRow);
          // B-close-3: when vendor IS at this market, check whether
          // their latest acceptance is stale vs the manager's current
          // statements. If stale, State D renders a re-accept block
          // instead of the friendly message.
          if (mvRow) {
            try {
              const statusRes = await fetch(
                `/api/vendor/markets/${marketIdParam}/agreement-status`
              );
              if (statusRes.ok) {
                const status = await statusRes.json();
                setAgreementStaleness(status);
              }
            } catch {
              // Best-effort — if the staleness check fails, State D
              // falls back to the friendly "you're already here" view.
            }
          }
        }
      }

      setAuthLoading(false);
    }
    checkAuthAndLimits();
  }, [supabase, vertical, router, searchParams]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/vertical/${vertical}`);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        const cfg = await res.json();

        if (!cfg) {
          throw new Error("No configuration data returned");
        }

        // Extract vendor_fields - handle both direct and nested structures
        const vendorFields: Field[] = cfg.vendor_fields ?? [];

        if (vendorFields.length === 0) {
          console.warn("No vendor_fields found in config:", cfg);
        }

        setFields(vendorFields);

        // Title is rendered as a hardcoded "Become a vendor on {brand_name}"
        // (see Header Card below). The dynamic title from config was removed
        // 2026-05-16 — it said "Farmers Market — Vendor Signup" which was
        // misleading (sounded like the market's signup, not the app's).

        // Set branding if available
        if (cfg?.branding) {
          setBranding(cfg.branding);
        }

        // Initialize form values — auto-populate email from authenticated user
        const initial: Record<string, unknown> = {};
        for (const f of vendorFields) {
          if (f.type === "multi_select") initial[f.key] = [];
          else if (f.type === "boolean") initial[f.key] = false;
          else if (f.type === "date_range") initial[f.key] = { start: "", end: "" };
          else if (f.key === "email" && user?.email) initial[f.key] = user.email;
          else initial[f.key] = "";
        }
        setValues(initial);
      } catch (err) {
        console.error("Failed to load vertical config:", err);
        setError(err instanceof Error ? err.message : "Failed to load configuration");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [vertical]);

  // Auto-populate email when user loads after fields are ready
  useEffect(() => {
    if (user?.email && fields.some(f => f.key === 'email') && !values.email) {
      setValues(prev => ({ ...prev, email: user.email }))
    }
  }, [user, fields]) // eslint-disable-line react-hooks/exhaustive-deps

  function setVal(key: string, val: unknown) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  // Phase B State C handler — existing vendor self-joining a managed
  // market via the invite link. Calls the new /api/vendor/markets/[id]/join
  // endpoint which writes BOTH market_vendors and a
  // vendor_market_agreement_acceptances row.
  async function handleJoinMarket(marketIdParam: string) {
    if (joiningMarket) return;
    setJoinError(null);
    if (!agreementAccepted) {
      setJoinError("Please accept this market's agreement before joining.");
      return;
    }
    if (!infoSharingAccepted) {
      setJoinError("Please authorize info sharing with the market manager.");
      return;
    }
    setJoiningMarket(true);
    try {
      const res = await fetch(`/api/vendor/markets/${marketIdParam}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreement_accepted: true,
          info_sharing_accepted: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setJoinError(data.error || "Could not join this market");
        setJoiningMarket(false);
        return;
      }
      // Success — redirect to vendor dashboard. Manager will see this
      // vendor in their "Pending approval" list.
      router.push(`/${vertical}/vendor/dashboard`);
    } catch {
      setJoinError("Network error — please try again");
      setJoiningMarket(false);
    }
  }

  // Phase B State D handler — re-accept the updated agreement. Same
  // endpoint as the initial join (idempotent on UNIQUE constraint),
  // info_sharing_accepted=false so we don't overwrite the existing
  // info-sharing consent record on file. Vendor stays at the market
  // either way (market_vendors row already exists).
  async function handleReAccept(marketIdParam: string) {
    if (reAccepting) return;
    setReAcceptError(null);
    if (!agreementAccepted) {
      setReAcceptError("Please accept the updated agreement before continuing.");
      return;
    }
    setReAccepting(true);
    try {
      const res = await fetch(`/api/vendor/markets/${marketIdParam}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreement_accepted: true,
          // Do NOT re-send info_sharing_accepted=true here — that would
          // append another synthetic snapshot entry. Existing consent
          // (if granted previously) is preserved by the prior row.
          info_sharing_accepted: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReAcceptError(data.error || "Could not record acceptance");
        setReAccepting(false);
        return;
      }
      setReAcceptDone(true);
      // Refresh staleness so the page reflects the new fresh state.
      setAgreementStaleness((prev) => prev ? { ...prev, is_stale: false, last_accepted_version: prev.current_version } : prev);
      setReAccepting(false);
    } catch {
      setReAcceptError("Network error — please try again");
      setReAccepting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Prevent double-submission
    if (submitting) {
      return;
    }

    setFormError(null);

    // Check if user is logged in
    if (!user) {
      setFormError("Please login first to become a vendor.");
      router.push(`/${vertical}/login`);
      return;
    }

    // Validate required fields
    const missingFields = fields
      .filter((f) => f.required && !values[f.key])
      .map((f) => f.label);

    if (missingFields.length > 0) {
      setFormError(`Please fill in required fields: ${missingFields.join(", ")}`);
      return;
    }

    // Validate email format
    const email = values.email as string;
    if (email && !email.includes("@")) {
      setFormError("Please enter a valid email address.");
      return;
    }

    // Validate phone format — strip non-digits, require exactly 10
    const phone = values.phone as string;
    const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
    // Strip leading country code '1' if 11 digits
    const normalizedDigits = phoneDigits.length === 11 && phoneDigits.startsWith('1') ? phoneDigits.slice(1) : phoneDigits;
    if (phone && normalizedDigits.length !== 10) {
      setFormError("Please enter a valid 10-digit phone number.");
      return;
    }

    // Validate acknowledgments
    const allAcknowledged = Object.values(acknowledgments).every(v => v === true);
    if (!allAcknowledged) {
      setFormError("Please review and accept all vendor acknowledgments before submitting.");
      return;
    }

    // Phase B invite-flow gate: if signing up via a manager's invite link
    // (?market=<id>), both consent checkboxes must be checked — the
    // market agreement AND the info-sharing authorization. Mirrors State C
    // gating so the new-vendor path captures the same consent shape.
    // MarketAgreementBlock auto-fires onChange(true) when the manager has
    // no statements, so the agreement gate only bites when there's a real
    // agreement to accept.
    const marketIdParamForGate = searchParams.get('market');
    if (marketIdParamForGate && !agreementAccepted) {
      setFormError("Please accept this market's agreement before submitting.");
      return;
    }
    if (marketIdParamForGate && !infoSharingAccepted) {
      setFormError("Please authorize info sharing with the market manager before submitting.");
      return;
    }

    const payload: {
      kind: string;
      vertical: string;
      user_id: string;
      data: Record<string, unknown>;
      referral_code?: string;
      market_id_from_invite?: string;
      market_agreement_accepted?: boolean;
      info_sharing_accepted?: boolean;
    } = {
      kind: "vendor_signup",
      vertical,
      user_id: user.id,
      data: {
        ...values,
        acknowledgments: {
          ...acknowledgments,
          accepted_at: new Date().toISOString()
        }
      }
    };

    // Include referral code if present
    if (referralCode) {
      payload.referral_code = referralCode;
    }

    // Include manager invite market_id if present in URL. Server validates
    // that the market exists before auto-creating the market_vendors row.
    // Phase B Win 2 follow-through: closes the loop where vendor signs up
    // via manager's invite link → manager sees them in their vendor list
    // (as approved=false, pending review).
    const marketIdFromInvite = searchParams.get('market');
    if (marketIdFromInvite) {
      payload.market_id_from_invite = marketIdFromInvite;
      // Phase B agreement loop: signal acceptance so the server writes a
      // vendor_market_agreement_acceptances row alongside the
      // market_vendors auto-association. info_sharing_accepted carries
      // the second consent — when true, /api/submit appends the synthetic
      // `_info_sharing_consent` entry to the snapshot (mirrors State C).
      payload.market_agreement_accepted = agreementAccepted;
      payload.info_sharing_accepted = infoSharingAccepted;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (!res.ok) {
        setSubmitting(false);
        setFormError(`Save failed: ${result.error || "Unknown error"}`);
        return;
      }

      setSubmitted({ ...payload, vendor_id: result.vendor_id });

      // Record Tier 2 agreement acceptance
      fetch('/api/user/accept-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreement_type: 'vendor_service',
          agreement_version: '2026-03-v1',
          vertical_id: vertical,
        }),
      }).catch(() => {}) // Non-blocking — acceptance is recorded but signup doesn't fail

      // Upload any file fields to onboarding documents API
      const fileKeys = Object.keys(fileObjectsRef.current);
      if (fileKeys.length > 0) {
        for (const key of fileKeys) {
          const file = fileObjectsRef.current[key];
          if (file) {
            try {
              const formData = new FormData();
              formData.append('document', file);
              await fetch(`/api/vendor/onboarding/documents?vertical=${vertical}`, {
                method: 'POST',
                body: formData,
              });
            } catch (uploadErr) {
              console.error(`File upload failed for ${key}:`, uploadErr);
              // Non-blocking: vendor profile is already created, file can be re-uploaded later
            }
          }
        }
      }

      // Transition to step 2: "Here's what you'll need"
      setVendorId(result.vendor_id);
      setStep(2);
      setSubmitting(false);
      window.scrollTo(0, 0);

      // Fetch onboarding status for upload components
      setStatusLoading(true);
      try {
        const statusRes = await fetch(`/api/vendor/onboarding/status?vertical=${vertical}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setOnboardingStatus(statusData);
        }
      } catch {
        // Non-blocking — vendor can still see the requirements info
      }
      setStatusLoading(false);
    } catch (err) {
      console.error("Submit error:", err);
      setSubmitting(false);
      setFormError("Save failed. Please try again.");
    }
  }

  // Shared styles
  const pageStyle = {
    minHeight: '100vh',
    backgroundColor: colors.surfaceBase,
    color: colors.textSecondary,
  };

  const navStyle = {
    padding: `${spacing.sm} ${spacing.lg}`,
    borderBottom: `1px solid ${colors.border}`,
    backgroundColor: colors.surfaceElevated,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const logoStyle = {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    textDecoration: 'none',
  };

  const mainStyle = {
    maxWidth: '680px',
    margin: "0 auto",
    padding: spacing.lg,
  };

  const cardStyle = {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    border: `1px solid ${colors.border}`,
    padding: spacing.lg,
    boxShadow: shadows.sm,
  };

  const headingStyle = {
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    margin: 0,
    marginBottom: spacing.sm,
  };

  const subheadingStyle = {
    fontSize: typography.sizes.base,
    color: colors.textMuted,
    margin: 0,
    lineHeight: typography.leading.relaxed,
  };

  const buttonPrimaryStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${spacing.sm} ${spacing.md}`,
    backgroundColor: 'transparent',
    color: colors.primary,
    border: `2px solid ${colors.primary}`,
    borderRadius: radius.md,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all 0.2s ease',
  };

  const buttonSecondaryStyle = {
    ...buttonPrimaryStyle,
    backgroundColor: colors.surfaceElevated,
    color: colors.primary,
    border: `2px solid ${colors.primary}`,
    boxShadow: 'none',
  };

  // Auth loading state
  if (authLoading) {
    return (
      <div style={pageStyle}>
        <nav style={navStyle}>
          <Link href={`/${vertical}`} style={logoStyle}>
            {branding.brand_name}
          </Link>
        </nav>
        <main style={mainStyle}>
          <div style={cardStyle}>
            <h1 style={headingStyle}>Loading...</h1>
            <p style={subheadingStyle}>Checking authentication...</p>
          </div>
        </main>
      </div>
    );
  }

  // Market limit reached state
  if (user && marketLimitInfo?.atLimit) {
    return (
      <div style={pageStyle}>
        <nav style={navStyle}>
          <Link href={`/${vertical}`} style={logoStyle}>
            {branding.brand_name}
          </Link>
          <Link
            href={`/${vertical}/dashboard`}
            style={{ color: colors.primary, textDecoration: 'none', fontWeight: typography.weights.semibold }}
          >
            Dashboard
          </Link>
        </nav>
        <main style={mainStyle}>
          <div style={cardStyle}>
            <h1 style={headingStyle}>{term(vertical, 'market')} Limit Reached</h1>
            <div style={{
              marginTop: spacing.md,
              padding: spacing.md,
              backgroundColor: colors.surfaceSubtle,
              border: `1px solid ${colors.accent}`,
              borderRadius: radius.md,
            }}>
              <p style={{ marginTop: 0, fontWeight: typography.weights.semibold, fontSize: typography.sizes.base, color: colors.textPrimary }}>
                You&apos;re already registered at {marketLimitInfo.marketCount} {term(vertical, 'market').toLowerCase()}{marketLimitInfo.marketCount > 1 ? 's' : ''}.
              </p>
              <p style={{ marginBottom: 0, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
                {vertical === 'food_trucks' ? (
                  <>
                    Upgrade your plan to join additional {term(vertical, 'markets').toLowerCase()}.
                  </>
                ) : (marketLimitInfo.tier === 'free' || marketLimitInfo.tier === 'standard') ? (
                  <>
                    {marketLimitInfo.tier === 'free' ? 'Free' : 'Standard'} vendors can participate in {marketLimitInfo.tier === 'free' ? '1' : '2'} traditional market{marketLimitInfo.tier === 'standard' ? 's' : ''}.
                    <br /><br />
                    <strong>Upgrade your plan</strong> to join more markets.
                  </>
                ) : (
                  <>
                    Premium vendors can participate in up to 3 markets.
                    <br /><br />
                    Leave an existing market to join this one.
                  </>
                )}
              </p>
            </div>
            <Link href={`/${vertical}/dashboard`} style={{ ...buttonPrimaryStyle, marginTop: spacing.md }}>
              ← Back to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Phase B States C + D — existing vendor in this vertical, landing via
  // ?market=<id> invite link. The checkAuthAndLimits effect skipped the
  // dashboard redirect and queried market_vendors to determine which.
  {
    const marketIdParam = searchParams.get('market');
    if (
      user &&
      vendorProfileId &&
      marketIdParam &&
      isVendorAtThisMarket !== null
    ) {
      // State D — already at this market. Three sub-states based on
      // B-close-3 staleness check:
      //   - reAcceptDone     → "Thanks, you're up to date" + dashboard link
      //   - staleness.is_stale (and has any acceptance OR not)
      //                      → re-accept block with the updated agreement
      //   - default          → friendly "you're already here" message
      if (isVendorAtThisMarket) {
        const marketLabelD = marketName || 'this market';
        const showReAccept =
          agreementStaleness !== null && agreementStaleness.is_stale && !reAcceptDone;
        return (
          <div style={pageStyle}>
            <nav style={navStyle}>
              <Link href={`/${vertical}`} style={logoStyle}>
                {branding.brand_name}
              </Link>
              <Link
                href={`/${vertical}/vendor/dashboard`}
                style={{ color: colors.primary, textDecoration: 'none', fontWeight: typography.weights.semibold }}
              >
                Vendor Dashboard
              </Link>
            </nav>
            <main style={mainStyle}>
              <div style={cardStyle}>
                {showReAccept ? (
                  <>
                    <h1 style={headingStyle}>
                      {marketLabelD} updated their agreement
                    </h1>
                    <p style={subheadingStyle}>
                      The manager has updated the agreement statements for
                      this market. Please review and re-accept to keep your
                      association current. Your existing association and any
                      info-sharing consent you&apos;ve granted stay in place.
                    </p>
                    <MarketAgreementBlock
                      marketId={marketIdParam}
                      onChange={setAgreementAccepted}
                    />
                    {reAcceptError && (
                      <div style={{
                        marginTop: spacing.sm,
                        padding: spacing.sm,
                        backgroundColor: '#f8d7da',
                        color: '#721c24',
                        border: '1px solid #f5c6cb',
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.sm,
                      }}>
                        {reAcceptError}
                      </div>
                    )}
                    <div style={{ marginTop: spacing.md, display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleReAccept(marketIdParam)}
                        disabled={reAccepting || !agreementAccepted}
                        style={{
                          ...buttonPrimaryStyle,
                          opacity: (reAccepting || !agreementAccepted) ? 0.6 : 1,
                          cursor: (reAccepting || !agreementAccepted) ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {reAccepting ? 'Saving…' : 'Re-accept updated agreement'}
                      </button>
                      <Link
                        href={`/${vertical}/vendor/dashboard`}
                        style={{
                          ...buttonPrimaryStyle,
                          backgroundColor: 'transparent',
                          color: colors.textMuted,
                          border: `1px solid ${colors.border}`,
                        }}
                      >
                        Skip for now
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <h1 style={headingStyle}>
                      {reAcceptDone
                        ? `Thanks — you're up to date at ${marketLabelD}`
                        : `You're already at ${marketLabelD}`}
                    </h1>
                    <p style={subheadingStyle}>
                      {reAcceptDone
                        ? 'Your acceptance was recorded. Visit your vendor dashboard to manage your listings.'
                        : 'No action needed — you’re associated with this market. Visit your vendor dashboard to manage your listings and see pickup details.'}
                    </p>
                    <div style={{ marginTop: spacing.md }}>
                      <Link
                        href={`/${vertical}/vendor/dashboard`}
                        style={buttonPrimaryStyle}
                      >
                        Go to vendor dashboard
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </main>
          </div>
        );
      }

      // State C — existing vendor NOT at this market yet. Show
      // welcoming "Congrats, [Market] invited you" landing + market
      // detail + info-sharing authorization + agreement block + Join.
      //
      // Two checkboxes gate the Join button:
      //   1. Info-sharing authorization (forward-looking — the
      //      manager-side document-visibility feature ships later)
      //   2. Market opt-in agreement (already enforced by Phase B loop)
      //
      // Copy rewritten 2026-05-16 per staging review.
      const marketLabel = marketName ?? 'this market';
      const canJoin = agreementAccepted && infoSharingAccepted && !joiningMarket;
      return (
        <div style={pageStyle}>
          <nav style={navStyle}>
            <Link href={`/${vertical}`} style={logoStyle}>
              {branding.brand_name}
            </Link>
            <Link
              href={`/${vertical}/vendor/dashboard`}
              style={{ color: colors.primary, textDecoration: 'none', fontWeight: typography.weights.semibold }}
            >
              Vendor Dashboard
            </Link>
          </nav>
          <main style={mainStyle}>
            <div style={cardStyle}>
              <h1 style={headingStyle}>
                Congratulations — {marketLabel} has invited you to join their market!
              </h1>
              <p style={subheadingStyle}>
                {marketLabel} partners with {branding.brand_name} to facilitate
                vendor applications and onboarding. Because you&apos;re already
                a {branding.brand_name} vendor, we can fast-track your
                application by sharing the onboarding documentation you
                already provided us with — but we need your authorization
                to do so.
              </p>
              <p style={{ ...subheadingStyle, marginTop: spacing.sm }}>
                Once you authorize us to share your onboarding info with the
                market manager for {marketLabel} AND accept the market&apos;s
                vendor agreement below, your application will be sent to
                the market manager for review.
              </p>

              {marketDetail && (
                <MarketDetailBlock detail={marketDetail} marketLabel={marketLabel} />
              )}

              {/* Info-sharing authorization checkbox (G3). Forward-looking
                  consent — the manager-side document-visibility surface is
                  a separate future build. Capturing intent now lays the
                  groundwork. */}
              <label style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: spacing.xs,
                marginTop: spacing.md,
                marginBottom: spacing.sm,
                padding: spacing.sm,
                backgroundColor: colors.surfaceElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={infoSharingAccepted}
                  onChange={(e) => setInfoSharingAccepted(e.target.checked)}
                  style={{
                    marginTop: 3,
                    width: 18,
                    height: 18,
                    cursor: 'pointer',
                  }}
                />
                <span style={{
                  fontSize: typography.sizes.sm,
                  color: colors.textPrimary,
                  fontWeight: typography.weights.semibold,
                  lineHeight: 1.4,
                }}>
                  I authorize {branding.brand_name} to share my vendor
                  onboarding information with the manager of {marketLabel}.
                </span>
              </label>

              <MarketAgreementBlock
                marketId={marketIdParam}
                onChange={setAgreementAccepted}
              />

              {joinError && (
                <div style={{
                  marginTop: spacing.sm,
                  padding: spacing.sm,
                  backgroundColor: '#f8d7da',
                  color: '#721c24',
                  border: '1px solid #f5c6cb',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                }}>
                  {joinError}
                </div>
              )}

              <div style={{ marginTop: spacing.md, display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleJoinMarket(marketIdParam)}
                  disabled={!canJoin}
                  style={{
                    ...buttonPrimaryStyle,
                    opacity: canJoin ? 1 : 0.6,
                    cursor: canJoin ? 'pointer' : 'not-allowed',
                  }}
                >
                  {joiningMarket ? 'Joining…' : `Join ${marketLabel}`}
                </button>
                <Link
                  href={`/${vertical}/vendor/dashboard`}
                  style={{
                    ...buttonSecondaryStyle,
                    backgroundColor: 'transparent',
                  }}
                >
                  Skip for now
                </Link>
              </div>
            </div>
          </main>
        </div>
      );
    }
  }

  // Not logged in state. Two variants:
  //   - With ?market=<id> (State A — invite-flow landing): welcoming
  //     "Congrats, you've been invited to apply to [Market]" copy +
  //     market detail card + 3 bullets explaining next steps + agreement
  //     preview + Login/Create Account buttons whose returnTo preserves
  //     the market id.
  //   - Without ?market=<id> (default): the existing "Login Required" gate.
  //
  // State A copy rewritten 2026-05-16 per staging review — the prior
  // generic "You're invited to join a market" felt cold and didn't tell
  // the vendor anything about the inviting market.
  if (!user) {
    const marketIdParam = searchParams.get('market');
    const targetPath = marketIdParam
      ? `/${vertical}/vendor-signup?market=${marketIdParam}`
      : `/${vertical}/vendor-signup`;
    const returnTo = encodeURIComponent(targetPath);
    const marketLabel = marketName ?? 'this market';

    return (
      <div style={pageStyle}>
        <nav style={navStyle}>
          <Link href={`/${vertical}`} style={logoStyle}>
            {branding.brand_name}
          </Link>
          <Link href="/" style={{ color: colors.textMuted, textDecoration: 'none' }}>Home</Link>
        </nav>
        <main style={mainStyle}>
          <div style={cardStyle}>
            {marketIdParam ? (
              <>
                <h1 style={headingStyle}>
                  Congratulations — you&apos;ve been invited to apply to {marketLabel}!
                </h1>
                <p style={subheadingStyle}>
                  {marketLabel} partners with {branding.brand_name} to facilitate
                  vendor applications, onboarding, and to give you more options
                  for how you sell your products to the community.
                </p>

                {marketDetail && (
                  <MarketDetailBlock detail={marketDetail} marketLabel={marketLabel} />
                )}

                <h3 style={{
                  marginTop: spacing.md,
                  marginBottom: spacing.xs,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  color: colors.textPrimary,
                }}>
                  Next steps
                </h3>
                <ul style={{
                  margin: 0,
                  paddingLeft: spacing.md,
                  fontSize: typography.sizes.sm,
                  color: colors.textPrimary,
                  lineHeight: 1.6,
                }}>
                  <li>
                    If you are <strong>already a vendor</strong> on {branding.brand_name}, log in below and your account will be connected with {marketLabel}.
                  </li>
                  <li>
                    If you <strong>don&apos;t have a vendor account</strong> with {branding.brand_name}, create your account below and your application will be forwarded to the market manager for approval.
                  </li>
                  <li>
                    Once your account is created and you finish your profile, you will appear in the vendor list for {marketLabel}.
                  </li>
                </ul>

                <MarketAgreementBlock
                  marketId={marketIdParam}
                  onChange={() => {}}
                />
              </>
            ) : (
              <>
                <h1 style={headingStyle}>Login Required</h1>
                <p style={subheadingStyle}>
                  You must be logged in to register as a vendor.
                </p>
              </>
            )}
            <div style={{ marginTop: spacing.md, display: "flex", gap: spacing.sm }}>
              <Link href={`/${vertical}/login?returnTo=${returnTo}`} style={buttonSecondaryStyle}>
                Login
              </Link>
              <Link href={`/${vertical}/signup?returnTo=${returnTo}`} style={buttonPrimaryStyle}>
                Create Account
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div style={pageStyle}>
        <nav style={navStyle}>
          <Link href={`/${vertical}`} style={logoStyle}>
            {branding.brand_name}
          </Link>
        </nav>
        <main style={mainStyle}>
          <div style={cardStyle}>
            <h1 style={headingStyle}>Loading...</h1>
            <p style={subheadingStyle}>Fetching marketplace configuration...</p>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={pageStyle}>
        <nav style={navStyle}>
          <Link href={`/${vertical}`} style={logoStyle}>
            {branding.brand_name}
          </Link>
          <Link href="/" style={{ color: colors.textMuted, textDecoration: 'none' }}>Home</Link>
        </nav>
        <main style={mainStyle}>
          <div style={{ ...cardStyle, borderColor: '#fca5a5' }}>
            <h1 style={{ ...headingStyle, color: '#dc2626' }}>Error</h1>
            <p style={{ ...subheadingStyle, marginTop: spacing.sm }}>
              Failed to load marketplace configuration: {error}
            </p>
            <p style={{ ...subheadingStyle, marginTop: spacing.xs }}>
              Please check that the &quot;{vertical}&quot; marketplace exists and try again.
            </p>
            <button onClick={() => window.location.reload()} style={{ ...buttonSecondaryStyle, marginTop: spacing.md }}>
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Form input styles
  const inputStyle = {
    width: '100%',
    padding: spacing.sm,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    fontSize: typography.sizes.base,
    backgroundColor: colors.surfaceElevated,
    color: colors.textSecondary,
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
  };

  const labelStyle = {
    display: 'block',
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing['2xs'],
    fontSize: typography.sizes.sm,
  };

  return (
    <div style={pageStyle}>
      <nav style={navStyle}>
        <Link href={`/${vertical}`} style={logoStyle}>
          {branding.brand_name}
        </Link>
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          <Link href="/" style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}>Home</Link>
          <Link href={`/${vertical}/dashboard`} style={{ color: colors.primary, textDecoration: 'none', fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>Dashboard</Link>
        </div>
      </nav>
      <main style={mainStyle}>
        {step === 1 && (<>
        {/* Header Card — Section 1: App vendor account.
            User's staging-review feedback (2026-05-16): the original
            "Farmers Market — Vendor Signup" title was misleading because
            it suggested this signup was for THE MARKET, when it's actually
            for THE APP. Section 2 (the market application card) is below
            and only renders for invite-flow vendors. The two cards share
            visual style and parallel copy so the distinction is clear. */}
        <div style={{ ...cardStyle, marginBottom: spacing.md }}>
          <h1 style={headingStyle}>Become a vendor on {branding.brand_name}</h1>
          <p style={subheadingStyle}>
            Logged in as: <strong style={{ color: colors.textPrimary }}>{user.email}</strong>
          </p>
          <p style={{ ...subheadingStyle, marginTop: spacing.xs }}>
            Fill out the form below to register as a vendor on the {branding.brand_name} app.
          </p>
        </div>

        {/* Section 2: Market application — parallels the Section 1 app
            header card above (same cardStyle). Only renders for the
            invite flow (?market=<id>). Distinguishes "you're applying to
            THIS MARKET" from "you're creating an APP account" so the
            vendor understands the two-tier model. */}
        {marketName && (
          <div style={{ ...cardStyle, marginBottom: spacing.md }}>
            <h2 style={{
              ...headingStyle,
              fontSize: typography.sizes.xl,
            }}>
              Apply to sell at {marketName}
            </h2>
            <p style={{ ...subheadingStyle, marginTop: spacing.xs }}>
              Fill out the form below to register as a vendor at {marketName}, where you will sell your items in-person. The market manager reviews every application before activating your association.
            </p>
          </div>
        )}
        {/* Referral Banner */}
        {referrerName && (
          <div style={{
            marginBottom: spacing.md,
            padding: spacing.md,
            background: `linear-gradient(135deg, ${colors.primaryLight} 0%, ${colors.primaryLight} 100%)`,
            borderRadius: radius.lg,
            border: `2px solid ${colors.primary}`,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
            <div style={{
              width: 48,
              height: 48,
              backgroundColor: colors.primary,
              borderRadius: radius.full,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              flexShrink: 0,
            }}>
              🎉
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: typography.weights.bold, color: colors.primaryDark, fontSize: typography.sizes.base }}>
                You were invited by {referrerName}!
              </p>
              <p style={{ margin: 0, color: colors.primaryDark, fontSize: typography.sizes.sm, marginTop: spacing['3xs'] }}>
                Complete your signup and make your first sale to earn them a referral bonus.
              </p>
            </div>
          </div>
        )}

      {fields.length === 0 ? (
        <div style={{ ...cardStyle, borderColor: colors.accent }}>
          <p style={{ margin: 0, color: colors.textSecondary }}>
            No form fields configured for this marketplace.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: spacing.md }}>
          {/* Form Fields Card */}
          <div style={cardStyle}>
            <h2 style={{ ...headingStyle, fontSize: typography.sizes.xl, marginBottom: spacing.md }}>
              Business Information
            </h2>
            <div style={{ display: 'grid', gap: spacing.md }}>
              {fields.map((f) => {
                const value = values[f.key];

                if (f.type === "textarea") {
                  return (
                    <div key={f.key}>
                      <label style={labelStyle}>
                        {f.label} {f.required && <span style={{ color: colors.primary }}>*</span>}
                      </label>
                      <textarea
                        value={(value as string) ?? ""}
                        onChange={(e) => setVal(f.key, e.target.value)}
                        rows={4}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </div>
                  );
                }

                if (f.type === "select") {
                  return (
                    <div key={f.key}>
                      <label style={labelStyle}>
                        {f.label} {f.required && <span style={{ color: colors.primary }}>*</span>}
                      </label>
                      <select
                        value={(value as string) ?? ""}
                        onChange={(e) => setVal(f.key, e.target.value)}
                        style={inputStyle}
                      >
                        <option value="">Select...</option>
                        {(f.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (f.type === "multi_select") {
                  const current: string[] = Array.isArray(value) ? (value as string[]) : [];
                  return (
                    <div key={f.key}>
                      <label style={labelStyle}>
                        {f.label} {f.required && <span style={{ color: colors.primary }}>*</span>}
                        <span style={{ fontWeight: typography.weights.normal, fontSize: typography.sizes.xs, color: colors.textMuted, marginLeft: spacing['2xs'] }}>
                          — select all that apply
                        </span>
                      </label>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                        gap: spacing.xs,
                        marginTop: spacing.xs,
                        padding: spacing.sm,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.md,
                      }}>
                        {(f.options ?? []).map((opt) => {
                          const checked = current.includes(opt);
                          return (
                            <label
                              key={opt}
                              style={{
                                display: "flex",
                                gap: spacing['2xs'],
                                alignItems: "center",
                                cursor: 'pointer',
                                padding: spacing['2xs'],
                                backgroundColor: checked ? colors.primaryLight : 'transparent',
                                borderRadius: radius.sm,
                                transition: 'background-color 0.15s ease',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...current, opt]
                                    : current.filter((x) => x !== opt);
                                  setVal(f.key, next);
                                }}
                                style={{ width: 16, height: 16, accentColor: colors.primary }}
                              />
                              <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // File uploads handled on page 2 via the onboarding gate system
                if (f.type === "file") return null;

                // Phone field with validation
                if (f.type === "phone") {
                  return (
                    <div key={f.key}>
                      <label style={labelStyle}>
                        {f.label} {f.required && <span style={{ color: colors.primary }}>*</span>}
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={(value as string) ?? ""}
                        onChange={(e) => setVal(f.key, e.target.value)}
                        placeholder="(555) 555-5555"
                        maxLength={16}
                        style={inputStyle}
                      />
                    </div>
                  );
                }

                const inputType =
                  f.type === "email" ? "email" : f.type === "date" ? "date" : "text";

                return (
                  <div key={f.key}>
                    <label style={labelStyle}>
                      {f.label} {f.required && <span style={{ color: colors.primary }}>*</span>}
                    </label>
                    <input
                      type={inputType}
                      value={(value as string) ?? ""}
                      onChange={(e) => setVal(f.key, e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vendor Acknowledgments Section */}
          <div style={cardStyle}>
            <h2 style={{ ...headingStyle, fontSize: typography.sizes.xl, marginBottom: spacing.xs }}>
              Vendor Acknowledgments
            </h2>
            <p style={{ ...subheadingStyle, marginBottom: spacing.md }}>
              As an independent vendor and business owner, you are the expert on your business and products; you are also the responsible party regarding quality and safety of all items you choose to sell on the platform. Please review and acknowledge your agreement with each statement below.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {/* Locally Produced Products */}
              <label style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: spacing.sm,
                backgroundColor: acknowledgments.locallyProduced ? colors.primaryLight : colors.surfaceMuted,
                border: `1px solid ${acknowledgments.locallyProduced ? colors.primary : colors.border}`,
                borderRadius: radius.md,
                transition: 'all 0.2s ease',
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.locallyProduced}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, locallyProduced: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: colors.primary }}
                />
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
                  <strong style={{ color: colors.textPrimary }}>{vertical === 'food_trucks' ? 'Freshly Prepared Food:' : 'Locally Produced Products:'}</strong> {vertical === 'food_trucks'
                    ? 'I understand this platform is designed for food trucks and mobile food vendors who prepare food fresh. My menu items are prepared by me or my business. I am not reselling pre-packaged retail food that customers could purchase elsewhere.'
                    : 'I understand this platform is designed exclusively for locally produced products. My products are handmade, homemade, home-grown, or personally crafted by me or my business. I am not reselling mass-produced retail items that customers could purchase elsewhere. This is not a flea market or general resale platform.'
                  }
                </span>
              </label>

              {/* Independent Business Status */}
              <label style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: spacing.sm,
                backgroundColor: acknowledgments.legalCompliance ? colors.primaryLight : colors.surfaceMuted,
                border: `1px solid ${acknowledgments.legalCompliance ? colors.primary : colors.border}`,
                borderRadius: radius.md,
                transition: 'all 0.2s ease',
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.legalCompliance}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, legalCompliance: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: colors.primary }}
                />
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
                  <strong style={{ color: colors.textPrimary }}>Independent Business:</strong> I understand that I am operating as an independent business or agent. As the expert on my own products and services, I am solely responsible for knowing and complying with all federal, state, and local laws, regulations, and permit requirements that apply to my business. This platform does not and cannot know which specific regulations apply to my situation.
                </span>
              </label>

              {/* Product Responsibility */}
              <label style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: spacing.sm,
                backgroundColor: acknowledgments.productSafety ? colors.primaryLight : colors.surfaceMuted,
                border: `1px solid ${acknowledgments.productSafety ? colors.primary : colors.border}`,
                borderRadius: radius.md,
                transition: 'all 0.2s ease',
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.productSafety}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, productSafety: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: colors.primary }}
                />
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
                  <strong style={{ color: colors.textPrimary }}>Product Responsibility:</strong> As the expert on my products, I take full responsibility for ensuring they meet all applicable safety standards, labeling requirements, and preparation regulations. If my products require permits, certifications, or licenses, I have obtained them. This platform relies on my expertise and honesty regarding my own products.
                </span>
              </label>

              {/* Platform Role & Liability */}
              <label style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: spacing.sm,
                backgroundColor: acknowledgments.platformTerms ? colors.primaryLight : colors.surfaceMuted,
                border: `1px solid ${acknowledgments.platformTerms ? colors.primary : colors.border}`,
                borderRadius: radius.md,
                transition: 'all 0.2s ease',
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.platformTerms}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, platformTerms: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: colors.primary }}
                />
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
                  <strong style={{ color: colors.textPrimary }}>Platform Role:</strong> I understand this platform simply connects independent vendors with buyers and does not verify, endorse, or assume responsibility for my products, compliance, or business practices. I agree to indemnify and hold harmless the platform from any claims or liabilities arising from my products or business activities.
                </span>
              </label>

              {/* Honesty, Legality & Transparency */}
              <label style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: spacing.sm,
                backgroundColor: acknowledgments.accurateInfo ? colors.primaryLight : colors.surfaceMuted,
                border: `1px solid ${acknowledgments.accurateInfo ? colors.primary : colors.border}`,
                borderRadius: radius.md,
                transition: 'all 0.2s ease',
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.accurateInfo}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, accurateInfo: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: colors.primary }}
                />
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
                  <strong style={{ color: colors.textPrimary }}>Honesty, Legality & Transparency:</strong> I commit to operating honestly, transparently, and within the bounds of all applicable local, state, and federal laws. All information I provide is true and accurate. I understand this platform relies on vendor integrity, and that misrepresentation or illegal activity may result in account termination.
                </span>
              </label>

              {/* Vendor Service Agreement */}
              <label style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: spacing.sm,
                backgroundColor: acknowledgments.vendorServiceAgreement ? colors.primaryLight : colors.surfaceMuted,
                border: `1px solid ${acknowledgments.vendorServiceAgreement ? colors.primary : colors.border}`,
                borderRadius: radius.md,
                transition: 'all 0.2s ease',
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.vendorServiceAgreement}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, vendorServiceAgreement: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: colors.primary }}
                />
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
                  <strong style={{ color: colors.textPrimary }}><Link href={`/${vertical}/terms/vendor`} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, textDecoration: 'underline' }}>Vendor Service Agreement</Link>:</strong> I have read and agree to the Vendor Service Agreement, which governs my relationship with the platform as a vendor.
                </span>
              </label>

              {/* Prohibited Items Acknowledgment */}
              <label style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: spacing.sm,
                backgroundColor: acknowledgments.prohibitedItems ? colors.primaryLight : colors.surfaceMuted,
                border: `1px solid ${acknowledgments.prohibitedItems ? colors.primary : colors.border}`,
                borderRadius: radius.md,
                transition: 'all 0.2s ease',
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.prohibitedItems}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, prohibitedItems: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0, accentColor: colors.primary }}
                />
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
                  <strong style={{ color: colors.textPrimary }}><Link href={`/${vertical}/vendor/prohibited-items`} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary, textDecoration: 'underline' }}>Prohibited Items Policy</Link>:</strong> I have reviewed the list of prohibited items and confirm that I will not list or sell any prohibited items through the platform. I understand that violation of this policy may result in account suspension or termination.
                </span>
              </label>
            </div>
          </div>

          {/* Validation Error Banner */}
          {formError && (
            <div style={{
              padding: spacing.sm,
              backgroundColor: '#fef2f2',
              border: '1px solid #ef4444',
              borderRadius: radius.md,
              color: '#ef4444',
              fontSize: typography.sizes.sm,
              marginBottom: spacing.sm,
            }}>
              {formError}
            </div>
          )}

          {/* Phase B agreement loop — State B (logged-in buyer signing up
              as a vendor via manager invite). Two consent checkboxes:
              info-sharing authorization (mirrors State C) + the market
              agreement block. MarketAgreementBlock auto-fires
              onChange(true) when the manager has no statements; the
              info-sharing checkbox is always shown for invite flows
              regardless of the manager's agreement state. */}
          {(() => {
            const mid = searchParams.get('market');
            if (!mid) return null;
            const marketLabel = marketName ?? 'this market';
            return (
              <>
                <label style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: spacing.xs,
                  marginTop: spacing.md,
                  marginBottom: spacing.sm,
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceElevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.sm,
                  cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={infoSharingAccepted}
                    onChange={(e) => setInfoSharingAccepted(e.target.checked)}
                    style={{
                      marginTop: 3,
                      width: 18,
                      height: 18,
                      cursor: 'pointer',
                    }}
                  />
                  <span style={{
                    fontSize: typography.sizes.sm,
                    color: colors.textPrimary,
                    fontWeight: typography.weights.semibold,
                    lineHeight: 1.4,
                  }}>
                    I authorize {branding.brand_name} to share my vendor
                    onboarding information with the manager of {marketLabel}.
                  </span>
                </label>
                <MarketAgreementBlock
                  marketId={mid}
                  onChange={setAgreementAccepted}
                />
              </>
            );
          })()}

          {/* Submit Button */}
          {(() => {
            const inviteFlow = !!searchParams.get('market');
            const allOk =
              Object.values(acknowledgments).every(v => v) &&
              !submitting &&
              (!inviteFlow || (agreementAccepted && infoSharingAccepted));
            return (
              <button
                type="submit"
                disabled={!allOk}
                style={{
                  ...buttonPrimaryStyle,
                  width: '100%',
                  padding: spacing.md,
                  fontSize: typography.sizes.lg,
                  opacity: allOk ? 1 : 0.6,
                  cursor: allOk ? "pointer" : "not-allowed",
                  boxShadow: allOk ? shadows.primary : 'none',
                }}
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            );
          })()}
        </form>
      )}
      </>)}

      {/* ============================================================ */}
      {/* STEP 2: "Here's What You'll Need" — post-submission */}
      {/* ============================================================ */}
      {step === 2 && (() => {
        const vendorCategories: string[] = Array.isArray(values.vendor_type)
          ? values.vendor_type as string[]
          : typeof values.vendor_type === 'string' && values.vendor_type
            ? [values.vendor_type]
            : []
        const vendorType = vendorCategories[0] || ''
        const taxNotice = getTaxNotice(vertical, vendorType)
        return (<>
        {/* Success Header */}
        <div style={{ textAlign: 'center', marginBottom: spacing.lg }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            backgroundColor: colors.primaryLight, margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: spacing.md,
          }}>
            <span style={{ fontSize: typography.sizes['3xl'], color: colors.primary }}>✓</span>
          </div>
          <h1 style={{ ...headingStyle, fontSize: typography.sizes['2xl'], marginBottom: spacing.xs }}>
            Application Submitted!
          </h1>
          <p style={{ ...subheadingStyle, maxWidth: 520, margin: '0 auto' }}>
            Get a head start while we review your application — upload your documents now
            and you&#39;ll be ready to go as soon as you&#39;re approved (typically 1-2 business days).
          </p>
        </div>

        {/* Tax Notice */}
        {taxNotice && (
            <div style={{
              ...cardStyle, marginBottom: spacing.md,
              borderColor: '#f59e0b', backgroundColor: '#fffbeb',
            }}>
              <h3 style={{ margin: 0, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: '#92400e' }}>
                {taxNotice.title}
              </h3>
              <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.sizes.sm, color: '#78350f', lineHeight: typography.leading.relaxed }}>
                {taxNotice.message}
              </p>
            </div>
        )}

        {/* Requirements Section */}
        {/* Business Formation Documents (Gate 1) */}
        <div style={{ ...cardStyle, marginBottom: spacing.md }}>
          <h2 style={{ margin: 0, fontSize: typography.sizes.xl, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
            Here&#39;s What You&#39;ll Need
          </h2>
          <p style={{ ...subheadingStyle, marginBottom: spacing.md }}>
            Upload what you have ready now. You can always come back to finish from your dashboard.
          </p>

          <h3 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
            Business Verification
          </h3>
          <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.sm }}>
            Upload a document that verifies your business — business license, DBA filing, LLC articles, or similar.
            This is the first thing our team reviews.
          </p>
          {onboardingStatus?.gate1 ? (
            <div>
              {onboardingStatus.gate1.status === 'approved' ? (
                <div style={{ padding: spacing.sm, backgroundColor: '#f0fdf4', borderRadius: radius.md, border: '1px solid #bbf7d0' }}>
                  <p style={{ margin: 0, fontSize: typography.sizes.sm, color: '#166534', fontWeight: typography.weights.medium }}>✓ Business documents uploaded</p>
                </div>
              ) : (
                <label style={{
                  display: 'block', padding: spacing.sm, backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.md, border: `1px solid ${colors.border}`, cursor: 'pointer',
                  textAlign: 'center', fontSize: typography.sizes.sm, color: colors.primary,
                  fontWeight: typography.weights.medium,
                }}>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const formData = new FormData()
                      formData.append('document', file)
                      await fetch(`/api/vendor/onboarding/documents?vertical=${vertical}`, { method: 'POST', body: formData })
                      const res = await fetch(`/api/vendor/onboarding/status?vertical=${vertical}`)
                      if (res.ok) setOnboardingStatus(await res.json())
                    }}
                  />
                  Upload Business Document (PDF, JPG, PNG)
                </label>
              )}
              {onboardingStatus.gate1.businessDocsUploaded && onboardingStatus.gate1.status !== 'approved' && (
                <p style={{ margin: `${spacing.xs} 0 0 0`, fontSize: typography.sizes.xs, color: '#166534' }}>
                  ✓ Document uploaded — pending review
                </p>
              )}
            </div>
          ) : statusLoading ? (
            <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading...</p>
          ) : (
            <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
              You can upload this from your dashboard after setup.
            </p>
          )}
        </div>

        {/* Category Documents */}
        <div style={{ ...cardStyle, marginBottom: spacing.md }}>
          {/* Category-specific requirements */}
          {vertical === 'food_trucks' ? (
            // FT: Show all 5 permits
            <div>
              <h3 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.sm }}>
                Required Permits
              </h3>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.md }}>
                Texas food truck operators need these permits to operate legally. Upload them here or from your dashboard.
              </p>
              {onboardingStatus?.gate2?.categoryStatuses ? (
                <FoodTruckPermitUpload
                  categoryStatuses={onboardingStatus.gate2.categoryStatuses}
                  onUploaded={async () => {
                    const res = await fetch(`/api/vendor/onboarding/status?vertical=${vertical}`)
                    if (res.ok) setOnboardingStatus(await res.json())
                  }}
                  vertical={vertical}
                />
              ) : statusLoading ? (
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading permit requirements...</p>
              ) : (
                <div>
                  {FOOD_TRUCK_PERMIT_REQUIREMENTS.map(permit => (
                    <div key={permit.docType} style={{
                      padding: spacing.sm, marginBottom: spacing.xs,
                      backgroundColor: colors.surfaceMuted, borderRadius: radius.md,
                      border: `1px solid ${colors.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: typography.weights.semibold, fontSize: typography.sizes.sm }}>{permit.label}</span>
                        <span style={{
                          fontSize: typography.sizes.xs, padding: `${spacing['3xs']} ${spacing.xs}`,
                          borderRadius: radius.sm,
                          backgroundColor: permit.required ? '#fef3c7' : '#f0fdf4',
                          color: permit.required ? '#92400e' : '#166534',
                        }}>
                          {permit.required ? 'Required' : 'Recommended'}
                        </span>
                      </div>
                      <p style={{ margin: `${spacing['2xs']} 0 0 0`, fontSize: typography.sizes.xs, color: colors.textMuted }}>{permit.description}</p>
                    </div>
                  ))}
                  <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                    Upload buttons will appear once your profile is ready.
                  </p>
                </div>
              )}
            </div>
          ) : (
            // FM: Show requirements for ALL selected categories
            <div>
              <h3 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.sm }}>
                Category Documents
              </h3>
              {vendorCategories.length === 0 ? (
                <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>No categories selected.</p>
              ) : vendorCategories.map(cat => {
                const category = cat as Category
                const req = getCategoryRequirement(category)
                const needsDocs = requiresDocuments(category)

                return (
                  <div key={cat} style={{ marginBottom: spacing.md }}>
                    <h4 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
                      {cat}
                    </h4>
                    {needsDocs ? (
                      <>
                        <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.xs }}>
                          This category requires documentation. You can upload now or from your dashboard later.
                        </p>
                        {req.referenceUrl && (
                          <p style={{ fontSize: typography.sizes.xs, marginBottom: spacing.xs }}>
                            <a href={req.referenceUrl} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>
                              View Texas DSHS requirements
                            </a>
                          </p>
                        )}
                        {onboardingStatus?.gate2?.categoryStatuses?.[cat] ? (
                          <CategoryDocumentUpload
                            category={category}
                            verification={onboardingStatus.gate2.categoryStatuses[cat]}
                            onUploaded={async () => {
                              const res = await fetch(`/api/vendor/onboarding/status?vertical=${vertical}`)
                              if (res.ok) setOnboardingStatus(await res.json())
                            }}
                            vertical={vertical}
                          />
                        ) : statusLoading ? (
                          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>Loading...</p>
                        ) : (
                          <div style={{
                            padding: spacing.sm, backgroundColor: colors.surfaceMuted,
                            borderRadius: radius.md, border: `1px solid ${colors.border}`,
                          }}>
                            <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                              Accepted: {req.acceptedDocTypes.join(' or ')}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{
                        padding: spacing.sm, backgroundColor: '#f0fdf4',
                        borderRadius: radius.md, border: '1px solid #bbf7d0',
                      }}>
                        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: '#166534', fontWeight: typography.weights.medium }}>
                          ✓ No additional permits required for {cat}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* COI Section */}
        <div style={{ ...cardStyle, marginBottom: spacing.md }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <h2 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
              Certificate of Insurance (COI)
            </h2>
            <span style={{
              fontSize: typography.sizes.xs, padding: `${spacing['3xs']} ${spacing.xs}`,
              borderRadius: radius.sm, backgroundColor: '#f0fdf4', color: '#166534',
            }}>
              Optional for now
            </span>
          </div>
          <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.sm, lineHeight: typography.leading.relaxed }}>
            General liability insurance protects you and the {vertical === 'food_trucks' ? 'parks and locations' : 'markets'} where you sell.
            You can start selling without it, but it is required before participating in private events.
          </p>
          <div style={{
            padding: spacing.sm, backgroundColor: colors.surfaceMuted,
            borderRadius: radius.md, border: `1px solid ${colors.border}`, marginBottom: spacing.sm,
          }}>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: typography.leading.relaxed }}>
              Many {vertical === 'food_trucks' ? 'food truck parks and event organizers' : 'farmers markets'} require <strong>$1M or more</strong> in coverage.
              Check with your {vertical === 'food_trucks' ? 'park or event organizer' : 'market organizer'} for their specific requirements.
              Ask your insurer to name the market or event organizer as additional insured.
            </p>
            <p style={{ margin: `${spacing['2xs']} 0 0 0`, fontSize: typography.sizes.xs }}>
              <a href="https://www.tdi.texas.gov/pubs/pc/pcgenliab.html" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>
                Learn about general liability insurance (Texas Dept. of Insurance)
              </a>
              {' · '}
              <a href="https://www.tdi.texas.gov/agent/agent-lookup.html" target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>
                Find a licensed insurance agent
              </a>
            </p>
          </div>
          {onboardingStatus?.gate3 ? (
            <COIUpload
              coiStatus={onboardingStatus.gate3.coiStatus}
              coiDocuments={onboardingStatus.gate3.coiDocuments || []}
              coiVerifiedAt={onboardingStatus.gate3.coiVerifiedAt}
              onUploaded={async () => {
                const res = await fetch(`/api/vendor/onboarding/status?vertical=${vertical}`)
                if (res.ok) setOnboardingStatus(await res.json())
              }}
              vertical={vertical}
            />
          ) : null}
        </div>

        {/* Stripe Section */}
        <div style={{ ...cardStyle, marginBottom: spacing.md }}>
          <h2 style={{ margin: 0, fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
            Get Paid — Stripe Connect
          </h2>
          <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.md, lineHeight: typography.leading.relaxed }}>
            Connect your bank account so you can receive payouts for your sales. This takes about 5 minutes and is required before you can publish listings.
          </p>
          <Link
            href={`/${vertical}/vendor/dashboard/stripe`}
            style={{
              ...buttonPrimaryStyle,
              display: 'inline-block',
              textAlign: 'center',
              textDecoration: 'none',
              padding: `${spacing.sm} ${spacing.lg}`,
            }}
          >
            Set Up Stripe Connect
          </Link>
        </div>

        {/* Go to Dashboard CTA */}
        <div style={{ textAlign: 'center', marginTop: spacing.lg }}>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              ...buttonPrimaryStyle,
              display: 'inline-block',
              textAlign: 'center',
              textDecoration: 'none',
              padding: `${spacing.md} ${spacing.xl}`,
              fontSize: typography.sizes.lg,
              boxShadow: shadows.primary,
            }}
          >
            Continue to Dashboard
          </Link>
          <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, marginTop: spacing.sm, maxWidth: 400, margin: `${spacing.sm} auto 0` }}>
            Your dashboard has everything you need to finish setup, upload documents, connect payments, and create your first listings.
          </p>
        </div>
      </>)
      })()}
      </main>
    </div>
  );
}
