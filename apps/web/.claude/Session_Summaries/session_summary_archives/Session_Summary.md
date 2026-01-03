# Session Summary - FastWrks BuildApp Review

## Project Overview

**What this app does:** FastWrks BuildApp is a config-driven, vertical-agnostic marketplace platform. It allows different marketplace verticals (fireworks stands, farmers markets, etc.) to be configured through JSON files, with the UI and forms dynamically generated from those configurations. The platform supports vendor signup/management, listings, buyer interactions, and transactions.

**Current development stage:** Phase 0 / Early Prototype. The project has basic scaffolding with:
- A working Next.js 16 web application
- Config-driven form rendering for vendor signup
- Two example vertical configurations (fireworks, farmers_market)
- Basic data persistence (NDJSON file-based)

---

## Folder Structure

```
BuildApp/
├── apps/
│   └── web/                          # Next.js 16 web application
│       ├── src/
│       │   └── app/
│       │       ├── layout.tsx        # Root layout with Geist fonts
│       │       ├── page.tsx          # Homepage - lists detected verticals
│       │       ├── globals.css       # Global styles with dark mode support
│       │       ├── page.module.css   # Page-specific styles (unused currently)
│       │       ├── fireworks/
│       │       │   └── vendor-signup/page.tsx   # Hardcoded fireworks signup (legacy)
│       │       ├── [vertical]/
│       │       │   └── vendor-signup/page.tsx   # Dynamic vendor signup form
│       │       └── api/
│       │           ├── vertical/[id]/route.ts   # GET vertical config by ID
│       │           └── submit/route.ts          # POST form submissions
│       ├── public/                   # Static assets (SVG icons)
│       ├── package.json              # Dependencies
│       ├── tsconfig.json             # TypeScript config
│       ├── next.config.ts            # Next.js config (empty)
│       └── eslint.config.mjs         # ESLint config
├── config/
│   ├── verticals/
│   │   ├── fireworks.json            # Fireworks marketplace config
│   │   └── farmers_market.json       # Farmers market config
│   └── agreements/                   # Legal agreement templates (empty)
│       ├── buyer_terms_core.md
│       ├── vendor_terms_core.md
│       ├── platform_terms_core.md
│       ├── food_produce_addendum.md
│       └── regulated_goods_fireworks.md
├── data/
│   └── submissions.ndjson            # Form submissions storage
├── docs/
│   └── architecture/
│       ├── config-driven-forms.md    # Form renderer specification
│       ├── core-data-model.md        # Entity definitions
│       └── screen-flows.md           # Screen flow documentation
└── FastWrks logo.png
```

---

## Implemented Features

### Working Features
1. **Homepage (`/`)**: Server-side renders a list of detected verticals by scanning `config/verticals/*.json`
2. **Dynamic Vendor Signup (`/[vertical]/vendor-signup`)**:
   - Fetches vertical config via API
   - Dynamically renders form fields based on `vendor_fields` array
   - Supports field types: text, email, phone, textarea, select, multi_select, file, date
   - Submits data to `/api/submit` endpoint
3. **API Routes**:
   - `GET /api/vertical/[id]` - Returns vertical JSON config
   - `POST /api/submit` - Appends submissions to NDJSON file
4. **Vertical Configurations**: Two complete vertical configs with:
   - Custom nouns (vendor/buyer naming)
   - Seasonality windows
   - Verification requirements
   - Location/fulfillment settings
   - Vendor, listing, and buyer field definitions
   - Buyer filter definitions
   - Agreement references

### Key Components
- `src/app/page.tsx` - Homepage with vertical discovery
- `src/app/[vertical]/vendor-signup/page.tsx` - Dynamic form renderer (client component)
- `src/app/api/vertical/[id]/route.ts` - Config API endpoint
- `src/app/api/submit/route.ts` - Submission persistence

---

## Architecture Notes

### Tech Stack
- **Framework**: Next.js 16.1.1 (App Router)
- **React**: 19.2.3
- **Language**: TypeScript 5
- **Styling**: CSS modules + inline styles
- **Storage**: File-based (NDJSON) - no database yet
- **Fonts**: Geist Sans/Mono via next/font

### Design Patterns
1. **Config-Driven UI**: All forms/fields are defined in vertical JSON configs, not hardcoded
2. **Vertical Agnostic**: Core code has no vertical-specific logic
3. **Server Components + Client Components**: Homepage uses Server Components; forms use Client Components
4. **Relative Path Resolution**: Uses `process.cwd()` with relative paths to locate config files

### Data Flow
```
1. User visits /{vertical}/vendor-signup
2. Client component fetches /api/vertical/{vertical}
3. API reads config/verticals/{vertical}.json
4. Form rendered based on vendor_fields array
5. On submit, POST to /api/submit
6. Submission appended to data/submissions.ndjson
```

---

## Observations

### Code Quality/Organization
- Clean separation between config and code
- TypeScript properly configured with strict mode
- Consistent code style
- Good use of Next.js 16 App Router patterns

### Potential Issues/Concerns
1. **Duplicate Code**: `fireworks/vendor-signup/page.tsx` and `[vertical]/vendor-signup/page.tsx` are nearly identical - the hardcoded fireworks page appears to be legacy
2. **No Validation**: Form fields marked `required` are not actually validated on submit
3. **No Error Handling**: API fetch failures show basic alert but no retry/recovery
4. **File Upload**: Currently only stores filename, not actual file content (noted as "Phase 0")
5. **No Authentication**: No user auth/sessions implemented yet
6. **NDJSON Storage**: Works for prototyping but needs database for production
7. **Path Resolution**: `getRepoRoot()` assumes specific directory structure - fragile if moved
8. **Empty Agreement Files**: Agreement markdown files exist but are empty (0 bytes)
9. **Hardcoded Metadata**: `layout.tsx` still has "Create Next App" title/description

### Incomplete Sections
- Listing creation/management
- Buyer flow (browsing, filtering, transactions)
- Admin flow (verification, moderation)
- User authentication
- Verification document upload/review
- Actual payment integration
- Map/location features

---

## Questions for Chet

1. **Legacy Page**: Can `src/app/fireworks/vendor-signup/page.tsx` be deleted? It seems superseded by the dynamic `[vertical]` route.

2. **Validation Strategy**: Should form validation happen client-side, server-side, or both? The architecture doc mentions validation rules but they're not implemented.

3. **File Uploads**: What's the plan for actual file storage? (S3, local filesystem, etc.)

4. **Database**: Is there a preferred database (Postgres, SQLite, etc.) for when we move beyond NDJSON?

5. **Authentication**: Any preference for auth approach? (NextAuth, Clerk, custom, etc.)

6. **Agreement Files**: The agreement markdown files are empty - should content be added now or later?

7. **Monorepo Structure**: The `apps/web` structure suggests this might become a monorepo - are other apps planned (mobile, admin)?

8. **Next Steps Priority**: Which flow to build next?
   - Complete vendor flow (listing creation)?
   - Start buyer flow (browse listings)?
   - Add authentication first?

---

*Generated: January 3, 2026*
