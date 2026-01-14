# Build Instructions: Vendor Analytics Dashboard

**FOR CC TO READ AND EXECUTE**

**Phase:** Phase-K-2-Vendor-Analytics  
**Branch:** feature/vendor-analytics  
**Estimated Time:** 1-2 hours  
**Complexity:** Medium  
**Parallel With:** Phase-K-1-Markets-Foundation

---

## CC: CRITICAL - Autonomous Operation Mode

**CC: Full autonomous permission. Do NOT ask Tracy for permission for file operations, package installs, commits, or pushes. Just do it and report what you did.**

**Only ask if:** Deleting production data, adding secrets, or truly ambiguous requirement.

---

## CC: Objective

Build read-only analytics dashboard for vendors showing sales overview, top products, sales trends, and customer insights. All data comes from existing orders and listings tables. No database changes needed. Uses Chart.js for visualizations.

---

## CC: Pre-flight Checklist

**FIRST: Read PROJECT_CONTEXT.md for:**
- Tech stack and architecture patterns
- Database conventions and existing tables
- Component library location and usage
- Business rules (tiers, analytics access)
- Code style standards

**File location:** `/docs/PROJECT_CONTEXT.md`

**Then verify:**
- [ ] On branch: feature/vendor-analytics
- [ ] Latest pulled from main
- [ ] orders, order_items, listings, vendors tables exist
- [ ] Component library available
- [ ] Chart.js can be installed (npm install chart.js react-chartjs-2)
- [ ] Understand vendor tier system (premium vendors only get analytics)

**CC: Report verification, then proceed**

---

## Database Implementation

**No migrations needed** - read-only feature using existing tables

---

## API Implementation

### Endpoint 1: Sales Overview

**File:** `/app/api/vendor/analytics/overview/route.ts`

**Method:** GET

**Query params:** 
- `vendor_id` (required)
- `start_date` (optional, defaults to 30 days ago)
- `end_date` (optional, defaults to today)

**Returns:**
```typescript
{
  totalRevenue: number,
  totalOrders: number,
  averageOrderValue: number,
  completedOrders: number,
  pendingOrders: number,
  cancelledOrders: number
}
```

**Logic:**
- Query orders table WHERE vendor_id = ? AND created_at BETWEEN ? AND ?
- Calculate totals, averages, counts by status
- All read-only queries

---

### Endpoint 2: Top Products

**File:** `/app/api/vendor/analytics/top-products/route.ts`

**Method:** GET

**Query params:**
- `vendor_id` (required)
- `start_date`, `end_date` (optional)
- `limit` (optional, default 10)

**Returns:**
```typescript
[{
  listing_id: string,
  title: string,
  image_url: string,
  total_sold: number,
  revenue: number
}]
```

**Logic:**
- Join order_items with listings
- GROUP BY listing_id
- ORDER BY total_sold DESC or revenue DESC
- LIMIT ?

---

### Endpoint 3: Sales Trends

**File:** `/app/api/vendor/analytics/trends/route.ts`

**Method:** GET

**Query params:**
- `vendor_id` (required)
- `period` (day/week/month, default: day)
- `start_date`, `end_date` (optional)

**Returns:**
```typescript
[{
  date: string, // YYYY-MM-DD
  revenue: number,
  orders: number
}]
```

**Logic:**
- Query orders grouped by date
- If period=week, group by week
- If period=month, group by month
- Return time series data for charts

---

### Endpoint 4: Customer Insights

**File:** `/app/api/vendor/analytics/customers/route.ts`

**Method:** GET

**Query params:**
- `vendor_id` (required)
- `start_date`, `end_date` (optional)

**Returns:**
```typescript
{
  totalCustomers: number,
  returningCustomers: number,
  newCustomers: number,
  averageOrdersPerCustomer: number
}
```

**Logic:**
- Query distinct user_id from orders
- Count orders per customer
- Calculate new vs returning

---

## UI Implementation

### Page: Vendor Analytics Dashboard

**File:** `/app/vendor/analytics/page.tsx`

