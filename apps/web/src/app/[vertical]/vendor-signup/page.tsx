"use client";

import { use, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import { defaultBranding, VerticalBranding } from "@/lib/branding";
import { getMarketLimit } from "@/lib/constants";
import { colors, spacing, typography, radius, shadows, containers } from "@/lib/design-tokens";
import { getVerticalCSSVars } from "@/lib/design-tokens";
import { term } from "@/lib/vertical";
import { getTaxNotice } from "@/lib/vendor/tax-notice";
import { getCategoryRequirement, requiresDocuments, FOOD_TRUCK_PERMIT_REQUIREMENTS } from "@/lib/onboarding/category-requirements";
import type { Category } from "@/lib/constants";
import CategoryDocumentUpload from "@/components/vendor/CategoryDocumentUpload";
import FoodTruckPermitUpload from "@/components/vendor/FoodTruckPermitUpload";
import COIUpload from "@/components/vendor/COIUpload";

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
  const [title, setTitle] = useState<string>("Vendor Signup");
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

        // If already in this market, redirect to vendor dashboard
        if (alreadyInMarket) {
          router.push(`/${vertical}/vendor/dashboard`);
          return;
        }
      }

      setAuthLoading(false);
    }
    checkAuthAndLimits();
  }, [supabase, vertical, router]);

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

        // Set title
        const prettyTitle =
          cfg?.vertical_name_public && cfg?.nouns?.vendor_singular
            ? `${cfg.vertical_name_public} — ${cfg.nouns.vendor_singular} Signup`
            : `${vertical} — Vendor Signup`;

        setTitle(prettyTitle);

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

  function setVal(key: string, val: unknown) {
    setValues((prev) => ({ ...prev, [key]: val }));
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

    // Validate phone format
    const phone = values.phone as string;
    if (phone && !/^\d{10}$|^\d{3}-\d{3}-\d{4}$/.test(phone)) {
      setFormError("Please enter a valid phone number (10 digits, e.g., 555-555-5555).");
      return;
    }

    // Validate acknowledgments
    const allAcknowledged = Object.values(acknowledgments).every(v => v === true);
    if (!allAcknowledged) {
      setFormError("Please review and accept all vendor acknowledgments before submitting.");
      return;
    }

    const payload: {
      kind: string;
      vertical: string;
      user_id: string;
      data: Record<string, unknown>;
      referral_code?: string;
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

  // Not logged in state
  if (!user) {
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
            <h1 style={headingStyle}>Login Required</h1>
            <p style={subheadingStyle}>
              You must be logged in to register as a vendor.
            </p>
            <div style={{ marginTop: spacing.md, display: "flex", gap: spacing.sm }}>
              <Link href={`/${vertical}/login?returnTo=${encodeURIComponent(`/${vertical}/vendor-signup`)}`} style={buttonSecondaryStyle}>
                Login
              </Link>
              <Link href={`/${vertical}/signup?returnTo=${encodeURIComponent(`/${vertical}/vendor-signup`)}`} style={buttonPrimaryStyle}>
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

        {/* Header Card */}
        <div style={{ ...cardStyle, marginBottom: spacing.md }}>
          <h1 style={headingStyle}>{title}</h1>
          <p style={subheadingStyle}>
            Logged in as: <strong style={{ color: colors.textPrimary }}>{user.email}</strong>
          </p>
          <p style={{ ...subheadingStyle, marginTop: spacing.xs }}>
            Fill out the form below to register as a vendor.
          </p>
        </div>

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

                if (f.type === "file") {
                  return (
                    <div key={f.key}>
                      <label style={labelStyle}>
                        {f.label} {f.required && <span style={{ color: colors.primary }}>*</span>}
                      </label>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            fileObjectsRef.current[f.key] = file;
                            setVal(f.key, file.name);
                          }
                        }}
                        style={{ ...inputStyle, padding: spacing.xs }}
                      />
                      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>
                        Accepted: PDF, JPG, PNG (max 10MB)
                      </div>
                    </div>
                  );
                }

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
                        pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{4}"
                        title="Phone number format: 555-555-5555 or 5555555555"
                        placeholder="555-555-5555"
                        maxLength={12}
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

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!Object.values(acknowledgments).every(v => v) || submitting}
            style={{
              ...buttonPrimaryStyle,
              width: '100%',
              padding: spacing.md,
              fontSize: typography.sizes.lg,
              opacity: (Object.values(acknowledgments).every(v => v) && !submitting) ? 1 : 0.6,
              cursor: (Object.values(acknowledgments).every(v => v) && !submitting) ? "pointer" : "not-allowed",
              boxShadow: (Object.values(acknowledgments).every(v => v) && !submitting) ? shadows.primary : 'none',
            }}
          >
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        </form>
      )}
      </>)}

      {/* ============================================================ */}
      {/* STEP 2: "Here's What You'll Need" — post-submission */}
      {/* ============================================================ */}
      {step === 2 && (<>
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
          <p style={{ ...subheadingStyle, maxWidth: 500, margin: '0 auto' }}>
            Our team will review your application, typically within 1-2 business days.
            You&#39;ll receive an email when your account is approved.
          </p>
        </div>

        {/* Tax Notice */}
        {(() => {
          const vendorType = (values.vendor_type as string) || ''
          const taxNotice = getTaxNotice(vertical, vendorType)
          if (!taxNotice) return null
          return (
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
          )
        })()}

        {/* Requirements Section */}
        <div style={{ ...cardStyle, marginBottom: spacing.md }}>
          <h2 style={{ margin: 0, fontSize: typography.sizes.xl, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.xs }}>
            Here&#39;s What You&#39;ll Need
          </h2>
          <p style={{ ...subheadingStyle, marginBottom: spacing.md }}>
            You can upload these now or come back later from your dashboard. Your application will be reviewed in the meantime.
          </p>

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
            // FM: Show category-specific requirement
            <div>
              {(() => {
                const vendorType = (values.vendor_type as string) || ''
                if (!vendorType) return null
                const category = vendorType as Category
                const req = getCategoryRequirement(category)
                const needsDocs = requiresDocuments(category)

                return (
                  <div>
                    <h3 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold, color: colors.textPrimary, marginBottom: spacing.sm }}>
                      Category Documents — {vendorType}
                    </h3>
                    {needsDocs ? (
                      <>
                        <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, marginBottom: spacing.sm }}>
                          Your category requires documentation. You can upload now or from your dashboard later.
                        </p>
                        {req.referenceUrl && (
                          <p style={{ fontSize: typography.sizes.xs, marginBottom: spacing.sm }}>
                            <a href={req.referenceUrl} target="_blank" rel="noopener noreferrer" style={{ color: colors.primary }}>
                              View Texas DSHS requirements
                            </a>
                          </p>
                        )}
                        {onboardingStatus?.gate2?.categoryStatuses?.[vendorType] ? (
                          <CategoryDocumentUpload
                            category={category}
                            verification={onboardingStatus.gate2.categoryStatuses[vendorType]}
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
                        padding: spacing.md, backgroundColor: '#f0fdf4',
                        borderRadius: radius.md, border: '1px solid #bbf7d0',
                      }}>
                        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: '#166534', fontWeight: typography.weights.medium }}>
                          ✓ No additional permits required for {vendorType}
                        </p>
                        <p style={{ margin: `${spacing['2xs']} 0 0 0`, fontSize: typography.sizes.xs, color: '#15803d' }}>
                          Your category does not require state permits or certifications to sell at markets.
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}
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
            General liability insurance is required before participating in private events, but you can start selling without it.
            Most vendors get a policy for <strong>$300-500/year</strong>.
          </p>
          <div style={{
            padding: spacing.sm, backgroundColor: colors.surfaceMuted,
            borderRadius: radius.md, border: `1px solid ${colors.border}`, marginBottom: spacing.sm,
          }}>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textMuted, lineHeight: typography.leading.relaxed }}>
              <strong>What to get:</strong> General liability, $1M per occurrence minimum.
              Ask your insurer to name the market/event organizer as additional insured.
              <br />
              <strong>Where to look:</strong> FLIP Insurance, Next Insurance, or your local insurance agent.
              Many offer same-day certificates for event vendors.
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
            Go to Dashboard
          </Link>
          <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
            You can always upload documents and complete setup from your dashboard.
          </p>
        </div>
      </>)}
      </main>
    </div>
  );
}
