# Build Instructions - Phase 3 Step 8: Vendor UI Components

**Created:** January 9, 2026  
**For:** Claude Code (CC)  
**Phase:** 3 of 12 - Step 8  
**Status:** APIs Complete ✅ - Now Building UI  
**Estimated Duration:** 3-4 hours

---

## Context

**Phase 3 Progress:**
- ✅ Step 1-2: Database migration created and applied
- ✅ Step 3-7: All API endpoints built (Stripe, cart, checkout, orders, webhooks)
- 🔨 Step 8: Vendor UI (THIS STEP)
- ⏳ Step 9: Buyer UI (next)
- ⏳ Step 10-12: Testing, bug fixes, documentation

**What this step adds:**
- Stripe Connect onboarding interface for vendors
- Vendor orders dashboard to manage incoming orders
- Order status management (confirm, ready, fulfill)

---

## Objective

Build vendor-facing UI components that allow vendors to:
1. Connect their Stripe account to receive payments
2. View incoming orders from buyers
3. Manage order status (confirm → ready → fulfill)
4. Trigger payouts when orders are fulfilled

---

## Step 8 Tasks Overview

1. Create Stripe onboarding page
2. Create Stripe status check page
3. Create vendor orders dashboard
4. Create order status action buttons
5. Add navigation links
6. Test vendor flow
7. Commit and push

---

## Task 8.1: Vendor Stripe Onboarding Page

### Create File: `src/app/[vertical]/vendor/dashboard/stripe/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface StripeStatus {
  connected: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
}

