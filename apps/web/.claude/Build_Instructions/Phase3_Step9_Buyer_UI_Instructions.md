# Build Instructions - Phase 3 Step 9: Buyer UI Components

**Created:** January 9, 2026  
**For:** Claude Code (CC)  
**Phase:** 3 of 12 - Step 9  
**Status:** Vendor UI Complete ✅ - Now Building Buyer UI  
**Estimated Duration:** 3-4 hours

---

## Context

**Phase 3 Progress:**
- ✅ Step 1-2: Database migration created and applied
- ✅ Step 3-7: All API endpoints built
- ✅ Step 8: Vendor UI complete (Stripe onboarding, orders dashboard)
- 🔨 Step 9: Buyer UI (THIS STEP)
- ⏳ Step 10-12: Testing, bug fixes, documentation

**What this step adds:**
- Browse bundles page (discover and view products)
- Cart drawer component (shopping cart)
- Checkout flow (Stripe payment)
- Buyer orders dashboard (track orders)

---

## Objective

Build buyer-facing UI components that allow buyers to:
1. Browse available bundles from all vendors
2. Add bundles to cart
3. Checkout and pay via Stripe
4. Track order status and pickup details

---

## Step 9 Tasks Overview

1. Create browse bundles page
2. Create bundle detail page
3. Create cart drawer component
4. Create checkout page
5. Create checkout success page
6. Create buyer orders dashboard
7. Add navigation links
8. Test buyer flow
9. Commit and push

---

## Task 9.1: Browse Bundles Page

### Create File: `src/app/[vertical]/browse/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, ShoppingCart, Package } from 'lucide-react';
import { useCart } from '@/lib/hooks/useCart';

interface Listing {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  quantity: number;
  image_url?: string;
  listing_type: string;
  vendor_profile: {
    id: string;
    business_name: string;
  };
}

