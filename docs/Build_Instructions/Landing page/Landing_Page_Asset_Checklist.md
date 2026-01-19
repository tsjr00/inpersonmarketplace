# Landing Page Asset Requirements Checklist

**For:** Tracy
**Purpose:** Gather/prepare all images and assets before CC implements landing page

---

## 📸 IMAGE ASSETS NEEDED

### 1. Hero Section Image
**Priority:** CRITICAL
**Filename:** `hero-image.jpg` (and `hero-image.webp`)
**Dimensions:** 
- Desktop: 1920x800px
- Mobile: 800x600px (optional crop)
**Subject:** Vibrant farmers market scene
**Requirements:**
- [ ] Shows fresh produce, baked goods, or market atmosphere
- [ ] People browsing (optional but ideal)
- [ ] Bright, welcoming, colorful
- [ ] High resolution (min 1920px wide)
- [ ] Rights cleared for commercial use

**Suggested Sources:**
- Your own market photos
- Unsplash: https://unsplash.com/s/photos/farmers-market
- Pexels: https://www.pexels.com/search/farmers%20market/
- Stock photo purchase (iStock, Shutterstock)

**Where to Save:** `public/images/landing/hero-image.jpg`

---

### 2. Vendor Section Image
**Priority:** HIGH
**Filename:** `vendor-image.jpg` (and `vendor-image.webp`)
**Dimensions:** 800x600px
**Subject:** Vendor at their market stall
**Requirements:**
- [ ] Shows vendor working with their products
- [ ] Authentic, not overly staged
- [ ] Warm, approachable feeling
- [ ] Clear focus on vendor (not just produce)
- [ ] Rights cleared for commercial use

**Suggested Framing:**
- Vendor arranging fresh vegetables
- Vendor helping a customer
- Vendor preparing/packaging products
- Close-up of vendor's hands with produce

**Where to Save:** `public/images/landing/vendor-image.jpg`

---

### 3. Market Photos (3 minimum)
**Priority:** MEDIUM
**Filenames:** 
- `market-1.jpg`
- `market-2.jpg`
- `market-3.jpg`
**Dimensions:** 400x300px each
**Subject:** Individual market scenes or stalls
**Requirements:**
- [ ] Different markets/locations if possible
- [ ] Show variety (produce stand, baked goods, flowers)
- [ ] Bright, appealing, inviting
- [ ] Can be pulled from actual markets in your system

**Alternative:** System can pull photos from actual markets table if markets have photos uploaded

**Where to Save:** `public/images/landing/markets/`

---

### 4. Placeholder/Default Images
**Priority:** LOW (can use generic placeholders)
**Files Needed:**
- `market-placeholder.jpg` - Generic market photo (400x300px)
- `vendor-placeholder.jpg` - Generic vendor photo (200x200px)

**Where to Save:** `public/images/landing/`

---

## 👤 TESTIMONIAL ASSETS (Optional)

### Testimonial Photos/Avatars
**Priority:** LOW (can use initials instead)
**Filenames:** 
- `testimonial-1.jpg`
- `testimonial-2.jpg`
- `testimonial-3.jpg`
**Dimensions:** 96x96px (will be displayed as circles)
**Requirements:**
- [ ] Headshots of actual customers/vendors (if available)
- [ ] Clear, well-lit photos
- [ ] Smiling/friendly expressions
- [ ] Permission obtained for use

**Alternative:** System will show initials in colored circles if no photos

**Where to Save:** `public/images/landing/testimonials/`

---

## 🎨 LOGO & BRANDING

### Logo Variants Needed
**Priority:** CRITICAL

1. **Primary Logo** (already exists)
   - Location: Verify at `public/images/logo.png`
   - Used in: Navigation

2. **White Logo** (for dark backgrounds)
   - Filename: `logo-white.png` or `logo-white.svg`
   - Used in: Footer
   - Background: Transparent
   - **[ ] Check if this exists, create if needed**

3. **Favicon** (already exists)
   - Verify at `public/favicon.ico`

---

## 🔗 SOCIAL MEDIA

### Social Media Links
**Priority:** MEDIUM

Update these when ready:
- [ ] Facebook page URL: ________________
- [ ] Instagram handle: ________________
- [ ] Twitter/X handle: ________________

**Icons:** Using standard icons from lucide-react (no custom assets needed)

---

## 📄 LEGAL PAGES

### Required Before Launch
**Priority:** HIGH

Ensure these pages exist:
- [ ] Privacy Policy (`/privacy-policy`)
- [ ] Terms of Service (`/terms`)
- [ ] Cookie Policy (optional, `/cookies`)
- [ ] About Us page (optional but recommended)
- [ ] Contact page (optional but recommended)

---

## 📝 CONTENT TO PREPARE

### Real Testimonials
**Priority:** MEDIUM

Replace placeholder testimonials with real ones:

**Current Placeholders:**
1. "I love being able to pre-order..." - Sarah M., Regular Shopper
2. "This platform has tripled my sales..." - Mike T., Farm Vendor  
3. "Supporting local farmers has never been easier..." - Jennifer L., Home Chef

**To Gather:**
- [ ] 2-3 buyer testimonials (with permission)
- [ ] 1-2 vendor testimonials (with permission)
- [ ] Names and roles
- [ ] Optional: Photos (see testimonial assets above)

