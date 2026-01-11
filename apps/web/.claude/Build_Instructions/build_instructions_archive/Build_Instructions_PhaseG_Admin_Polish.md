# Build Instructions - Phase G: Admin Polish & Notifications

**Date:** January 11, 2026  
**Priority:** Medium  
**Estimated Time:** 2-3 hours

---

## Prerequisites

**Read first:** Session_Summary_Direct_DB_Fixes_20260111.md

This documents database changes made directly via SQL that you need to be aware of.

---

## Overview

Phase G addresses remaining issues from admin testing:

1. User roles display incorrectly in admin/users
2. Browse page categories - verify source
3. Vendor notification on approval
4. Vendor must manually publish listings after approval (no auto-publish)

---

## Part 1: Fix User Roles Display in Admin Panel

### Problem
Admin → Users page shows "user" for everyone. Should show actual roles:
- `buyer` - shoppers only
- `vendor` - has vendor profile (any status)
- `buyer, vendor` - both
- `admin` - admin user

### Solution

**File:** `src/app/admin/users/page.tsx` (or wherever user list is rendered)

Update the query to join with vendor_profiles and check roles:

```typescript
// Fetch users with their vendor status
const { data: users, error } = await supabase
  .from('user_profiles')
  .select(`
    id,
    user_id,
    display_name,
    role,
    roles,
    created_at,
    vendor_profiles (
      id,
      status,
      vertical_id
    )
  `)
  .order('created_at', { ascending: false })

// Helper function to determine display role
function getDisplayRole(user: any): string {
  const roles: string[] = []
  
  // Check if admin
  if (user.role === 'admin' || user.roles?.includes('admin')) {
    roles.push('admin')
  }
  
  // Check if vendor (has any vendor profile)
  if (user.vendor_profiles && user.vendor_profiles.length > 0) {
    roles.push('vendor')
  }
  
  // Check if buyer (default, or explicit in roles)
  if (user.roles?.includes('buyer') || roles.length === 0) {
    if (!roles.includes('admin')) { // Don't show buyer for admins
      roles.push('buyer')
    }
  }
  
  return roles.join(', ')
}
```

Update the table rendering:

```typescript
<td className="p-3 border">
  <span className={`px-2 py-1 rounded text-sm ${
    getDisplayRole(user).includes('admin') ? 'bg-purple-100 text-purple-700' :
    getDisplayRole(user).includes('vendor') ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-700'
  }`}>
    {getDisplayRole(user)}
  </span>
</td>
```

### Also Show Vendor Status (Optional Enhancement)

For users who are vendors, show their approval status:

```typescript
<td className="p-3 border">
  {user.vendor_profiles?.map((vp: any) => (
    <div key={vp.id} className="text-sm">
      <span className={`px-2 py-1 rounded ${
        vp.status === 'approved' ? 'bg-green-100 text-green-700' :
        vp.status === 'rejected' ? 'bg-red-100 text-red-700' :
        'bg-yellow-100 text-yellow-700'
      }`}>
        {vp.vertical_id}: {vp.status}
      </span>
    </div>
  ))}
</td>
```

---

## Part 2: Verify Browse Page Categories Source

### Check Current Implementation

**File:** `src/app/[vertical]/browse/page.tsx` (or BrowsePage component)

Look for how categories dropdown is populated:

**If pulling from listings (WRONG):**
```typescript
// BAD - categories come from existing listings
const { data: categories } = await supabase
  .from('listings')
  .select('category')
  .eq('vertical_id', vertical)
// This misses categories with no listings
```

**Should pull from config (CORRECT):**
```typescript
// GOOD - categories come from vertical config
const { data: verticalData } = await supabase
  .from('verticals')
  .select('config')
  .eq('vertical_id', vertical)
  .single()

const listingFields = verticalData?.config?.listing_fields || []
const categoryField = listingFields.find((f: any) => f.key === 'product_categories' || f.key === 'category')
const categories = categoryField?.options || []
```

### Fix If Needed

Update the browse page to use config-based categories:

```typescript
// In page component or data fetching:
async function getCategories(vertical: string) {
  const supabase = createServerClient()
  
  const { data } = await supabase
    .from('verticals')
    .select('config')
    .eq('vertical_id', vertical)
    .single()
  
  const listingFields = data?.config?.listing_fields || []
  const categoryField = listingFields.find(
    (f: any) => f.key === 'product_categories' || f.key === 'category'
  )
  
  return categoryField?.options || []
}

// Then use in component:
const categories = await getCategories(params.vertical)
```

