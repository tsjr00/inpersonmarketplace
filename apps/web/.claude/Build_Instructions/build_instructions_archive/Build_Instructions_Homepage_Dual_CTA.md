# Build Instructions - Homepage Dual-Path CTAs

**Date:** January 6, 2026  
**Priority:** Medium - UX improvement  
**Time:** ~30 minutes

---

## Objective

Update homepage to clearly separate buyer and vendor paths with distinct CTAs.

---

## Changes Required

### File: `src/app/page.tsx`

### Change 1: Hero Section - Two Buttons

Find the hero section buttons and replace with:

```typescript
<div style={{ 
  display: 'flex', 
  gap: 20, 
  justifyContent: 'center',
  flexWrap: 'wrap'
}}>
  <a
    href="#marketplaces"
    style={{
      padding: '18px 40px',
      backgroundColor: '#0070f3',
      color: 'white',
      textDecoration: 'none',
      borderRadius: 8,
      fontWeight: 600,
      fontSize: 18
    }}
  >
    Start Shopping
  </a>
  <a
    href="#marketplaces"
    style={{
      padding: '18px 40px',
      backgroundColor: 'transparent',
      color: '#0070f3',
      border: '2px solid #0070f3',
      textDecoration: 'none',
      borderRadius: 8,
      fontWeight: 600,
      fontSize: 18
    }}
  >
    Start Selling
  </a>
</div>
```

### Change 2: Marketplace Cards - Dual CTAs

In the marketplace cards section, update each card's buttons:

```typescript
{/* CTA Buttons - Replace existing */}
<div style={{ display: 'flex', gap: 10 }}>
  <Link
    href={`/${vertical.vertical_id}/browse`}
    style={{
      flex: 1,
      padding: '12px 20px',
      backgroundColor: vertical.branding.colors.primary,
      color: 'white',
      textDecoration: 'none',
      borderRadius: 6,
      fontWeight: 600,
      fontSize: 15,
      textAlign: 'center'
    }}
  >
    Shop Now
  </Link>

  <Link
    href={`/${vertical.vertical_id}/vendor-signup`}
    style={{
      flex: 1,
      padding: '12px 20px',
      backgroundColor: 'transparent',
      color: vertical.branding.colors.primary,
      border: `2px solid ${vertical.branding.colors.primary}`,
      textDecoration: 'none',
      borderRadius: 6,
      fontWeight: 600,
      fontSize: 15,
      textAlign: 'center'
    }}
  >
    Sell Here
  </Link>
</div>
```

### Change 3: Bottom CTA Section - Dual Buttons

Update the blue CTA section at bottom:

```typescript
<div style={{ 
  display: 'flex', 
  gap: 15, 
  justifyContent: 'center',
  flexWrap: 'wrap'
}}>
  <a
    href="#marketplaces"
    style={{
      padding: '18px 40px',
      backgroundColor: 'white',
      color: '#0070f3',
      textDecoration: 'none',
      borderRadius: 8,
      fontWeight: 600,
      fontSize: 18
    }}
  >
    Browse Marketplaces
  </a>
  <a
    href="#marketplaces"
    style={{
      padding: '18px 40px',
      backgroundColor: 'transparent',
      color: 'white',
      border: '2px solid white',
      textDecoration: 'none',
      borderRadius: 8,
      fontWeight: 600,
      fontSize: 18
    }}
  >
    Become a Vendor
  </a>
</div>
```

---

## Summary of Button Labels

| Location | Buyer Path | Vendor Path |
|----------|------------|-------------|
| Hero | Start Shopping | Start Selling |
| Marketplace Cards | Shop Now | Sell Here |
| Bottom CTA | Browse Marketplaces | Become a Vendor |

---

## Testing

- [ ] Hero shows two distinct buttons
- [ ] Both hero buttons scroll to marketplace section
- [ ] Each marketplace card has "Shop Now" and "Sell Here"
- [ ] "Shop Now" goes to /[vertical]/browse
- [ ] "Sell Here" goes to /[vertical]/vendor-signup
- [ ] Bottom CTA section has two buttons
- [ ] Styling looks balanced (buttons same size)
