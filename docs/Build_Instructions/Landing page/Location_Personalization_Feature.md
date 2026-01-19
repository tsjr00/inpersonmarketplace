# Location Personalization Feature

**For:** CC (Claude Code)
**Priority:** Medium
**Goal:** Show users their local area name to increase personalization

---

## 🎯 FEATURE OVERVIEW

**Current state:**
Landing page hero shows "4 markets, 50+ products" (already dynamic based on user location)

**Enhancement:**
Add text below this showing the user's local area name

---

## 📍 LOCATION TEXT FORMAT

### Priority Order (use first available):
1. City name (if user is in/near a city)
2. Nearest city name (if user is rural but near a city)
3. County name (if truly rural, no nearby cities)

### Display Format:
"in the [Location] area"

### Examples:
- User in Amarillo → "in the Amarillo area"
- User in Dallas → "in the Dallas area"
- User in Arlington → "in the Arlington area"
- User in North Richland Hills → "in the North Richland Hills area"
- User in rural area near no cities → "in the Ogletree County area"

---

## 🎨 IMPLEMENTATION OPTIONS

### Option A: Hero Section (Preferred if fast)

**Location:** Directly below "4 markets, 50+ products" text

**Layout:**
```
4 markets, 50+ products
in the Amarillo area
```

**Requirements:**
- Must not slow page load
- Must be instant or nearly instant
- Use browser/phone location data already being used

**If this adds noticeable delay (>0.5 seconds), use Option B instead**

---

### Option B: Trust Bar Section (Fallback)

**Location:** In the tan shaded area below hero

**Current text:** "Supporting local producers and artisans in your community"

**Enhanced text:** "Supporting local producers and artisans in the Amarillo area"
**Or:** "Supporting local producers and artisans in your community - in the Amarillo area"

**Why here:**
- Lower on page = user is reading hero section while location populates
- No perceived delay
- Still early enough to show personalization

---

## 🔧 TECHNICAL APPROACH

### Use Existing Location Data
The page already uses browser/phone location to filter markets and products. Reuse this same data.

### Suggested Implementation:
1. Get user coordinates (already happening)
2. Reverse geocode to get city/county (new step)
3. Display location text

### Reverse Geocoding Options:
- **Nominatim (OpenStreetMap)** - Free, no API key needed
- **Google Maps Geocoding API** - Requires API key, costs money
- **Browser Geolocation API** - Already getting coordinates

**Recommendation:** Use Nominatim for reverse geocoding since it's free and we're already using location data

---

## 📊 LOCATION PRIORITY LOGIC

```javascript
// Pseudocode for location text selection

if (city_name exists) {
  return `in the ${city_name} area`;
} 
else if (nearest_city_name && distance < 25_miles) {
  return `in the ${nearest_city_name} area`;
} 
else if (county_name exists) {
  return `in the ${county_name} County area`;
}
else {
  return ""; // Don't show if no location data
}
```

---

## ⚡ PERFORMANCE REQUIREMENTS

**Goal:** No perceived delay

**Test scenarios:**
1. User with location enabled → Should appear within 1 second
2. User with location disabled → Gracefully hide, don't show blank space
3. User with location pending → Show after permission granted

**Fallback:** If location takes >0.5 seconds in hero, move to Option B (Trust Bar)

---

## 🎯 USER VALUE

**Why this matters:**
- Users immediately see it's customized for their area
- Increases trust and relevance
- Shows platform knows their local context
- Makes "local" claim tangible and specific

**Tracy's insight:** "Users would know right from the start that it's customized and focused on their area"

---

## ✅ IMPLEMENTATION CHECKLIST

- [ ] Add reverse geocoding (Nominatim or similar)
- [ ] Get city/county name from coordinates
- [ ] Apply priority logic (city → nearest city → county)
- [ ] Test page load performance
- [ ] **Decision:** Hero (Option A) or Trust Bar (Option B)?
- [ ] Display location text in chosen location
- [ ] Handle location permission denied gracefully
- [ ] Handle no location data gracefully (hide text)
- [ ] Test on multiple locations (city, suburb, rural)
- [ ] Verify no perceived delay

---

## 🧪 TEST CASES

**Test with these scenarios:**

1. **Urban user (Amarillo)**
   - Should show: "in the Amarillo area"
   
2. **Suburban user (Arlington, TX)**
   - Should show: "in the Arlington area"
   
3. **Rural user near city**
   - Should show nearest city if within ~25 miles
   - Example: "in the Lubbock area"
   
4. **Very rural user**
   - Should show: "in the [County Name] County area"
   
5. **Location disabled**
   - Should hide location text gracefully
   - Don't show blank space

---

## 💡 SUGGESTED CODE LOCATION

**Files to modify:**
- `/app/[vertical]/page.tsx` (landing page)
- Create utility: `/lib/location/reverseGeocode.ts`
- Consider caching location result in session storage

**Component structure:**
```tsx
<LocationText 
  coordinates={userCoordinates}
  fallbackLocation="Trust Bar" // if slow
/>
```

---

## 📝 NOTES

- Reuse existing location permission flow
- Don't request location twice
- Cache result to avoid repeated API calls
- Consider showing during repeat visits without re-checking
- Graceful degradation if geolocation fails

---

**Decision needed from CC:** After testing, which option (A or B) based on performance?
