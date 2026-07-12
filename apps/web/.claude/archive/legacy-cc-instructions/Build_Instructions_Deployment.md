# Build Instructions - Deployment Setup (Phase 1)

## Objective
Set up dual-environment infrastructure: local development + Vercel staging deployment, both with separate Supabase projects.

## Prerequisites Needed from User
Before starting, confirm user has:
- GitHub repository URL for this project
- Supabase account login credentials
- Vercel account login credentials

## Tasks

### 1. GitHub Repository Setup
**If repo doesn't exist yet:**
- Create new GitHub repository
- Initialize git in project root
- Add `.gitignore` for Next.js (node_modules, .next, .env.local, etc.)
- Initial commit and push

**If repo exists:**
- Verify current commit status
- Ensure latest code is pushed

### 2. Supabase Project Setup

#### Create Dev Project (Local Development)
1. Log into Supabase dashboard
2. Create new project: "FastWrks-Marketplace-Dev"
3. Choose region (closest to user)
4. Note the following credentials:
   - Project URL
   - Anon/Public Key
   - Service Role Key (keep secure)
   - Database Password

#### Create Staging Project (Vercel Deployment)
1. Create second project: "FastWrks-Marketplace-Staging"
2. Same region as dev
3. Note the same credentials as above

### 3. Environment Variable Configuration

#### Create `.env.local` (Local Development - NOT committed to git)
```env
# Supabase Dev Project
NEXT_PUBLIC_SUPABASE_URL=https://[dev-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[dev-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[dev-service-role-key]

# App Config
NEXT_PUBLIC_APP_URL=http://localhost:3002
PORT=3002
```

#### Create `.env.example` (Template - IS committed to git)
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3002
PORT=3002
```

#### Update `.gitignore`
Ensure these lines exist:
```
.env.local
.env*.local
.env
```

### 4. Vercel Deployment Setup

#### Connect Repository to Vercel
1. Log into Vercel dashboard
2. "Add New Project"
3. Import from GitHub: Select FastWrks repository
4. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web` (important!)
   - **Build Command**: (use default)
   - **Output Directory**: (use default)
   - **Install Command**: (use default)

#### Add Environment Variables in Vercel
In Vercel project settings → Environment Variables, add:
```
NEXT_PUBLIC_SUPABASE_URL = [staging-project-url]
NEXT_PUBLIC_SUPABASE_ANON_KEY = [staging-anon-key]
SUPABASE_SERVICE_ROLE_KEY = [staging-service-role-key]
NEXT_PUBLIC_APP_URL = [your-vercel-url] (e.g., https://fastworks-marketplace.vercel.app)
```

**Note:** Vercel auto-generates the deployment URL - add NEXT_PUBLIC_APP_URL after first deploy

#### Deploy
- Click "Deploy"
- Wait for build to complete
- Note the deployment URL
- Go back and add NEXT_PUBLIC_APP_URL with the Vercel URL
- Redeploy if needed

### 5. Verify Deployment

#### Local Test
```bash
# In apps/web directory
npm run dev
```
Visit: http://localhost:3002
- Homepage should load
- Should list available verticals

#### Vercel Test
Visit: [your-vercel-url]
- Homepage should load
- Should list available verticals
- Note: Forms won't work yet (no database schema)

### 6. Update package.json (if needed)
Ensure port 3002 is specified:
```json
{
  "scripts": {
    "dev": "next dev -p 3002",
    "build": "next build",
    "start": "next start -p 3002"
  }
}
```

## Deliverables

Create `Session_Summary.md` with:

### Deployment Status
- GitHub repository URL
- Vercel deployment URL
- Confirmation both environments accessible

### Supabase Projects Created
- Dev project name and URL
- Staging project name and URL
- Credentials noted (in secure location, NOT in summary)

### Environment Configuration
- `.env.local` created and configured
- `.env.example` created and committed
- `.gitignore` updated
- Vercel environment variables configured

### Next Steps Needed
- Database schema design
- Authentication implementation
- Migration files
- Any issues encountered

### Questions/Blockers
- Any credentials missing?
- Any deployment errors?
- Any clarifications needed?

## Important Notes

**Security:**
- NEVER commit `.env.local` to git
- NEVER share service role keys in summary
- Service role keys have admin access to Supabase

**GitHub:**
- Ensure `.gitignore` is correct before first commit with env files
- If you accidentally committed `.env.local`, let user know immediately

**Vercel:**
- Auto-deploys on every push to main branch
- Can disable auto-deploy if desired
- Preview deployments created for PRs

**Port Configuration:**
- Local dev must use port 3002 (user requirement)
- Vercel ignores PORT env var (uses their infrastructure)
