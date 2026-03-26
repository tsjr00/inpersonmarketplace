# Unified Documents & Certifications System — Implementation Plan

**Created:** 2026-03-26
**Status:** Planned, not started
**Estimated effort:** 6-8 hours across 1.5-2 sessions

---

## Problem

Two separate systems for vendor documents that should be one:

1. **Onboarding gate docs** (`vendor_verifications.category_verifications` JSONB) — per-category uploads with admin review. Only visible in onboarding checklist. Disappears after approval. Vendor can't see/update their docs later.

2. **Profile certifications** (`vendor_profiles.certifications` JSONB array) — voluntary badges (Organic, GAP, Cottage Food). No admin review. Shows on public profile. No connection to compliance gates.

## Solution

One unified "Documents & Certifications" section on the edit profile page. Each document upload serves multiple purposes:
- **Compliance gate** — satisfies category requirements (Cottage Food Registration → unlocks Baked Goods/Pantry)
- **Profile badge** — shows on public vendor profile (🏠 Cottage Food, 🌱 Organic, etc.)
- **Ongoing management** — vendor can see status, upload renewals, track expiration

## Architecture Decision: Option C (Extend existing)

No new tables. No data migration. Keep both storage locations, build unified UI:
- Required docs: read/write `vendor_verifications.category_verifications`
- Optional badges: read/write `vendor_profiles.certifications`
- New: add `badge_config` to `category-requirements.ts` mapping doc types to badge display info
- Unified component reads both sources, presents coherently

## Document Type → Purpose Mapping

| Document Type | Compliance Gate | Badge | Required? |
|--------------|----------------|-------|-----------|
| Cottage Food Registration | Baked Goods, Pantry categories | 🏠 Cottage Food | If selling those categories |
| DSHS Temp Food Permit | Dairy & Eggs, Prepared Foods | Health Dept Approved | If selling those categories |
| DSHS + Processing Compliance | Meat & Poultry | Health Dept Approved | If selling Meat & Poultry |
| MFU Permit (FT) | All FT vendors | Licensed Mobile Food Unit | Yes (FT) |
| Certified Food Manager (FT) | All FT vendors | Certified Food Manager | Yes (FT) |
| Food Handler Card (FT) | All FT vendors | Food Safety Trained | Recommended (FT) |
| USDA Organic | None (voluntary) | 🌱 Certified Organic | No |
| GAP Certified | None (voluntary) | ✓ GAP Certified | No |
| Regenerative Certified | None (voluntary) | ♻️ Regenerative | No |
| Certificate of Insurance | Soft gate (events only) | 🛡️ Insured | For events |

## Vendor UI Mockup

```
📋 Documents & Certifications

REQUIRED FOR YOUR CATEGORIES:
┌─────────────────────────────────────────────────────┐
│ ✅ Cottage Food Registration                        │
│    Unlocks: Baked Goods, Pantry                     │
│    #CF-2025-1234 | TX | Expires 12/2026            │
│    Badge: 🏠 Cottage Food                           │
│    [View Document] [Upload New]                     │
├─────────────────────────────────────────────────────┤
│ ⏳ DSHS Temp Food Permit                            │
│    Unlocks: Dairy & Eggs                            │
│    Uploaded 3/25/2026 — Pending admin review        │
│    [View Document] [Upload New]                     │
└─────────────────────────────────────────────────────┘

OPTIONAL (adds profile badges):
┌─────────────────────────────────────────────────────┐
│ ➕ USDA Organic — Badge: 🌱 Certified Organic       │
│ ➕ GAP Certified — Badge: ✓ Good Agricultural       │
│ ➕ Certificate of Insurance — Required for events    │
└─────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Badge metadata in category-requirements.ts (0.5 hr, Low)
Add `badge` field to each doc type:
```typescript
{ docType: 'cottage_food_ack', badge: { icon: '🏠', label: 'Cottage Food', color: '#d97706', bg: '#fef3c7' } }
```

### Step 2: New unified component DocumentsCertificationsSection.tsx (2-3 hrs, Medium)
- Props: `vendorId`, `vertical`, `mode` ('onboarding' | 'profile')
- Fetches onboarding status for gate docs
- Reads vendor profile for optional certs
- Renders required docs section (from category_verifications)
- Renders optional badges section (from certifications + available badge types)
- Upload handler routes to correct API based on doc type
- Shows status, expiration, admin feedback
- In onboarding mode: emphasizes required, hides optional
- In profile mode: shows both, required on top

### Step 3: Edit profile integration (0.5 hr, Low)
- Replace `CertificationsForm` with unified component in profile mode
- Pass vendor's category_verifications data (need to fetch from onboarding status API)

### Step 4: Public profile badge update (1 hr, Medium)
- Badge rendering reads from both `category_verifications` (approved docs with badge config) AND `certifications` (existing voluntary badges)
- Deduplicate: if same cert exists in both, show once
- Only show badges for approved docs

### Step 5: Expiration tracking (1-2 hrs, Medium)
- Add `expires_at` field to category_verifications entries
- Dashboard warning when docs expire within 30 days
- Cron job consideration: notify vendor of upcoming expirations
- Expired required doc could trigger a warning banner (not immediate deactivation)

### Step 6: Onboarding checklist update (1 hr, Low)
- Gate 2 content uses the unified component in onboarding mode
- Same component, different presentation emphasis

## Files That Will Change

- `src/lib/onboarding/category-requirements.ts` — add badge metadata
- `src/components/vendor/DocumentsCertificationsSection.tsx` — NEW unified component
- `src/app/[vertical]/vendor/edit/page.tsx` — swap CertificationsForm
- `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` — badge rendering update
- `src/components/vendor/OnboardingChecklist.tsx` — use unified component for Gate 2
- `src/components/vendor/CertificationsForm.tsx` — deprecated (kept for reference)
- `src/components/vendor/CategoryDocumentUpload.tsx` — deprecated (absorbed into unified)

## Dependencies

- None. No migrations needed. No API changes. All data stays where it is.
- Can be built incrementally: step 1-3 first (edit profile), then 4-6.
