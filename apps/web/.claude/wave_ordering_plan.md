# Wave-Based Event Ordering — Implementation Plan
**Created:** 2026-04-03 (Session 67)
**Status:** Approved — awaiting implementation
**Focus:** Company-paid FT events (MVP)

---

## Decisions (User-Confirmed)

| Decision | Answer |
|----------|--------|
| Wave duration | 30 minutes, fixed for now |
| Items per attendee | 1 item, enforced |
| Organizer payment | MVP: admin manually records payment |
| Walk-ups | Yes — fill available wave spots in order (wave 1 → 2 → 3 etc.) |
| Cart API | NOT modified — company-paid bypasses cart entirely |
| Wave capacity rollover | NO — waves are independent. Unused wave 1 slots don't roll to wave 2. Keeps lines predictable. |
| Cancellation by attendee | DEFERRED — decide later. Can attendees cancel wave+item selection? (Deep dive Gap 3) |

### Deep Dive Cross-Reference (`.claude/event_system_deep_dive.md`)

The deep dive specifies **two-level decrement** that the MVP defers:

1. **Wave slot decrement** (MVP) — When attendee reserves wave, total capacity decreases. ✅ In plan.
2. **Per-item-per-wave decrement** (Phase 2) — Each vendor sets per-item quantity per wave (e.g., "25 tacos per wave"). Items sell out independently per wave. ❌ Deferred — MVP uses vendor-level capacity only.

**Why deferred:** Per-item-per-wave tracking needs a `event_wave_item_capacity` table and vendor UI to set quantities per item per wave. For MVP, if a vendor's wave capacity is 25 orders, any of their items can fill those 25 slots. Phase 2 adds item-level granularity.

**Other deep dive items already in plan:**
- ✅ Pick-ticket format: `{EventName}-{Wave}-{Sequence}`
- ✅ Walk-ups fill next available wave
- ✅ Menu only shows after wave selected ("Select your time slot first")
- ✅ Vendor prep sheet (Phase 2 nice-to-have but data available from MVP)
- ✅ Vendors prep 10% over estimate for walk-ups (operational guidance, not code)

**Deep dive items NOT in MVP scope:**
- ❌ Organizer group assignment ("Marketing team gets wave 1") — Phase 2+
- ❌ Per-item-per-wave inventory — Phase 2
- ❌ Setup map upload from organizer — Phase 2+
- ❌ Event Capacity Planner intelligence for admin — Phase 2+
- ❌ Hybrid payment model (company covers base, employee pays upgrade) — Phase 2+

---

## Database Changes

### New Table: `event_waves`
```sql
CREATE TABLE event_waves (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id       UUID NOT NULL REFERENCES markets(id),
  wave_number     INTEGER NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  capacity        INTEGER NOT NULL,
  reserved_count  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'open',  -- open, full, closed
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(market_id, wave_number),
  CHECK(reserved_count <= capacity),
  CHECK(wave_number > 0)
);
```

### New Table: `event_wave_reservations`
```sql
CREATE TABLE event_wave_reservations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id         UUID NOT NULL REFERENCES event_waves(id),
  market_id       UUID NOT NULL REFERENCES markets(id),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  status          TEXT NOT NULL DEFAULT 'reserved',  -- reserved, ordered, cancelled, walk_up
  reserved_at     TIMESTAMPTZ DEFAULT now(),
  order_id        UUID REFERENCES orders(id),
  UNIQUE(market_id, user_id)  -- one reservation per attendee per event
);
```

### New Table: `event_company_payments`
```sql
CREATE TABLE event_company_payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id             UUID NOT NULL REFERENCES markets(id),
  catering_request_id   UUID NOT NULL REFERENCES catering_requests(id),
  payment_type          TEXT NOT NULL,  -- deposit, final_settlement
  amount_cents          INTEGER NOT NULL,
  payment_method        TEXT,           -- stripe, check, invoice
  stripe_payment_intent_id TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending, paid, refunded
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  paid_at               TIMESTAMPTZ
);
```

### Column Additions
```sql
ALTER TABLE markets ADD COLUMN wave_ordering_enabled BOOLEAN DEFAULT false;
ALTER TABLE markets ADD COLUMN wave_duration_minutes INTEGER DEFAULT 30;
ALTER TABLE orders ADD COLUMN payment_model TEXT;  -- null = standard, 'company_paid'
ALTER TABLE orders ADD COLUMN event_wave_reservation_id UUID REFERENCES event_wave_reservations(id);
ALTER TABLE order_items ADD COLUMN wave_id UUID REFERENCES event_waves(id);
```

---

## SQL RPCs