### Also Check Listing Form

**File:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`

Verify the category dropdown uses the same source (config), not hardcoded values.

---

## Part 3: Vendor Notification on Approval

### Overview

When admin approves a vendor, send them an email notification.

### Option A: Use Supabase Email (Simplest)

If Supabase email is configured, use the built-in notification system.

**File:** `src/app/api/admin/vendors/[id]/approve/route.ts`

Add after status update:

```typescript
// After successful status update to 'approved'

// Get vendor's email
const { data: vendorData } = await supabase
  .from('vendor_profiles')
  .select(`
    profile_data,
    user_id
  `)
  .eq('id', params.id)
  .single()

// Get user email from auth
const { data: { user: vendorUser } } = await supabase.auth.admin.getUserById(vendorData.user_id)

const vendorEmail = vendorData?.profile_data?.email || vendorUser?.email
const businessName = vendorData?.profile_data?.business_name || 'Your business'

// Create in-app notification
await supabase
  .from('notifications')
  .insert({
    user_id: vendorData.user_id,
    type: 'vendor_approved',
    title: 'Your Vendor Account is Approved!',
    message: `Congratulations! ${businessName} has been approved. You can now publish your listings.`,
    data: {
      vendor_profile_id: params.id,
      approved_at: new Date().toISOString()
    }
  })

// TODO: Send actual email via email service
// For now, just log it
console.log(`[NOTIFICATION] Vendor approved: ${vendorEmail} - ${businessName}`)
```

### Option B: Email Service Integration (Future)

For actual emails, integrate with SendGrid, Resend, or similar:

```typescript
// Example with Resend (future implementation)
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

await resend.emails.send({
  from: 'noreply@farmersmarketing.app',
  to: vendorEmail,
  subject: 'Your Vendor Account is Approved!',
  html: `
    <h1>Congratulations!</h1>
    <p>${businessName} has been approved on Fresh Market.</p>
    <p>You can now log in and publish your listings.</p>
    <a href="https://farmersmarketing.app/farmers_market/vendor/dashboard">
      Go to Vendor Dashboard
    </a>
  `
})
```

### Also Add Rejection Notification

**File:** `src/app/api/admin/vendors/[id]/reject/route.ts`

```typescript
// After status update to 'rejected'

await supabase
  .from('notifications')
  .insert({
    user_id: vendorData.user_id,
    type: 'vendor_rejected',
    title: 'Vendor Application Update',
    message: `We were unable to approve ${businessName} at this time. Please contact support for more information.`,
    data: {
      vendor_profile_id: params.id,
      rejected_at: new Date().toISOString(),
      reason: reason || null  // From request body if provided
    }
  })
```

---

## Part 4: Vendor Must Manually Publish After Approval

### Current Behavior (Correct)
- Pending vendor creates listing → saved as 'draft'
- Admin approves vendor → vendor status = 'approved'
- Listings remain as 'draft' (NOT auto-published)
- Vendor must manually publish each listing

### What to Add: Prompt Vendor to Publish

**File:** `src/app/[vertical]/vendor/dashboard/page.tsx`

Show a notice if vendor has draft listings:

```typescript
// Fetch draft listings count
const { data: draftListings } = await supabase
  .from('listings')
  .select('id')
  .eq('vendor_profile_id', vendorProfile.id)
  .eq('status', 'draft')

const draftCount = draftListings?.length || 0

// In the component JSX:
{draftCount > 0 && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
    <p className="text-blue-800">
      <strong>You have {draftCount} draft listing{draftCount > 1 ? 's' : ''}!</strong>
      <br />
      Your account is approved. Visit your listings to publish them and make them visible to buyers.
    </p>
    <Link 
      href={`/${vertical}/vendor/listings`}
      className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      View My Listings →
    </Link>
  </div>
)}
```

### Update Listings Page to Show Publish Option

**File:** `src/app/[vertical]/vendor/listings/page.tsx`

For each draft listing, show prominent "Publish" button:

```typescript
{listing.status === 'draft' && (
  <button
    onClick={() => handlePublish(listing.id)}
    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
  >
    Publish
  </button>
)}