export default function BrowsePage() {
  const params = useParams();
  const vertical = params.vertical as string;
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { addToCart } = useCart();

  useEffect(() => {
    fetchListings();
  }, [vertical]);

  async function fetchListings() {
    try {
      const response = await fetch(`/api/listings?vertical=${vertical}`);
      if (!response.ok) throw new Error('Failed to fetch listings');
      
      const data = await response.json();
      setListings(data.listings || []);
    } catch (err) {
      console.error('Failed to load listings:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredListings = listings.filter(listing =>
    listing.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    listing.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    listing.vendor_profile.business_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Browse Bundles</h1>
        <p className="text-muted-foreground">
          Discover great products from local vendors
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search bundles or vendors..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Listings Grid */}
      {filteredListings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm ? 'No bundles match your search' : 'No bundles available yet'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map(listing => (
            <ListingCard
              key={listing.id}
              listing={listing}
              vertical={vertical}
              onAddToCart={addToCart}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  vertical,
  onAddToCart,
}: {
  listing: Listing;
  vertical: string;
  onAddToCart: (listingId: string, quantity: number) => void;
}) {
  const [adding, setAdding] = useState(false);

  async function handleAddToCart() {
    setAdding(true);
    try {
      await onAddToCart(listing.id, 1);
      // Show success feedback (can add toast notification)
    } catch (err) {
      alert('Failed to add to cart');
    } finally {
      setAdding(false);
    }
  }

  const displayPrice = (listing.price_cents * 1.065) / 100; // Include 6.5% buyer fee

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-1">
              <Link 
                href={`/${vertical}/bundle/${listing.id}`}
                className="hover:underline"
              >
                {listing.title}
              </Link>
            </CardTitle>
            <CardDescription>{listing.vendor_profile.business_name}</CardDescription>
          </div>
          {listing.listing_type === 'flash' && (
            <Badge variant="destructive">Flash Sale</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {listing.description}
        </p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">${displayPrice.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              {listing.quantity} available
            </p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button
          onClick={handleAddToCart}
          disabled={adding || listing.quantity === 0}
          className="flex-1"
        >
          {adding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Cart
            </>
          )}
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/${vertical}/bundle/${listing.id}`}>
            View
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
```

---

## Task 9.2: Bundle Detail Page

### Create File: `src/app/[vertical]/bundle/[id]/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShoppingCart, ArrowLeft, MapPin } from 'lucide-react';
import { useCart } from '@/lib/hooks/useCart';

interface ListingDetail {
  id: string;
  title: string;
  description: string;
  price_cents: number;
  quantity: number;
  image_url?: string;
  listing_type: string;
  created_at: string;
  vendor_profile: {
    id: string;
    business_name: string;
    description?: string;
  };
}

export default function BundleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const listingId = params.id as string;
  const vertical = params.vertical as string;
  
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchListing();
  }, [listingId]);

  async function fetchListing() {
    try {
      const response = await fetch(`/api/listings/${listingId}`);
      if (!response.ok) throw new Error('Failed to fetch listing');
      
      const data = await response.json();
      setListing(data.listing);
    } catch (err) {
      console.error('Failed to load listing:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToCart() {
    if (!listing) return;
    
    setAdding(true);
    try {
      await addToCart(listing.id, quantity);
      router.push(`/${vertical}/browse`);
    } catch (err) {
      alert('Failed to add to cart');
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">Bundle not found</p>
            <Button onClick={() => router.back()} className="mt-4">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const displayPrice = (listing.price_cents * 1.065) / 100;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Browse
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{listing.title}</CardTitle>
              <CardDescription className="text-base">
                {listing.vendor_profile.business_name}
              </CardDescription>
            </div>
            {listing.listing_type === 'flash' && (
              <Badge variant="destructive">Flash Sale</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Description */}
          <div>
            <h3 className="font-semibold mb-2">Description</h3>
            <p className="text-muted-foreground">{listing.description}</p>
          </div>

          {/* Pricing */}
          <div className="border-t pt-6">
            <div className="flex items-baseline gap-2 mb-4">
              <p className="text-3xl font-bold">${displayPrice.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">per bundle</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {listing.quantity} bundles available
            </p>
          </div>

          {/* Quantity Selector */}
          <div className="border-t pt-6">
            <label className="block text-sm font-medium mb-2">
              Quantity
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                -
              </Button>
              <span className="w-12 text-center font-medium">{quantity}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setQuantity(Math.min(listing.quantity, quantity + 1))}
                disabled={quantity >= listing.quantity}
              >
                +
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Total: ${(displayPrice * quantity).toFixed(2)}
            </p>
          </div>

          {/* Vendor Info */}
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-2">Vendor</h3>
            <p className="text-sm text-muted-foreground">
              {listing.vendor_profile.description || listing.vendor_profile.business_name}
            </p>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleAddToCart}
            disabled={adding || listing.quantity === 0}
            size="lg"
            className="w-full"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Add to Cart
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
```

---

## Task 9.3: Cart Hook and Context

### Create File: `src/lib/hooks/useCart.tsx`

```typescript
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface CartItem {
  listingId: string;
  quantity: number;
  title?: string;
  price_cents?: number;
  vendor_name?: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (listingId: string, quantity: number) => Promise<void>;
  removeFromCart: (listingId: string) => void;
  updateQuantity: (listingId: string, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Load cart from localStorage on mount
  useEffect(() => {
    const savedCart = localStorage.getItem('cart');
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart));
      } catch (err) {
        console.error('Failed to load cart:', err);
      }
    }
  }, []);

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(items));
  }, [items]);

  async function addToCart(listingId: string, quantity: number) {
    try {
      const response = await fetch('/api/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, quantity }),
      });

      if (!response.ok) throw new Error('Failed to add to cart');

      const data = await response.json();

      setItems(prev => {
        const existing = prev.find(item => item.listingId === listingId);
        if (existing) {
          return prev.map(item =>
            item.listingId === listingId
              ? { ...item, quantity: item.quantity + quantity }
              : item
          );
        }
        return [...prev, {
          listingId,
          quantity,
          title: data.listing?.title,
          price_cents: data.listing?.price_cents,
          vendor_name: data.listing?.vendor_profile?.business_name,
        }];
      });
    } catch (err) {
      throw err;
    }
  }

  function removeFromCart(listingId: string) {
    setItems(prev => prev.filter(item => item.listingId !== listingId));
  }

  function updateQuantity(listingId: string, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(listingId);
      return;
    }
    setItems(prev =>
      prev.map(item =>
        item.listingId === listingId ? { ...item, quantity } : item
      )
    );
  }

  function clearCart() {
    setItems([]);
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
```

---

## Task 9.4: Cart Drawer Component

### Create File: `src/components/cart/CartDrawer.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { useCart } from '@/lib/hooks/useCart';

export function CartDrawer() {
  const router = useRouter();
  const params = useParams();
  const vertical = params?.vertical as string;
  const { items, removeFromCart, updateQuantity, itemCount } = useCart();
  const [open, setOpen] = useState(false);

  const subtotal = items.reduce((sum, item) => {
    return sum + ((item.price_cents || 0) * item.quantity);
  }, 0);

  const displayTotal = (subtotal * 1.065) / 100; // Include 6.5% buyer fee

  function handleCheckout() {
    setOpen(false);
    router.push(`/${vertical}/checkout`);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <ShoppingCart className="h-4 w-4" />
          {itemCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {itemCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Shopping Cart</SheetTitle>
          <SheetDescription>
            {itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart
          </SheetDescription>
        </SheetHeader>

        <div className="mt-8 space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Your cart is empty</p>
            </div>
          ) : (
            <>
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {items.map(item => (
                  <CartItem
                    key={item.listingId}
                    item={item}
                    onRemove={removeFromCart}
                    onUpdateQuantity={updateQuantity}
                  />
                ))}
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${(subtotal / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform Fee (6.5%)</span>
                  <span>${((displayTotal * 100 - subtotal) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>${displayTotal.toFixed(2)}</span>
                </div>
              </div>

              <Button 
                onClick={handleCheckout}
                size="lg" 
                className="w-full"
              >
                Proceed to Checkout
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CartItem({
  item,
  onRemove,
  onUpdateQuantity,
}: {
  item: any;
  onRemove: (listingId: string) => void;
  onUpdateQuantity: (listingId: string, quantity: number) => void;
}) {
  const displayPrice = ((item.price_cents || 0) * 1.065) / 100;
  const itemTotal = displayPrice * item.quantity;

  return (
    <div className="flex gap-4 p-4 border rounded-lg">
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{item.title}</h4>
        <p className="text-sm text-muted-foreground truncate">{item.vendor_name}</p>
        <p className="text-sm font-medium mt-1">${displayPrice.toFixed(2)} each</p>
      </div>
      
      <div className="flex flex-col items-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(item.listingId)}
          className="h-8 w-8 p-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUpdateQuantity(item.listingId, item.quantity - 1)}
            className="h-7 w-7 p-0"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-8 text-center text-sm">{item.quantity}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUpdateQuantity(item.listingId, item.quantity + 1)}
            className="h-7 w-7 p-0"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        
        <p className="text-sm font-bold">${itemTotal.toFixed(2)}</p>
      </div>
    </div>
  );
}
```

---

## Task 9.5: Add CartProvider to Layout

### Update File: `src/app/layout.tsx`

```typescript
import { CartProvider } from '@/lib/hooks/useCart';

// Wrap children with CartProvider

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CartProvider>
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
```

---

## Task 9.6: Add Cart to Navigation

### Update File: Navigation component (wherever cart icon should appear)

```typescript
import { CartDrawer } from '@/components/cart/CartDrawer';

// Add CartDrawer component to navigation
<CartDrawer />
```

---

## Task 9.7: Checkout Page

### Create File: `src/app/[vertical]/checkout/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, ShoppingCart } from 'lucide-react';
import { useCart } from '@/lib/hooks/useCart';

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const vertical = params.vertical as string;
  const { items, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) {
      router.push(`/${vertical}/browse`);
    }
  }, [items, router, vertical]);

  async function handleCheckout() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({
            listingId: item.listingId,
            quantity: item.quantity,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Checkout failed');
      }

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create checkout session');
      setLoading(false);
    }
  }

  const subtotal = items.reduce((sum, item) => {
    return sum + ((item.price_cents || 0) * item.quantity);
  }, 0);

  const displayTotal = (subtotal * 1.065) / 100;

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Checkout</h1>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
            <CardDescription>Review your items before checkout</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map(item => (
              <div key={item.listingId} className="flex justify-between py-2 border-b last:border-0">
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">{item.vendor_name}</p>
                  <p className="text-sm">Qty: {item.quantity}</p>
                </div>
                <p className="font-medium">
                  ${(((item.price_cents || 0) * item.quantity * 1.065) / 100).toFixed(2)}
                </p>
              </div>
            ))}

            <div className="space-y-2 pt-4 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${(subtotal / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Platform Fee</span>
                <span>${((displayTotal * 100 - subtotal) / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t">
                <span>Total</span>
                <span>${displayTotal.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleCheckout}
          disabled={loading}
          size="lg"
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Proceed to Payment'
          )}
        </Button>

        <p className="text-sm text-center text-muted-foreground">
          You'll be redirected to Stripe to complete your payment securely
        </p>
      </div>
    </div>
  );
}
```

---

## Task 9.8: Checkout Success Page

### Create File: `src/app/[vertical]/checkout/success/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useCart } from '@/lib/hooks/useCart';

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const vertical = params.vertical as string;
  const { clearCart } = useCart();
  
  const [verifying, setVerifying] = useState(true);
  const [orderId, setOrderId] = useState<string | null>(null);
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (sessionId) {
      verifyPayment();
    }
  }, [sessionId]);

  async function verifyPayment() {
    try {
      const response = await fetch(`/api/checkout/success?session_id=${sessionId}`);
      
      if (response.ok) {
        const data = await response.json();
        setOrderId(data.orderId);
        clearCart();
      }
    } catch (err) {
      console.error('Failed to verify payment:', err);
    } finally {
      setVerifying(false);
    }
  }

  if (verifying) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <CardTitle>Order Confirmed!</CardTitle>
          </div>
          <CardDescription>
            Your payment was successful
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-muted-foreground mb-4">
              Thank you for your order! You'll receive a confirmation email shortly.
            </p>
            {orderId && (
              <p className="text-sm text-muted-foreground">
                Order ID: {orderId}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Next Steps:</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Vendors will confirm your order</li>
              <li>You'll be notified when your order is ready for pickup</li>
              <li>Pick up your items at the market</li>
            </ol>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={() => router.push(`/${vertical}/buyer/orders`)}
              className="flex-1"
            >
              View Orders
            </Button>
            <Button 
              onClick={() => router.push(`/${vertical}/browse`)}
              variant="outline"
              className="flex-1"
            >
              Continue Shopping
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Task 9.9: Buyer Orders Dashboard

### Create File: `src/app/[vertical]/buyer/orders/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  Package, 
  AlertCircle,
  ShoppingBag,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  created_at: string;
  order_items: Array<{
    id: string;
    quantity: number;
    status: string;
    listing: {
      title: string;
      description: string;
    };
    vendor: {
      business_name: string;
    };
  }>;
}

export default function BuyerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    fetchOrders();
  }, []);

  async function fetchOrders() {
    try {
      const response = await fetch('/api/buyer/orders');
      if (!response.ok) throw new Error('Failed to fetch orders');
      
      const data = await response.json();
      setOrders(data.orders || []);
      setError(null);
    } catch (err) {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true;
    return order.status === activeTab;
  });

  const activeCount = orders.filter(o => 
    ['pending', 'paid', 'confirmed', 'ready'].includes(o.status)
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">My Orders</h1>
        <p className="text-muted-foreground">
          Track your orders and pickup details
        </p>
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
          <TabsTrigger value="active">
            Active {activeCount > 0 && `(${activeCount})`}
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-6">
          {filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4" />
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
              <OrderCard key={order.id} order={order} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              Order #{order.order_number}
            </CardTitle>
            <CardDescription>
              {new Date(order.created_at).toLocaleDateString()} at{' '}
              {new Date(order.created_at).toLocaleTimeString()}
            </CardDescription>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {order.order_items.map(item => (
          <div key={item.id} className="border-b last:border-0 pb-3 last:pb-0">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <p className="font-medium">{item.listing.title}</p>
                <p className="text-sm text-muted-foreground">{item.vendor.business_name}</p>
                <p className="text-sm">Qty: {item.quantity}</p>
              </div>
              <ItemStatusBadge status={item.status} />
            </div>
          </div>
        ))}

        <div className="flex justify-between items-center pt-4 border-t">
          <span className="font-semibold">Total Paid</span>
          <span className="text-lg font-bold">
            ${(order.total_cents / 100).toFixed(2)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig = {
    pending: { label: 'Pending Payment', color: 'bg-yellow-100 text-yellow-800' },
    paid: { label: 'Paid', color: 'bg-blue-100 text-blue-800' },
    confirmed: { label: 'Confirmed', color: 'bg-green-100 text-green-800' },
    ready: { label: 'Ready for Pickup', color: 'bg-purple-100 text-purple-800' },
    completed: { label: 'Completed', color: 'bg-gray-100 text-gray-800' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <Badge variant="secondary" className={config.color}>
      {config.label}
    </Badge>
  );
}

function ItemStatusBadge({ status }: { status: string }) {
  const icons = {
    pending: Clock,
    confirmed: CheckCircle2,
    ready: Package,
    fulfilled: CheckCircle2,
  };

  const Icon = icons[status as keyof typeof icons] || Clock;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      <span className="capitalize">{status}</span>
    </div>
  );
}
```

---

## Task 9.10: Add Navigation Links

### Update main navigation to include buyer links:

```typescript
// In your navigation component, add:
<Link href={`/${vertical}/browse`}>Browse</Link>
<Link href={`/${vertical}/buyer/orders`}>My Orders</Link>
<CartDrawer />
```

---

## Task 9.11: Add Missing API Endpoint

### Create File: `src/app/api/listings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const vertical = request.nextUrl.searchParams.get('vertical');

  if (!vertical) {
    return NextResponse.json({ error: 'Vertical required' }, { status: 400 });
  }

  try {
    const { data: listings, error } = await supabase
      .from('listings')
      .select(`
        *,
        vendor_profile:vendor_profiles(
          id,
          business_name
        )
      `)
      .eq('vertical_id', vertical)
      .eq('is_active', true)
      .gt('quantity', 0)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ listings });
  } catch (error) {
    console.error('Failed to fetch listings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listings' },
      { status: 500 }
    );
  }
}
```

### Create File: `src/app/api/listings/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const listingId = params.id;

  try {
    const { data: listing, error } = await supabase
      .from('listings')
      .select(`
        *,
        vendor_profile:vendor_profiles(
          id,
          business_name,
          description
        )
      `)
      .eq('id', listingId)
      .single();

    if (error) throw error;

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
    }

    return NextResponse.json({ listing });
  } catch (error) {
    console.error('Failed to fetch listing:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listing' },
      { status: 500 }
    );
  }
}
```

---

## Task 9.12: Install Missing UI Component

```bash
npx shadcn-ui@latest add sheet
```

---

## Task 9.13: Commit All Buyer UI

```bash
git add src/app/[vertical]/browse/
git add src/app/[vertical]/bundle/
git add src/app/[vertical]/checkout/
git add src/app/[vertical]/buyer/orders/
git add src/components/cart/
git add src/lib/hooks/useCart.tsx
git add src/app/api/listings/
git add src/app/layout.tsx
git commit -m "Phase 3 Step 9: Add buyer UI components

