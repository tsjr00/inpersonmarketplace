# Deployment Information

## Repository
- **GitHub:** https://github.com/tsjr00/inpersonmarketplace
- **Branch:** main

## Environments

### Local Development
- **URL:** http://localhost:3002
- **Database:** Supabase Dev (vawpviatqalicckkqchs)
- **Purpose:** Active development
- **Config:** `.env.local`

### Staging (Vercel)
- **URL:** https://inpersonmarketplace.vercel.app
- **Database:** Supabase Staging (vfknvsxfgcwqmlkuzhnq)
- **Purpose:** Preview/feedback/testing
- **Auto-deploy:** Enabled from main branch
- **Config:** Vercel Environment Variables

## Credentials Location
- **Local:** `.env.local` (gitignored)
- **Vercel:** Environment Variables in dashboard
- **Supabase Dev:** Dashboard → Settings → API
- **Supabase Staging:** Dashboard → Settings → API

## Deployment Workflow
1. Develop locally (port 3002)
2. Test locally
3. Commit to git
4. Push to GitHub main branch
5. Vercel auto-deploys
6. Test staging URL
7. Share staging URL for feedback

## Supabase Projects

| Environment | Project Name | Project ID |
|-------------|--------------|------------|
| Dev | InPersonMarketplace | vawpviatqalicckkqchs |
| Staging | InPersonMarketplace-Staging | vfknvsxfgcwqmlkuzhnq |

## Environment Variables

### Required Variables
| Variable | Scope | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase admin key (keep secure!) |
| `NEXT_PUBLIC_APP_URL` | Public | Application URL |

### Variable Visibility
- `NEXT_PUBLIC_*` = Exposed to browser (public)
- Without prefix = Server-side only (secure)

## Next Steps
- Database schema + migrations
- Authentication implementation
- Connect forms to Supabase
- Run migrations on both Dev and Staging

---

*Last Updated: 2026-01-03*