**Format:** 1-2 sentences, authentic, specific details

---

### Statistics (Auto-Generated)

These pull from database automatically:
- ✅ Number of products (from listings table)
- ✅ Number of shoppers (from user_profiles)
- ✅ Number of markets (from markets table)

**No action needed** - System counts these dynamically

---

## 🎯 OPTIONAL ENHANCEMENTS

### Nice to Have (Not Required for Launch)

1. **Promotional Banner Image**
   - Seasonal graphics (summer, fall, etc.)
   - "New Market" announcements
   - Size: 1200x200px

2. **Vendor Success Story Photos**
   - Featured vendor stories
   - Before/after photos
   - Business growth examples

3. **Product Photography**
   - Example listings to showcase
   - Variety of categories
   - Professional quality

4. **Video Content** (Future Phase)
   - Hero section background video
   - Vendor testimonial videos
   - How-it-works explainer

---

## 📦 ASSET ORGANIZATION

### Recommended Folder Structure

```
public/images/landing/
├── hero-image.jpg
├── hero-image.webp
├── vendor-image.jpg
├── vendor-image.webp
├── market-placeholder.jpg
├── logo-white.png
├── markets/
│   ├── market-1.jpg
│   ├── market-2.jpg
│   └── market-3.jpg
└── testimonials/
    ├── testimonial-1.jpg
    ├── testimonial-2.jpg
    └── testimonial-3.jpg
```

---

## ✅ ASSET PREPARATION CHECKLIST

### Before Giving to CC:

**Images:**
- [ ] Hero image ready (1920x800px)
- [ ] Vendor section image ready (800x600px)
- [ ] 3 market photos ready (400x300px each) OR confirm using database photos
- [ ] White logo created (if needed)
- [ ] All images optimized (compressed, <500kb each)
- [ ] All images converted to WebP (with JPG fallback)

**Content:**
- [ ] Real testimonials gathered (or confirm using placeholders for now)
- [ ] Social media links ready (or confirm leaving empty for now)
- [ ] Legal pages created (or scheduled for creation)

**Rights & Permissions:**
- [ ] All images have proper usage rights
- [ ] All testimonials have written permission
- [ ] Photo credits documented (if required)

---

## 🛠️ TOOLS FOR ASSET PREPARATION

### Image Optimization
- **Resize:** https://squoosh.app (free, in-browser)
- **Compress:** TinyPNG (https://tinypng.com)
- **WebP Conversion:** Squoosh or CloudConvert
- **Bulk Processing:** ImageOptim (Mac) or FileOptimizer (Windows)

### Image Sources
- **Free:** Unsplash, Pexels, Pixabay
- **Paid:** Shutterstock, iStock, Adobe Stock
- **Local:** Your own photos from markets

### Image Editing
- **Simple Crops:** Preview (Mac), Photos (Windows)
- **Advanced:** Photoshop, GIMP (free), Canva

---

## 📧 DELIVERY TO CC

When assets are ready, organize them like this:

```
/landing-page-assets/
├── README.txt (notes about images, credits, etc.)
├── hero-image.jpg
├── vendor-image.jpg
├── logo-white.png
└── markets/
    ├── market-1.jpg
    ├── market-2.jpg
    └── market-3.jpg
```

**Email to CC or place in shared folder with instructions:**
"Assets ready for landing page implementation. See attached folder. Using [placeholders / real testimonials]. Social links [ready / TBD]."

---

## 🚀 PRIORITY LEVELS EXPLAINED

**CRITICAL:** Must have before launch
- Hero image
- Logo variants
- Legal pages

**HIGH:** Should have for best experience
- Vendor section image
- Testimonials (can use placeholders short-term)

**MEDIUM:** Nice to have, improves quality
- Market photos (can pull from database)
- Social media links (can add later)

**LOW:** Optional enhancements
- Testimonial photos (can use initials)
- Placeholder images (system generates)

---

## 💡 TIPS FOR SELECTING IMAGES

1. **Authenticity > Polish:** Real market photos often work better than stock photos
2. **Diversity:** Show variety of vendors, products, people
3. **Emotion:** Images with people connecting/smiling perform better
4. **Lighting:** Bright, natural light is best
5. **Focus:** Clear subject, not too busy
6. **Orientation:** Landscape (horizontal) for hero/vendor sections

---

## ❓ QUESTIONS BEFORE YOU START

1. **Do you have existing photos from your markets?**
   - If yes, start there (most authentic)
   - If no, use Unsplash/Pexels

2. **Do you have real testimonials from users?**
   - If yes, use them (most credible)
   - If no, placeholders are fine for soft launch

3. **Is your logo in white/light version?**
   - Check `public/images/` folder
   - If not, you can create in Canva or have designer make it

4. **Are legal pages ready?**
   - If not, schedule this separately from landing page

---

## 📞 NEED HELP?

If you need help with:
- Finding/selecting images → Ask me for specific recommendations
- Optimizing images → Use Squoosh (easiest)
- Creating white logo → Use Canva (free)
- Writing testimonials → Ask for templates

---

**Once you've gathered these assets, you're ready for CC to implement the landing page!**
