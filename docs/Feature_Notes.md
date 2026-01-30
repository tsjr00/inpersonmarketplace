# Feature Notes & Future Enhancements

This document tracks feature ideas and implementation notes for future reference.

---

## Flash Sales + POS Integration

**Date:** 2026-01-30
**Context:** When implementing Flash Sales, also explore adding POS (Point of Sale) functionality

### POS Options to Explore:

1. **QR/Link-Based Quick Sales** (Simplest, no hardware)
   - Vendor enters amount on dashboard
   - System generates QR code or payment link
   - Customer scans → Stripe Checkout
   - Zero hardware cost, works immediately

2. **Stripe Terminal** (Physical card reader)
   - Bluetooth readers ($59-$249)
   - Professional tap/dip/swipe experience
   - Best for high-volume vendors

3. **Tap to Pay on Phone** (Newest)
   - iPhone/Android as contactless reader
   - No extra hardware needed
   - Requires newer phones

### Recommended Starting Point:
Begin with QR-based Quick Sales - adds value immediately without hardware complexity. Can tier as premium vendor feature.

### How it fits with Flash Sales:
- Flash Sales = time-limited online deals
- POS = immediate walk-up transactions at market
- Both serve the "market day" vendor experience
- Could share UI patterns (quick entry, real-time confirmation)

---
