# Build Instructions - Complete Deployment Setup

**Session Date:** January 3, 2026  
**Created by:** Chet (Claude Chat)  
**Folder:** .claude\Build_Instructions\  
**Previous Session:** Session_Summary_2026-01-03_Deployment.md

---

## Objective
Complete the deployment infrastructure by creating Supabase Staging project and deploying to Vercel with auto-deploy from GitHub.

## Current State
✅ GitHub repo: https://github.com/tsjr00/InPersonMarketplace  
✅ Supabase Dev project configured  
✅ Local dev working on localhost:3002  
❌ Supabase Staging project - NOT created  
❌ Vercel deployment - NOT configured

---

## Tasks

### 1. Create Supabase Staging Project

#### Access Supabase Dashboard
1. Log into https://supabase.com/dashboard
2. Click "New Project"

#### Configure Staging Project
- **Organization:** [Same as Dev project]
- **Name:** `InPersonMarketplace-Staging` or `FastWrks-Marketplace-Staging`
- **Database Password:** Generate strong password (save securely)
- **Region:** Same region as Dev project (for consistency)
- **Plan:** Free tier (for now)

#### Collect Credentials
Once project is created (takes ~2 minutes), note:
- **Project URL:** `https://[project-ref].supabase.co`
- **Anon/Public Key:** Found in Settings → API
- **Service Role Key:** Found in Settings → API (keep secure!)
- **Database Password:** What you set during creation

**IMPORTANT:** Store these credentials securely. DO NOT put them in the session summary.

---

### 2. Set Up Vercel Deployment

#### Connect Repository to Vercel
1. Log into https://vercel.com
2. Click "Add New..." → "Project"
3. Import Git Repository → Select `InPersonMarketplace`
4. If not connected to GitHub:
   - Click "Add GitHub Account"
   - Authorize Vercel
   - Select repository

#### Configure Project Settings
**Framework Preset:** Next.js (auto-detected)  
**Root Directory:** `apps/web` (CRITICAL - this is a monorepo)  
**Build Command:** Leave default (`npm run build`)  
**Output Directory:** Leave default  
**Install Command:** Leave default

#### Add Environment Variables (Before First Deploy)
In project settings → Environment Variables, add ALL of these:

```
Name: NEXT_PUBLIC_SUPABASE_URL
Value: [Staging project URL from step 1]
Environment: Production, Preview, Development

Name: NEXT_PUBLIC_SUPABASE_ANON_KEY  
Value: [Staging anon key from step 1]
Environment: Production, Preview, Development

Name: SUPABASE_SERVICE_ROLE_KEY
Value: [Staging service role key from step 1]
Environment: Production, Preview, Development

Name: NEXT_PUBLIC_APP_URL
Value: [Leave blank for now - will add after first deploy]
Environment: Production, Preview, Development

Name: PORT
Value: 3002
Environment: Production, Preview, Development
```

**Note:** Vercel will auto-assign a URL on first deploy. We'll update NEXT_PUBLIC_APP_URL afterward.

#### Deploy
1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Build should succeed
4. Note the deployment URL (e.g., `inpersonmarketplace.vercel.app` or similar)

---

### 3. Update Environment Variables with Deployment URL

#### In Vercel Dashboard
1. Go to project Settings → Environment Variables
2. Find `NEXT_PUBLIC_APP_URL`
3. Update value to: `https://[your-vercel-url]` (the URL from deployment)
4. Save changes

#### Trigger Redeploy
1. Go to Deployments tab
2. Click "..." on latest deployment → "Redeploy"
3. Check "Use existing Build Cache"
4. Click "Redeploy"

---

### 4. Verify Deployments

#### Local Development (Unchanged)
```bash
cd apps/web
npm run dev
```
Visit: http://localhost:3002
- [ ] Homepage loads
- [ ] Shows vertical list (fireworks, farmers_market)
- [ ] Can navigate to `/fireworks/vendor-signup`
- [ ] Form renders

#### Vercel Staging
Visit: `https://[your-vercel-url]`
- [ ] Homepage loads
- [ ] Shows vertical list
- [ ] Can navigate to vendor signup
- [ ] Form renders