// Handler function
async function handlePublish(listingId: string) {
  const { error } = await supabase
    .from('listings')
    .update({ 
      status: 'published',
      updated_at: new Date().toISOString()
    })
    .eq('id', listingId)
  
  if (error) {
    alert('Failed to publish listing')
  } else {
    // Refresh the list
    fetchListings()
  }
}
```

---

## Part 5: Show Notifications to Users (Optional but Recommended)

### Add Notification Bell to Header

**File:** `src/components/Header.tsx` (or layout component)

```typescript
// Fetch unread notifications count
const { data: notifications } = await supabase
  .from('notifications')
  .select('id')
  .eq('user_id', user.id)
  .eq('read', false)

const unreadCount = notifications?.length || 0

// In header JSX:
<Link href={`/${vertical}/notifications`} className="relative">
  <BellIcon className="h-6 w-6" />
  {unreadCount > 0 && (
    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
      {unreadCount}
    </span>
  )}
</Link>
```

### Create Notifications Page

**File:** `src/app/[vertical]/notifications/page.tsx`

```typescript
export default async function NotificationsPage({ params }: { params: { vertical: string } }) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect(`/${params.vertical}/login`)
  
  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  
  // Mark as read
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)
  
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Notifications</h1>
      
      {notifications?.length === 0 ? (
        <p className="text-gray-500">No notifications</p>
      ) : (
        <div className="space-y-4">
          {notifications?.map((notif) => (
            <div 
              key={notif.id}
              className={`p-4 rounded-lg border ${
                notif.read ? 'bg-white' : 'bg-blue-50 border-blue-200'
              }`}
            >
              <h3 className="font-semibold">{notif.title}</h3>
              <p className="text-gray-600">{notif.message}</p>
              <p className="text-sm text-gray-400 mt-2">
                {new Date(notif.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Testing Checklist

### Part 1: User Roles Display
- [ ] Admin/users shows 'admin' for jennifer@8fifteenconsulting.com
- [ ] Shows 'vendor' for users with vendor_profiles
- [ ] Shows 'buyer' for regular users
- [ ] Shows 'buyer, vendor' for users who are both

### Part 2: Browse Categories
- [ ] Categories dropdown shows all options from config
- [ ] Includes: Produce, Meat, Dairy, Eggs, Baked Goods, Prepared Foods, Preserves, Honey, Plants, Crafts, Other
- [ ] Listing form uses same categories

### Part 3: Approval Notification
- [ ] Approving vendor creates notification record
- [ ] Notification appears in vendor's notification list
- [ ] Rejecting vendor creates notification record

### Part 4: Draft Listings Flow
- [ ] Approved vendor sees "You have X draft listings" notice
- [ ] Listings page shows Publish button for drafts
- [ ] Clicking Publish changes status to 'published'
- [ ] Published listing appears on browse page

### Part 5: Notifications (if implemented)
- [ ] Notification bell shows unread count
- [ ] Notifications page lists all notifications
- [ ] Viewing marks notifications as read

---

## Commit Strategy

```bash
# After Part 1
git add -A
git commit -m "Fix user roles display in admin panel"

# After Parts 2-3
git add -A
git commit -m "Verify browse categories, add approval notifications"

# After Part 4
git add -A
git commit -m "Add draft listings notice and publish button for vendors"

# After Part 5 (if done)
git add -A
git commit -m "Add notifications bell and page"

# Push
git push origin main
```

---

## Database Note

The `notifications` table should already exist. If not, create it:

```sql
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "System can create notifications" ON public.notifications
FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own notifications" ON public.notifications
FOR UPDATE USING (user_id = (SELECT auth.uid()));
```

---

## Session Summary Template

```markdown
# Session Summary - Phase G: Admin Polish & Notifications

**Date:** [DATE]
**Duration:** [TIME]

## Completed
- [ ] Fixed user roles display in admin/users
- [ ] Verified/fixed browse page categories source
- [ ] Added approval/rejection notifications
- [ ] Added draft listings notice for vendors
- [ ] Added publish button for draft listings
- [ ] Added notifications page (optional)

## Files Modified
[List files]

## Testing Results
[Fill from checklist]

## Notes
[Any issues]
```