- Browse bundles page with search
- Bundle detail page with quantity selector
- Cart drawer component with add/remove/update
- Cart context and localStorage persistence
- Checkout page with Stripe redirect
- Checkout success page
- Buyer orders dashboard with status tracking
- Listings API endpoints (list and get by ID)
- Navigation updates with cart icon"

git push origin main
```

---

## Testing Checklist

### Test 1: Browse and View
- [ ] Go to `/{vertical}/browse`
- [ ] See all available bundles
- [ ] Search for specific bundles
- [ ] Click bundle → redirects to detail page
- [ ] See bundle details (title, description, price, quantity)

### Test 2: Add to Cart
- [ ] Click "Add to Cart" on browse page
- [ ] Cart icon shows badge with count
- [ ] Click cart icon → drawer opens
- [ ] See item in cart
- [ ] Update quantity using +/- buttons
- [ ] Remove item using trash icon
- [ ] Add multiple different bundles
- [ ] Cart shows correct total

### Test 3: Checkout Flow
- [ ] Click "Proceed to Checkout" in cart
- [ ] Redirects to `/checkout`
- [ ] See order summary with all items
- [ ] See subtotal, platform fee, and total
- [ ] Click "Proceed to Payment"
- [ ] Redirects to Stripe Checkout
- [ ] Enter test card: 4242 4242 4242 4242
- [ ] Complete payment
- [ ] Redirects to success page
- [ ] See order confirmation

### Test 4: Orders Dashboard
- [ ] Go to `/{vertical}/buyer/orders`
- [ ] See completed order
- [ ] Order shows correct items
- [ ] Order shows correct total
- [ ] Order shows status (paid)
- [ ] Tab filtering works

### Test 5: End-to-End Flow
- [ ] Browse → Add to cart → Checkout → Pay → Success
- [ ] Vendor sees order in their dashboard
- [ ] Vendor confirms order
- [ ] Buyer sees status update to "Confirmed"
- [ ] Vendor marks ready
- [ ] Buyer sees status update to "Ready for Pickup"
- [ ] Vendor marks fulfilled
- [ ] Buyer sees status update to "Completed"

---

## Common Issues & Solutions

### Issue 1: Cart not persisting
**Solution:** Check localStorage in browser DevTools. Verify CartProvider is in layout.

### Issue 2: Listings not showing
**Solution:** 
1. Verify listings exist in database with `is_active = true` and `quantity > 0`
2. Check vertical_id matches
3. Check RLS policies

### Issue 3: Checkout redirect fails
**Solution:**
1. Verify Stripe keys in environment variables
2. Check checkout session API response
3. Verify return URLs are correct

### Issue 4: Order not showing in buyer dashboard
**Solution:**
1. Check order was created successfully
2. Verify RLS policies allow buyer to see their orders
3. Check buyer_user_id matches authenticated user

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

**After Step 9 is complete:**
- Test complete end-to-end flow (buyer + vendor)
- Proceed to Step 10 (comprehensive testing)
- Fix any bugs found during testing
- Document Phase 3 as complete

---

*End of Step 9 Build Instructions*