### `reserve_event_wave(p_wave_id, p_market_id, p_user_id)`
- SELECT ... FOR UPDATE on event_waves row (row lock)
- Check reserved_count < capacity AND status = 'open'
- Check no existing reservation for this user at this market
- INSERT into event_wave_reservations
- UPDATE event_waves SET reserved_count = reserved_count + 1
- If reserved_count = capacity → SET status = 'full'
- Returns: success, reservation_id, error

### `cancel_wave_reservation(p_reservation_id, p_user_id)`
- Lock event_waves row
- UPDATE reservation status = 'cancelled'
- UPDATE event_waves SET reserved_count - 1, status = 'open' if was 'full'

### `create_company_paid_order(p_user_id, p_market_id, p_reservation_id, p_listing_id, p_vendor_id, p_wave_id)`
- Verify reservation belongs to user, status = 'reserved'
- Create order: status = 'confirmed', payment_model = 'company_paid'
- Create order_item with wave_id
- Update reservation: status = 'ordered', link order_id
- Generate order number: {EventName}-{Wave}-{Sequence}
- Returns: order_id, order_number

### `find_next_available_wave(p_market_id)`
- For walk-ups: returns the first wave with remaining capacity
- `SELECT * FROM event_waves WHERE market_id = p_market_id AND status = 'open' ORDER BY wave_number LIMIT 1`

---

## New API Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/events/[token]/waves/reserve` | Reserve a wave slot | Required |
| DELETE | `/api/events/[token]/waves/reserve` | Cancel reservation | Required |
| POST | `/api/events/[token]/order` | Company-paid order (no Stripe) | Required |
| POST | `/api/admin/events/[id]/generate-waves` | Generate waves after vendors accept | Admin |
| GET | `/api/events/[token]/waves` | Real-time wave availability | Public |

## Modified Endpoint
- `GET /api/events/[token]/shop` — Add: waves array, payment_model, user reservation

## NOT Modified
- `POST /api/cart/items` — CRITICAL PATH, company-paid bypasses cart

---

## Wave Generation Logic

**File:** `src/lib/events/wave-generation.ts`

**Called when:** Admin marks event as 'ready' OR auto-triggered when all invited vendors have responded.

**Logic:**
1. Parse event_start_time and event_end_time
2. Calculate wave count: ceil((end - start) / 30 minutes)
3. Per-wave capacity: SUM(event_max_orders_per_wave) across accepted vendors
4. INSERT into event_waves for each wave
5. Return wave count + per-wave capacity

---

## Shop Page Flow (Company-Paid)

### Step 1: Reserve Wave
- Wave cards: time range + remaining capacity + status color
- Green = open, yellow = filling (< 25%), gray = full
- Tap to reserve → calls POST /api/events/[token]/waves/reserve
- Collapses to summary after reservation

### Step 2: Pick One Item
- Vendor sections with selectable cards (radio-style)
- No quantity selector, no prices shown (company pays)
- One selection across all vendors

### Step 3: Confirm
- "Confirm Order" button (no price)
- Calls POST /api/events/[token]/order
- Shows pick-ticket: {EventName}-{Wave}-{Sequence}
- "Show this at the event"

### Walk-Up Flow
- Same page, but wave auto-assigned to first available
- If all waves full, show "All time slots are currently full"

---

## Implementation Sequence

1. Database migration (tables + columns + indexes)
2. RPC functions (reserve, cancel, create order, find next wave)
3. RLS policies for new tables
4. Wave generation logic (lib function)
5. Admin generate-waves API
6. Shop API modifications (return wave data)
7. Wave reservation API
8. Company-paid order API
9. Shop page UI overhaul (two-step flow)
10. Order confirmation / pick-ticket view
11. Settlement report updates
12. Admin wave monitoring UI

---

## Files to Create
- `src/lib/events/wave-generation.ts`
- `src/app/api/events/[token]/waves/reserve/route.ts`
- `src/app/api/events/[token]/waves/route.ts`
- `src/app/api/events/[token]/order/route.ts`
- `src/app/api/admin/events/[id]/generate-waves/route.ts`
- `supabase/migrations/YYYYMMDD_NNN_event_waves.sql`
- `supabase/migrations/YYYYMMDD_NNN_wave_rpcs.sql`

## Files to Modify
- `src/app/api/events/[token]/shop/route.ts` — add wave data to response
- `src/app/[vertical]/events/[token]/shop/page.tsx` — two-step wave UI
- `src/app/api/admin/events/[id]/settlement/route.ts` — company-paid model
- `src/lib/events/event-actions.ts` — trigger wave generation on ready
