# Image Optimization

**Loaded only when working on image upload or display.** Two separate concerns — don't confuse them.

---

## Upload Compression (saves storage)

- Use `src/lib/utils/image-resize.ts` in upload components
- Settings: 1200px max dimension, 80% JPEG quality
- Result: 1-2MB → 300-600KB
- Already implemented in: `ListingImageUpload`, `MarketBoxImageUpload`

## Display Optimization (saves bandwidth)

- Use `next/image` component, NOT raw `<img>` tags
- Provides: lazy loading, responsive sizing, WebP conversion
- Required on: browse pages, listing cards, market-box cards

```tsx
import Image from 'next/image'

<Image
  src={imageUrl}
  alt={description}
  width={280}
  height={200}
  loading="lazy"
/>
```