**Expected:** Forms won't submit successfully yet (no database schema), but UI should render correctly.

---

### 5. Configure Auto-Deploy

#### Verify GitHub Integration
In Vercel project settings → Git:
- [ ] Connected to `tsjr00/InPersonMarketplace`
- [ ] Production Branch: `main`
- [ ] Auto-deploy enabled for main branch

**Result:** Every push to `main` branch = automatic Vercel deployment

---

### 6. Update Documentation

#### Create Deployment Info File
Create: `apps/web/.claude/deployment-info.md`

```markdown
# Deployment Information

## Environments

### Local Development
- **URL:** http://localhost:3002
- **Database:** Supabase Dev (vawpviatqalicckkqchs)
- **Purpose:** Active development

### Staging (Vercel)
- **URL:** https://[your-vercel-url]
- **Database:** Supabase Staging ([staging-project-ref])
- **Purpose:** Preview/feedback/testing
- **Auto-deploy:** Enabled from main branch

## Credentials Location
- Local: `.env.local` (gitignored)
- Vercel: Environment Variables in dashboard
- Supabase: Dashboard → Settings → API

## Deployment Workflow
1. Develop locally (port 3002)
2. Test locally
3. Commit to git
4. Push to GitHub main branch
5. Vercel auto-deploys
6. Test staging URL
7. Share staging URL for feedback

## Next Steps
- Database schema + migrations
- Authentication implementation
- Connect forms to Supabase
```

---

## Session Summary Requirements

When all tasks are complete, create your Session Summary:

1. **Copy template from:** `.claude\Build_Instructions\Session_Summary_Template.md`
2. **Fill in all relevant sections**
3. **Save as:** `.claude\Session_Summaries\Session_Summary_2026-01-03_Deployment_Complete.md`
4. **Let the user know** summary is ready

### Key Sections to Complete

**Tasks Completed:**
- [ ] Supabase Staging project created
- [ ] Vercel project configured
- [ ] Environment variables added
- [ ] Initial deployment successful
- [ ] NEXT_PUBLIC_APP_URL updated
- [ ] Redeployment successful
- [ ] Both environments verified
- [ ] Auto-deploy confirmed working

**Important Information:**
- Supabase Staging project name and URL
- Vercel deployment URL
- Confirmation: Credentials stored securely (NOT in summary)
- Auto-deploy status

**Testing & Verification:**
- Local test results (should still work)
- Vercel staging test results (homepage + form rendering)
- Any errors encountered

**Questions for Chet:**
- Any deployment errors or warnings?
- Any concerns about the setup?

**Next Steps Recommended:**
- Database schema design (based on core-data-model.md)
- Create migration files
- Authentication implementation
- Update API routes to use Supabase

---

## Important Notes

### Security
- Service role keys have ADMIN access to Supabase
- Never commit credentials to git
- Never share service role keys in session summary
- Store credentials in password manager if available

### Vercel Auto-Deploy
- Deploys ONLY from main branch
- Preview deployments created for pull requests (if using PRs)
- Can disable auto-deploy if needed (not recommended)

### Supabase Projects
- Dev and Staging are completely separate databases
- Changes to Dev schema won't affect Staging
- Will need to run migrations on both when ready

### Environment Variables
- Changes in Vercel require redeploy to take effect
- Local `.env.local` changes = just restart dev server
- NEXT_PUBLIC_ variables are exposed to browser (public)
- Variables without NEXT_PUBLIC_ are server-side only (secure)

---

## Troubleshooting

### If Vercel Build Fails
1. Check build logs in Vercel dashboard
2. Verify Root Directory is set to `apps/web`
3. Ensure all required env vars are set
4. Try clearing build cache and redeploying

### If Deployment URL Shows Error
1. Check Vercel deployment logs
2. Verify environment variables are correct
3. Check that project compiles locally first
4. Look for runtime errors in Vercel logs

### If Auto-Deploy Not Working
1. Verify GitHub app is authorized in GitHub settings
2. Check Vercel project → Git settings
3. Ensure production branch is set to `main`
4. Try manual deploy first to test

---

**Estimated Time:** 20-30 minutes  
**Complexity:** Medium (involves external services)
