"use client";

import { use, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import Link from "next/link";
import { defaultBranding, VerticalBranding } from "@/lib/branding";
import { getMarketLimit } from "@/lib/constants";

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
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.fireworks);

  // Vendor acknowledgments
  const [acknowledgments, setAcknowledgments] = useState({
    locallyProduced: false,
    legalCompliance: false,
    productSafety: false,
    platformTerms: false,
    accurateInfo: false
  });
  const [marketLimitInfo, setMarketLimitInfo] = useState<{
    atLimit: boolean;
    alreadyInMarket: boolean;
    tier: string;
    marketCount: number;
    limit: number;
  } | null>(null);

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
        const tier = (existingProfiles[0]?.tier as string) || 'standard';
        const limit = getMarketLimit(tier);
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

        // Initialize form values
        const initial: Record<string, unknown> = {};
        for (const f of vendorFields) {
          if (f.type === "multi_select") initial[f.key] = [];
          else if (f.type === "boolean") initial[f.key] = false;
          else if (f.type === "date_range") initial[f.key] = { start: "", end: "" };
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

    // Check if user is logged in
    if (!user) {
      alert("Please login first to become a vendor");
      router.push(`/${vertical}/login`);
      return;
    }

    // Validate required fields
    const missingFields = fields
      .filter((f) => f.required && !values[f.key])
      .map((f) => f.label);

    if (missingFields.length > 0) {
      alert(`Please fill in required fields: ${missingFields.join(", ")}`);
      return;
    }

    // Validate email format
    const email = values.email as string;
    if (email && !email.includes("@")) {
      alert("Please enter a valid email address");
      return;
    }

    // Validate phone format
    const phone = values.phone as string;
    if (phone && !/^\d{10}$|^\d{3}-\d{3}-\d{4}$/.test(phone)) {
      alert("Please enter a valid phone number (10 digits, e.g., 555-555-5555)");
      return;
    }

    // Validate acknowledgments
    const allAcknowledged = Object.values(acknowledgments).every(v => v === true);
    if (!allAcknowledged) {
      alert("Please review and accept all vendor acknowledgments before submitting.");
      return;
    }

    const payload = {
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
        alert(`Save failed: ${result.error || "Unknown error"}`);
        return;
      }

      setSubmitted({ ...payload, vendor_id: result.vendor_id });

      // Auto-redirect to vendor dashboard after short delay
      setTimeout(() => {
        router.push(`/${vertical}/vendor/dashboard`);
        router.refresh();
      }, 1500);
    } catch (err) {
      console.error("Submit error:", err);
      setSubmitting(false);
      alert("Save failed. Check the console for errors.");
    }
  }

  // Auth loading state
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
        <nav style={{ padding: '15px 40px', borderBottom: `1px solid ${branding.colors.secondary}` }}>
          <Link href={`/${vertical}`} style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, textDecoration: 'none' }}>
            {branding.brand_name}
          </Link>
        </nav>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: branding.colors.primary }}>Loading...</h1>
          <p style={{ marginTop: 10, opacity: 0.8 }}>Checking authentication...</p>
        </main>
      </div>
    );
  }

  // Market limit reached state
  if (user && marketLimitInfo?.atLimit) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
        <nav style={{ padding: '15px 40px', borderBottom: `1px solid ${branding.colors.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href={`/${vertical}`} style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, textDecoration: 'none' }}>
            {branding.brand_name}
          </Link>
          <Link href={`/${vertical}/dashboard`} style={{ color: branding.colors.primary, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
        </nav>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: branding.colors.primary }}>Market Limit Reached</h1>
          <div style={{
            marginTop: 20,
            padding: 20,
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: 8,
            color: '#856404'
          }}>
            <p style={{ marginTop: 0, fontWeight: 600, fontSize: 16 }}>
              You&apos;re already registered at {marketLimitInfo.marketCount} market{marketLimitInfo.marketCount > 1 ? 's' : ''}.
            </p>
            <p style={{ marginBottom: 0 }}>
              {marketLimitInfo.tier === 'standard' ? (
                <>
                  Standard vendors can participate in 1 traditional market.
                  <br /><br />
                  <strong>Upgrade to Premium</strong> to join up to 3 markets.
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
          <Link
            href={`/${vertical}/dashboard`}
            style={{
              display: "inline-block",
              marginTop: 20,
              padding: "12px 20px",
              fontWeight: 800,
              cursor: "pointer",
              border: "none",
              borderRadius: 8,
              textDecoration: "none",
              color: "white",
              backgroundColor: branding.colors.primary
            }}
          >
            ← Back to Dashboard
          </Link>
        </main>
      </div>
    );
  }

  // Not logged in state
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
        <nav style={{ padding: '15px 40px', borderBottom: `1px solid ${branding.colors.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href={`/${vertical}`} style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, textDecoration: 'none' }}>
            {branding.brand_name}
          </Link>
          <Link href="/" style={{ color: branding.colors.secondary, textDecoration: 'none' }}>Home</Link>
        </nav>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: branding.colors.primary }}>Login Required</h1>
          <p style={{ marginTop: 10, opacity: 0.8 }}>
            You must be logged in to register as a vendor.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
            <Link
              href={`/${vertical}/login`}
              style={{
                padding: "12px 20px",
                fontWeight: 800,
                cursor: "pointer",
                border: `2px solid ${branding.colors.primary}`,
                borderRadius: 8,
                textDecoration: "none",
                color: branding.colors.primary,
                backgroundColor: "white"
              }}
            >
              Login
            </Link>
            <Link
              href={`/${vertical}/signup`}
              style={{
                padding: "12px 20px",
                fontWeight: 800,
                cursor: "pointer",
                border: "none",
                borderRadius: 8,
                textDecoration: "none",
                color: "white",
                backgroundColor: branding.colors.primary
              }}
            >
              Create Account
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
        <nav style={{ padding: '15px 40px', borderBottom: `1px solid ${branding.colors.secondary}` }}>
          <Link href={`/${vertical}`} style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, textDecoration: 'none' }}>
            {branding.brand_name}
          </Link>
        </nav>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: branding.colors.primary }}>Loading...</h1>
          <p style={{ marginTop: 10, opacity: 0.8 }}>Fetching marketplace configuration...</p>
        </main>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
        <nav style={{ padding: '15px 40px', borderBottom: `1px solid ${branding.colors.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href={`/${vertical}`} style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, textDecoration: 'none' }}>
            {branding.brand_name}
          </Link>
          <Link href="/" style={{ color: branding.colors.secondary, textDecoration: 'none' }}>Home</Link>
        </nav>
        <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "crimson" }}>Error</h1>
          <p style={{ marginTop: 10 }}>
            Failed to load marketplace configuration: {error}
          </p>
          <p style={{ marginTop: 10, opacity: 0.8 }}>
            Please check that the &quot;{vertical}&quot; marketplace exists and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 20,
              padding: "12px 14px",
              fontWeight: 800,
              cursor: "pointer",
              border: `2px solid ${branding.colors.primary}`,
              borderRadius: 8,
              backgroundColor: 'white',
              color: branding.colors.primary
            }}
          >
            Retry
          </button>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: branding.colors.background, color: branding.colors.text }}>
      <nav style={{ padding: '15px 40px', borderBottom: `1px solid ${branding.colors.secondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href={`/${vertical}`} style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, textDecoration: 'none' }}>
          {branding.brand_name}
        </Link>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <Link href="/" style={{ color: branding.colors.secondary, textDecoration: 'none' }}>Home</Link>
          <Link href={`/${vertical}/dashboard`} style={{ color: branding.colors.primary, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
        </div>
      </nav>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: branding.colors.primary }}>{title}</h1>
        <p style={{ marginTop: 10, opacity: 0.8 }}>
          Logged in as: <strong>{user.email}</strong>
        </p>
        <p style={{ marginTop: 5, opacity: 0.8 }}>
          Fill out the form below to register as a vendor.
        </p>

      {fields.length === 0 ? (
        <p style={{ marginTop: 20, color: "orange" }}>
          No form fields configured for this marketplace.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14, marginTop: 20 }}>
          {fields.map((f) => {
            const value = values[f.key];

            if (f.type === "textarea") {
              return (
                <div key={f.key}>
                  <label style={{ fontWeight: 600 }}>
                    {f.label} {f.required ? "(required)" : ""}
                  </label>
                  <textarea
                    value={(value as string) ?? ""}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    rows={4}
                    style={{ width: "100%", padding: 10 }}
                  />
                </div>
              );
            }

            if (f.type === "select") {
              return (
                <div key={f.key}>
                  <label style={{ fontWeight: 600 }}>
                    {f.label} {f.required ? "(required)" : ""}
                  </label>
                  <select
                    value={(value as string) ?? ""}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    style={{ width: "100%", padding: 10 }}
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
                  <div style={{ fontWeight: 600 }}>
                    {f.label} {f.required ? "(required)" : ""}{" "}
                    <span style={{ fontWeight: 400, fontSize: 14, color: '#666' }}>
                      — select all that apply
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    {(f.options ?? []).map((opt) => {
                      const checked = current.includes(opt);
                      return (
                        <label key={opt} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...current, opt]
                                : current.filter((x) => x !== opt);
                              setVal(f.key, next);
                            }}
                          />
                          <span>{opt}</span>
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
                  <label style={{ fontWeight: 600 }}>
                    {f.label} {f.required ? "(required)" : ""}
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setVal(f.key, e.target.files?.[0]?.name ?? "")}
                    style={{ width: "100%", padding: 10 }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    (File upload coming soon - filename recorded only)
                  </div>
                </div>
              );
            }

            // Phone field with validation
            if (f.type === "phone") {
              return (
                <div key={f.key}>
                  <label style={{ fontWeight: 600 }}>
                    {f.label} {f.required ? "(required)" : ""}
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={(value as string) ?? ""}
                    onChange={(e) => setVal(f.key, e.target.value)}
                    pattern="[0-9]{3}-?[0-9]{3}-?[0-9]{4}"
                    title="Phone number format: 555-555-5555 or 5555555555"
                    placeholder="555-555-5555"
                    style={{ width: "100%", padding: 10 }}
                  />
                </div>
              );
            }

            const inputType =
              f.type === "email" ? "email" : f.type === "date" ? "date" : "text";

            return (
              <div key={f.key}>
                <label style={{ fontWeight: 600 }}>
                  {f.label} {f.required ? "(required)" : ""}
                </label>
                <input
                  type={inputType}
                  value={(value as string) ?? ""}
                  onChange={(e) => setVal(f.key, e.target.value)}
                  style={{ width: "100%", padding: 10 }}
                />
              </div>
            );
          })}

          {/* Vendor Acknowledgments Section */}
          <div style={{
            marginTop: 24,
            padding: 20,
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8
          }}>
            <h3 style={{
              margin: '0 0 16px 0',
              fontSize: 16,
              fontWeight: 700,
              color: '#1e293b'
            }}>
              Vendor Acknowledgments
            </h3>
            <p style={{
              margin: '0 0 16px 0',
              fontSize: 13,
              color: '#64748b',
              lineHeight: 1.5
            }}>
              As an independent vendor, you are the expert on your own business and products. Please review and acknowledge each statement below.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Locally Produced Products */}
              <label style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: 12,
                backgroundColor: acknowledgments.locallyProduced ? '#f0fdf4' : 'white',
                border: `1px solid ${acknowledgments.locallyProduced ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 6
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.locallyProduced}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, locallyProduced: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  <strong>Locally Produced Products:</strong> I understand this platform is designed exclusively for locally produced products. My products are handmade, homemade, home-grown, or personally crafted by me or my business. I am not reselling mass-produced retail items that customers could purchase elsewhere. This is not a flea market or general resale platform.
                </span>
              </label>

              {/* Independent Business Status */}
              <label style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: 12,
                backgroundColor: acknowledgments.legalCompliance ? '#f0fdf4' : 'white',
                border: `1px solid ${acknowledgments.legalCompliance ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 6
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.legalCompliance}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, legalCompliance: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  <strong>Independent Business:</strong> I understand that I am operating as an independent business or agent. As the expert on my own products and services, I am solely responsible for knowing and complying with all federal, state, and local laws, regulations, and permit requirements that apply to my business. This platform does not and cannot know which specific regulations apply to my situation.
                </span>
              </label>

              {/* Product Responsibility */}
              <label style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: 12,
                backgroundColor: acknowledgments.productSafety ? '#f0fdf4' : 'white',
                border: `1px solid ${acknowledgments.productSafety ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 6
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.productSafety}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, productSafety: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  <strong>Product Responsibility:</strong> As the expert on my products, I take full responsibility for ensuring they meet all applicable safety standards, labeling requirements, and preparation regulations. If my products require permits, certifications, or licenses, I have obtained them. This platform relies on my expertise and honesty regarding my own products.
                </span>
              </label>

              {/* Platform Role & Liability */}
              <label style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: 12,
                backgroundColor: acknowledgments.platformTerms ? '#f0fdf4' : 'white',
                border: `1px solid ${acknowledgments.platformTerms ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 6
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.platformTerms}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, platformTerms: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  <strong>Platform Role:</strong> I understand this platform simply connects independent vendors with buyers and does not verify, endorse, or assume responsibility for my products, compliance, or business practices. I agree to indemnify and hold harmless the platform from any claims or liabilities arising from my products or business activities.
                </span>
              </label>

              {/* Honesty & Transparency */}
              <label style={{
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                cursor: 'pointer',
                padding: 12,
                backgroundColor: acknowledgments.accurateInfo ? '#f0fdf4' : 'white',
                border: `1px solid ${acknowledgments.accurateInfo ? '#86efac' : '#e2e8f0'}`,
                borderRadius: 6
              }}>
                <input
                  type="checkbox"
                  checked={acknowledgments.accurateInfo}
                  onChange={(e) => setAcknowledgments(prev => ({ ...prev, accurateInfo: e.target.checked }))}
                  style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }}
                />
                <span style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  <strong>Honesty & Transparency:</strong> I commit to being honest and transparent in all my dealings on this platform. All information I provide is true and accurate. I understand this platform relies on vendor integrity, and that misrepresentation may result in account termination.
                </span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={!Object.values(acknowledgments).every(v => v) || submitting}
            style={{
              marginTop: 20,
              padding: "12px 14px",
              fontWeight: 800,
              cursor: (Object.values(acknowledgments).every(v => v) && !submitting) ? "pointer" : "not-allowed",
              border: "none",
              borderRadius: 8,
              backgroundColor: (Object.values(acknowledgments).every(v => v) && !submitting) ? branding.colors.primary : '#9ca3af',
              color: "white",
              width: "100%"
            }}
          >
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        </form>
      )}

      {submitted ? (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: branding.colors.accent }}>
            Submitted Successfully!
          </h2>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Your vendor profile has been created. Redirecting to your vendor dashboard...
          </p>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "12px 20px",
              fontWeight: 800,
              cursor: "pointer",
              border: `2px solid ${branding.colors.primary}`,
              borderRadius: 8,
              textDecoration: "none",
              color: branding.colors.primary
            }}
          >
            Go to Vendor Dashboard
          </Link>
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: "pointer" }}>View submitted data</summary>
            <pre style={{ marginTop: 10, padding: 12, border: `1px solid ${branding.colors.secondary}`, borderRadius: 8, overflow: "auto", backgroundColor: "white" }}>
              {JSON.stringify(submitted, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
      </main>
    </div>
  );
}