export default function VendorStripePage() {
  const router = useRouter();
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const response = await fetch('/api/vendor/stripe/status');
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError('Failed to check Stripe status');
    } finally {
      setLoading(false);
    }
  }

  async function startOnboarding() {
    setOnboarding(true);
    setError(null);

    try {
      const response = await fetch('/api/vendor/stripe/onboard', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to start onboarding');
      }

      const data = await response.json();
      
      // Redirect to Stripe onboarding
      window.location.href = data.url;
    } catch (err) {
      setError('Failed to start Stripe onboarding. Please try again.');
      setOnboarding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Payment Settings</h1>
        <p className="text-muted-foreground">
          Connect your bank account to receive payments from customers
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Stripe Connect</CardTitle>
          <CardDescription>
            Receive payments directly to your bank account via Stripe
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status?.connected ? (
            <>
              <p className="text-sm text-muted-foreground">
                To start selling and receiving payments, you need to connect your bank account 
                through Stripe. This is a secure process that takes about 5 minutes.
              </p>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">What you'll need:</h3>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Business or personal information</li>
                  <li>Bank account details (routing & account number)</li>
                  <li>Social Security Number or EIN</li>
                </ul>
              </div>
              <Button 
                onClick={startOnboarding} 
                disabled={onboarding}
                size="lg"
                className="w-full"
              >
                {onboarding ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting to Stripe...
                  </>
                ) : (
                  'Connect Bank Account'
                )}
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  Your Stripe account is connected
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <StatusItem
                  label="Charges Enabled"
                  enabled={status.chargesEnabled}
                />
                <StatusItem
                  label="Payouts Enabled"
                  enabled={status.payoutsEnabled}
                />
                <StatusItem
                  label="Details Submitted"
                  enabled={status.detailsSubmitted}
                />
              </div>

              {!status.chargesEnabled || !status.payoutsEnabled ? (
                <div className="pt-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Your account setup is incomplete. Click below to continue.
                  </p>
                  <Button 
                    onClick={startOnboarding} 
                    disabled={onboarding}
                    variant="outline"
                  >
                    {onboarding ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Redirecting...
                      </>
                    ) : (
                      'Complete Setup'
                    )}
                  </Button>
                </div>
              ) : (
                <div className="pt-4">
                  <Button 
                    onClick={() => router.push('/vendor/dashboard/orders')}
                    size="lg"
                    className="w-full"
                  >
                    View Orders
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusItem({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm">{label}</span>
      {enabled ? (
        <CheckCircle2 className="h-5 w-5 text-green-600" />
      ) : (
        <XCircle className="h-5 w-5 text-gray-400" />
      )}
    </div>
  );
}
```

### Create File: `src/app/[vertical]/vendor/dashboard/stripe/complete/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';

export default function StripeCompletePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Check status after returning from Stripe
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const response = await fetch('/api/vendor/stripe/status');
      const data = await response.json();
      
      if (data.connected && data.chargesEnabled && data.payoutsEnabled) {
        setSuccess(true);
      }
    } catch (err) {
      console.error('Status check failed:', err);
    } finally {
      setChecking(false);
    }
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <CardTitle>
              {success ? 'Bank Account Connected!' : 'Setup In Progress'}
            </CardTitle>
          </div>
          <CardDescription>
            {success 
              ? 'You can now start selling and receiving payments'
              : 'Your account is being verified by Stripe'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {success ? (
            <>
              <p className="text-sm text-muted-foreground">
                Your Stripe account is fully connected. You can now create bundles 
                and start receiving orders from customers.
              </p>
              <Button 
                onClick={() => router.push('/vendor/dashboard')}
                size="lg"
                className="w-full"
              >
                Go to Dashboard
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Stripe is verifying your information. This usually takes a few minutes. 
                You can check back later or proceed to your dashboard.
              </p>
              <div className="space-y-2">
                <Button 
                  onClick={() => router.push('/vendor/dashboard')}
                  size="lg"
                  className="w-full"
                >
                  Go to Dashboard
                </Button>
                <Button 
                  onClick={checkStatus}
                  variant="outline"
                  className="w-full"
                >
                  Check Status Again
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### Create File: `src/app/[vertical]/vendor/dashboard/stripe/refresh/page.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function StripeRefreshPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect back to stripe page to retry
    router.push('/vendor/dashboard/stripe');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
```

---

## Task 8.2: Vendor Orders Dashboard

### Create File: `src/app/[vertical]/vendor/dashboard/orders/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  CheckCircle2, 
  Clock, 
  Package, 
  AlertCircle,
  RefreshCw 
} from 'lucide-react';

interface OrderItem {
  id: string;
  order_id: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
  platform_fee_cents: number;
  vendor_payout_cents: number;
  status: string;
  created_at: string;
  order: {
    id: string;
    order_number: string;
    buyer_user_id: string;
    created_at: string;
  };
  listing: {
    title: string;
    description: string;
  };
}

export default function VendorOrdersPage() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    fetchOrders();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchOrders() {
    try {
      const response = await fetch('/api/vendor/orders');
      if (!response.ok) throw new Error('Failed to fetch orders');
      
      const data = await response.json();
      setOrders(data.orderItems || []);
      setError(null);
    } catch (err) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  async function updateOrderStatus(
    orderId: string, 
    action: 'confirm' | 'ready' | 'fulfill'
  ) {
    try {
      const response = await fetch(`/api/vendor/orders/${orderId}/${action}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to update order');

      // Refresh orders
      await fetchOrders();
    } catch (err) {
      alert('Failed to update order status');
    }
  }

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true;
    return order.status === activeTab;
  });

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const confirmedCount = orders.filter(o => o.status === 'confirmed').length;
  const readyCount = orders.filter(o => o.status === 'ready').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground">
            Manage incoming orders from customers
          </p>
        </div>
        <Button onClick={fetchOrders} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            All ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending {pendingCount > 0 && `(${pendingCount})`}
          </TabsTrigger>
          <TabsTrigger value="confirmed">
            Confirmed {confirmedCount > 0 && `(${confirmedCount})`}
          </TabsTrigger>
          <TabsTrigger value="ready">
            Ready {readyCount > 0 && `(${readyCount})`}
          </TabsTrigger>
          <TabsTrigger value="fulfilled">
            Fulfilled
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-6">
          {filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {activeTab === 'all' 
                    ? 'No orders yet'
                    : `No ${activeTab} orders`
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                onUpdateStatus={updateOrderStatus}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrderCard({
  order,
  onUpdateStatus,
}: {
  order: OrderItem;
  onUpdateStatus: (orderId: string, action: 'confirm' | 'ready' | 'fulfill') => void;
}) {
  const [updating, setUpdating] = useState(false);

  async function handleAction(action: 'confirm' | 'ready' | 'fulfill') {
    setUpdating(true);
    try {
      await onUpdateStatus(order.id, action);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              {order.listing.title}
            </CardTitle>
            <CardDescription>
              Order #{order.order.order_number}
            </CardDescription>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Quantity</p>
            <p className="font-medium">{order.quantity}</p>
          </div>
          <div>
            <p className="text-muted-foreground">You Receive</p>
            <p className="font-medium">
              ${(order.vendor_payout_cents / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Order Date</p>
            <p className="font-medium">
              {new Date(order.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Order Time</p>
            <p className="font-medium">
              {new Date(order.created_at).toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {order.status === 'pending' && (
            <Button
              onClick={() => handleAction('confirm')}
              disabled={updating}
              size="sm"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Confirm Order'
              )}
            </Button>
          )}

          {order.status === 'confirmed' && (
            <Button
              onClick={() => handleAction('ready')}
              disabled={updating}
              size="sm"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Mark Ready for Pickup'
              )}
            </Button>
          )}

          {order.status === 'ready' && (
            <Button
              onClick={() => handleAction('fulfill')}
              disabled={updating}
              size="sm"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Mark Fulfilled'
              )}
            </Button>
          )}

          {order.status === 'fulfilled' && (
            <div className="flex items-center text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Order completed
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pending: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
    confirmed: { label: 'Confirmed', icon: CheckCircle2, color: 'bg-blue-100 text-blue-800' },
    ready: { label: 'Ready', icon: Package, color: 'bg-purple-100 text-purple-800' },
    fulfilled: { label: 'Fulfilled', icon: CheckCircle2, color: 'bg-green-100 text-green-800' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge variant="secondary" className={config.color}>
      <Icon className="h-3 w-3 mr-1" />
      {config.label}
    </Badge>
  );
}
```

---

## Task 8.3: Update Vendor Dashboard Navigation

### Update File: `src/app/[vertical]/vendor/dashboard/page.tsx`

**Add links to new pages in the dashboard:**

```typescript
// Add these navigation cards to the existing dashboard

import Link from 'next/link';
import { CreditCard, Package } from 'lucide-react';

// In the dashboard grid, add:

<Link href="/vendor/dashboard/stripe">
  <Card className="hover:shadow-lg transition-shadow cursor-pointer">
    <CardHeader>
      <CreditCard className="h-8 w-8 mb-2 text-primary" />
      <CardTitle>Payment Settings</CardTitle>
      <CardDescription>
        Connect your bank account to receive payments
      </CardDescription>
    </CardHeader>
  </Card>
</Link>

<Link href="/vendor/dashboard/orders">
  <Card className="hover:shadow-lg transition-shadow cursor-pointer">
    <CardHeader>
      <Package className="h-8 w-8 mb-2 text-primary" />
      <CardTitle>Orders</CardTitle>
      <CardDescription>
        Manage incoming orders from customers
      </CardDescription>
    </CardHeader>
  </Card>
</Link>
```

---

## Task 8.4: Add UI Components (If Not Already Present)

**Check if these shadcn/ui components exist. If not, install them:**

```bash
# Check if these files exist in src/components/ui/
# If missing, install them:

npx shadcn-ui@latest add badge
npx shadcn-ui@latest add tabs
```

---

## Task 8.5: Commit Vendor UI

```bash
git add src/app/[vertical]/vendor/dashboard/stripe/
git add src/app/[vertical]/vendor/dashboard/orders/
git add src/app/[vertical]/vendor/dashboard/page.tsx
git commit -m "Phase 3 Step 8: Add vendor UI components

- Stripe Connect onboarding flow
- Stripe status check and completion pages
- Vendor orders dashboard with status management
- Order status badges and action buttons
- Real-time order polling (30-second interval)
- Navigation links in vendor dashboard"

git push origin main
```

---

## Testing Checklist

After building, test the following:

### Test 1: Stripe Onboarding
- [ ] Go to `/vendor/dashboard`
- [ ] Click "Payment Settings" card
- [ ] Click "Connect Bank Account" button
- [ ] Redirects to Stripe onboarding page
- [ ] Complete onboarding (use Stripe test mode)
- [ ] Returns to `/vendor/dashboard/stripe/complete`
- [ ] Shows success message
- [ ] Status shows all green checkmarks

### Test 2: Orders Dashboard
- [ ] Go to `/vendor/dashboard/orders`
- [ ] Page loads without errors
- [ ] Shows "No orders yet" message (if no orders)
- [ ] Tabs display correctly (All, Pending, Confirmed, Ready, Fulfilled)

### Test 3: Order Status Flow (After orders exist)
- [ ] See pending order in dashboard
- [ ] Click "Confirm Order" → status updates to confirmed
- [ ] Click "Mark Ready for Pickup" → status updates to ready
- [ ] Click "Mark Fulfilled" → status updates to fulfilled
- [ ] Payout record created in database

### Test 4: Refresh and Polling
- [ ] Click refresh button → orders reload
- [ ] Wait 30 seconds → orders auto-refresh
- [ ] Create new order in another browser → appears automatically

---

## Common Issues & Solutions

### Issue 1: "Stripe not configured" error
**Solution:** Check that environment variables are set in Vercel/local .env.local:
```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### Issue 2: Orders not showing
**Solution:** 
1. Check vendor is connected to Stripe
2. Verify orders exist in database for this vendor
3. Check RLS policies allow vendor to see orders

### Issue 3: Status update fails
**Solution:**
1. Check API endpoint is returning 200
2. Verify vendor owns the order item
3. Check database constraints allow status transition

### Issue 4: Redirect loop on Stripe return
**Solution:**
1. Verify return URLs in Stripe onboarding API call
2. Check `/complete` and `/refresh` pages exist
3. Ensure no auth middleware blocking Stripe redirect

---

## Important Notes

**Styling:**
- Components use existing vertical branding (colors auto-applied)
- Uses shadcn/ui components (consistent with existing UI)
- Responsive design (works on mobile and desktop)

**Performance:**
- Orders poll every 30 seconds (can adjust if needed)
- Refresh button for manual updates
- Loading states shown during API calls

**Security:**
- All API calls require authentication
- RLS policies enforce vendor can only see own orders
- Stripe account IDs never exposed to client

---

## Session Summary Requirements

**When complete, create brief summary including:**
- Files created
- Features implemented
- Testing results
- Any issues encountered
- Time spent

---

## Next Step After Completion

**After Step 8 is complete and tested:**
- Tracy will test the vendor flow
- If working, proceed to Step 9 (Buyer UI)
- If issues found, debug and fix before proceeding

---

*End of Step 8 Build Instructions*