**Layout:**
```
┌─────────────────────────────────────────────┐
│          Metric Cards (4 across)             │
│  Revenue | Orders | Avg Value | Customers   │
├─────────────────────────────────────────────┤
│          Sales Trend Chart                   │
│          (Line chart - 30 days)              │
├──────────────────┬──────────────────────────┤
│  Top Products    │   Customer Insights      │
│  (Table)         │   (Pie chart or stats)   │
└──────────────────┴──────────────────────────┘
```

**Features:**
- Date range picker (last 7/30/90 days, custom)
- Auto-refresh every 5 minutes
- Export to CSV button (optional)
- Mobile: Stack sections vertically

---

### Component 1: MetricCard

**File:** `/components/analytics/MetricCard.tsx`

**Purpose:** Display single metric with label and value

**Props:**
```typescript
{
  label: string,
  value: number | string,
  change?: number, // % change from previous period
  icon?: React.ReactNode,
  format?: 'currency' | 'number' | 'percentage'
}
```

**Styling:**
- Card with border
- Large value text
- Smaller label text
- Optional change indicator (green up, red down)

---

### Component 2: SalesChart

**File:** `/components/analytics/SalesChart.tsx`

**Purpose:** Line chart showing revenue/orders over time

**Uses:** Chart.js / react-chartjs-2

**Props:**
```typescript
{
  data: Array<{ date: string, revenue: number, orders: number }>,
  metric: 'revenue' | 'orders'
}
```

**Features:**
- Responsive
- Tooltip on hover
- Smooth lines
- Grid lines

---

### Component 3: TopProductsTable

**File:** `/components/analytics/TopProductsTable.tsx`

**Purpose:** Table showing best-selling products

**Uses:** AdminTable component from component library

**Columns:**
- Product image (thumbnail)
- Product title
- Units sold
- Total revenue

**Features:**
- Sortable
- Limit to top 10
- Click to view product

---

### Component 4: DateRangePicker

**File:** `/components/analytics/DateRangePicker.tsx`

**Purpose:** Select date range for analytics

**Options:**
- Last 7 days
- Last 30 days
- Last 90 days
- Custom range

**Props:**
```typescript
{
  value: { start: Date, end: Date },
  onChange: (range: { start: Date, end: Date }) => void
}
```

---

## Testing Requirements

**APIs (read-only verification):**
- [ ] GET /api/vendor/analytics/overview returns correct totals
- [ ] GET /api/vendor/analytics/top-products returns sorted list
- [ ] GET /api/vendor/analytics/trends returns time series
- [ ] GET /api/vendor/analytics/customers returns correct counts
- [ ] Non-vendor users cannot access other vendor's analytics

**UI:**
- [ ] Dashboard displays all sections
- [ ] Charts render correctly
- [ ] Date range picker changes data
- [ ] Mobile responsive (375px)
- [ ] No console errors

**Data verification:**
- [ ] Manual calculation matches API results
- [ ] Charts display accurate data
- [ ] Filters work correctly

---

## Git Operations

**Commit after each section:**
1. "feat(analytics): Add vendor analytics API endpoints"
2. "feat(analytics): Add MetricCard and chart components"
3. "feat(analytics): Add vendor analytics dashboard page"
4. "feat(analytics): Add date range filtering"

**Push every 2 commits**

**DO NOT merge to main** - Tracy will merge after testing

---

## CRITICAL: End-of-Session Requirements

1. Create session summary: `/docs/Session_Summaries/Phase-K-2-Vendor-Analytics-2026-01-14.md`
2. Update SESSION_LOG
3. No migrations (skip MIGRATION_LOG)
4. Commit documentation
5. Report to Tracy

---

## Success Criteria

- [ ] All 4 analytics APIs functional
- [ ] Dashboard displays metrics correctly
- [ ] Charts render and show data
- [ ] Top products table works
- [ ] Date range filtering works
- [ ] Mobile responsive
- [ ] Read-only (no data modifications)
- [ ] Session documentation complete

---

## Notes

- Read-only feature - safe for parallel development
- No database conflicts with Markets phase
- Uses existing orders/listings data
- Chart.js for visualizations (lightweight, fast)
- Vendor can only see their own analytics (enforced by RLS)
