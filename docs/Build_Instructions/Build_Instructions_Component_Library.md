# Build Instructions: Component Library

**FOR CC TO READ AND EXECUTE**

**Phase:** Phase-L-1-Component-Library  
**Branch:** feature/component-library  
**Estimated Time:** 4-6 hours  
**Complexity:** Medium  
**Parallel With:** None (foundational work)

---

## CC: Autonomy Grant

CC: You have full permission from Tracy to:
- Create/edit any files without asking Tracy
- Install packages without asking Tracy
- Make commits without asking Tracy
- Push to GitHub without asking Tracy

CC: Only ask Tracy if:
- Deleting production data
- Making security decisions
- Truly ambiguous requirements

CC: Otherwise work autonomously and report actions to Tracy.

---

## CC: Objective

Build four reusable UI components that all future features will use: AdminTable (sortable/filterable data tables), StandardForm (forms with validation), StatusBadge (status indicators), and MobileNav (consistent mobile navigation). These components create consistency across the app and speed up future UI development by 30-40% by eliminating repetitive component creation.

---

## CC: Pre-flight Checklist

**CC: Before starting implementation, verify:**

- [ ] Working on correct branch: feature/component-library
- [ ] Latest code pulled from main
- [ ] /components/shared/ folder exists (create if not)
- [ ] Tailwind CSS configured in project
- [ ] React and TypeScript working

**CC: Report verification results before proceeding**

---

## Database Implementation

**No database changes needed for this phase.**

---

## API Implementation

**No API endpoints needed for this phase.**

---

## UI Implementation

### Component 1: AdminTable

**File:** `/components/shared/AdminTable.tsx`

**Purpose:** Reusable data table component with sorting, filtering, and pagination for admin interfaces

**Key features:**
- Sortable columns (click header to sort)
- Column filtering (text input per column)
- Pagination (configurable items per page, default 20)
- Mobile responsive (stacks on small screens)
- TypeScript generic for type safety
- Empty state handling
- Loading state

**Props interface:**
```typescript
interface Column<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
}

interface AdminTableProps<T> {
  data: T[];
  columns: Column<T>[];
  itemsPerPage?: number;
  loading?: boolean;
  emptyMessage?: string;
}
```

**Implementation requirements:**
- Use Tailwind utility classes only
- Mobile: single column card layout below 768px
- Desktop: full table layout
- Sticky header on scroll
- Accessible (proper ARIA labels)
- Export as default

**Testing checklist:**
- [ ] Sorting works (ascending/descending)
- [ ] Filtering narrows results
- [ ] Pagination calculates pages correctly
- [ ] Mobile responsive (375px width)
- [ ] Loading state displays
- [ ] Empty state displays when no data
- [ ] TypeScript types work with different data shapes

---

### Component 2: StandardForm

**File:** `/components/shared/StandardForm.tsx`

**Purpose:** Reusable form wrapper with validation, error handling, and consistent styling

**Key features:**
- Field validation (required, email, min/max length, custom)
- Error message display per field
- Success/error state handling
- Loading state during submission
- Consistent styling across all forms
- Mobile responsive
- Accessible labels and error announcements

**Props interface:**
```typescript
interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'textarea' | 'select' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[]; // for select
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    custom?: (value: string) => string | null; // returns error message or null
  };
}

interface StandardFormProps {
  fields: FormField[];
  onSubmit: (data: Record<string, any>) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  initialValues?: Record<string, any>;
}
```

**Implementation requirements:**
- Use React useState for form state
- Validate on blur and submit
- Display errors below each field
- Disable submit while loading
- Show success message after successful submit
- Clear form after successful submit (optional prop)
- Mobile: full-width inputs, larger touch targets
- Tailwind styling matching app theme

**Testing checklist:**
- [ ] Required field validation works
- [ ] Email validation works
- [ ] Custom validation works
- [ ] Errors display correctly
- [ ] Form submits with valid data
- [ ] Loading state prevents double-submit
- [ ] Mobile responsive (375px width)
- [ ] Accessible (labels, error announcements)

---

### Component 3: StatusBadge

**File:** `/components/shared/StatusBadge.tsx`

**Purpose:** Consistent status indicator badges for orders, listings, and other entities

**Key features:**
- Predefined color schemes for common statuses
- Customizable colors for unique statuses
- Small/medium/large sizes
- Icon support (optional)
- Accessible (proper contrast ratios)

**Props interface:**
```typescript
type StatusType = 
  | 'pending' 
  | 'active' 
  | 'inactive' 
  | 'approved' 
  | 'rejected' 
  | 'completed' 
  | 'cancelled'
  | 'draft';

interface StatusBadgeProps {
  status: StatusType | string;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  customColor?: {
    bg: string;
    text: string;
    border: string;
  };
}
```

**Color scheme:**
- pending: yellow/amber
- active: green
- inactive: gray
- approved: green
- rejected: red
- completed: blue
- cancelled: red
- draft: gray

**Implementation requirements:**
- Use Tailwind utility classes
- Ensure WCAG AA contrast compliance
- Support custom colors via customColor prop
- Default size: md
- Round corners, inline-block display

**Testing checklist:**
- [ ] All predefined statuses display correctly
- [ ] Custom colors work
- [ ] All sizes render properly
- [ ] Icon placement correct
- [ ] Accessible contrast ratios
- [ ] Inline with text

---

### Component 4: MobileNav

**File:** `/components/shared/MobileNav.tsx`

**Purpose:** Bottom navigation bar for mobile devices (< 768px) with consistent styling

**Key features:**
- Fixed bottom position on mobile
- Icon + label navigation items
- Active state highlighting
- Hidden on desktop (>= 768px)
- Smooth transitions
- Touch-friendly targets (min 44px)

**Props interface:**
```typescript
interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

interface MobileNavProps {
  items: NavItem[];
  currentPath: string; // to determine active state
}
```

**Implementation requirements:**
- Fixed position bottom on mobile
- Hidden on desktop (display: none above 768px)
- Safe area inset for iOS notches
- 5 items max recommended
- Active state: colored icon + label
- Inactive state: gray icon + label
- Smooth color transitions
- z-index high enough to float above content

**Testing checklist:**
- [ ] Displays on mobile (< 768px)
- [ ] Hidden on desktop (>= 768px)
- [ ] Active state highlights correctly
- [ ] Touch targets 44px minimum
- [ ] Icons and labels aligned
- [ ] Safe area respected on iOS
- [ ] Navigation works

---

## Component Documentation

**CC: Create file:** `/components/shared/README.md`

**Content:**
```markdown
# Shared Components Library

Reusable UI components used across the FastWrks BuildApp.

## Components

### AdminTable
**Import:** `import AdminTable from '@/components/shared/AdminTable'`

**Usage:**
\`\`\`tsx
<AdminTable
  data={listings}
  columns={[
    { key: 'title', label: 'Title', sortable: true, filterable: true },
    { key: 'price', label: 'Price', sortable: true, render: (val) => `$${val}` },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> }
  ]}
  itemsPerPage={20}
/>
\`\`\`

### StandardForm
**Import:** `import StandardForm from '@/components/shared/StandardForm'`

**Usage:**
\`\`\`tsx
<StandardForm
  fields={[
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'message', label: 'Message', type: 'textarea', required: true }
  ]}
  onSubmit={async (data) => {
    await saveData(data);
  }}
  submitLabel="Send"
/>
\`\`\`

### StatusBadge
**Import:** `import StatusBadge from '@/components/shared/StatusBadge'`

**Usage:**
\`\`\`tsx
<StatusBadge status="active" />
<StatusBadge status="pending" size="lg" />
<StatusBadge status="custom" customColor={{ bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' }} />
\`\`\`

### MobileNav
**Import:** `import MobileNav from '@/components/shared/MobileNav'`

**Usage:**
\`\`\`tsx
<MobileNav
  items={[
    { href: '/dashboard', icon: <HomeIcon />, label: 'Home' },
    { href: '/listings', icon: <ListIcon />, label: 'Listings' },
    { href: '/orders', icon: <OrderIcon />, label: 'Orders' }
  ]}
  currentPath={pathname}
/>
\`\`\`

## Design Guidelines

- **Mobile First:** All components work at 375px width
- **Tailwind Only:** Use Tailwind utility classes, no custom CSS
- **Accessible:** WCAG AA contrast, proper ARIA labels, keyboard navigation
- **TypeScript:** Fully typed props and generics where appropriate
- **Consistent:** Follow existing app color scheme and spacing
```

---

## Testing Requirements

### Manual Testing Checklist

**Component Testing:**
- [ ] AdminTable: Create test page with sample data, verify all features work
- [ ] StandardForm: Create test form, verify validation and submission
- [ ] StatusBadge: Create test page showing all status types and sizes
- [ ] MobileNav: Verify shows on mobile, hidden on desktop, navigation works

**Responsive Testing:**
- [ ] All components work at 375px width (iPhone SE)
- [ ] All components work at 768px width (tablet)
- [ ] All components work at 1920px width (desktop)

**Accessibility Testing:**
- [ ] All interactive elements keyboard accessible
- [ ] Proper ARIA labels on all components
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader friendly

**Integration Testing:**
- [ ] Components export correctly
- [ ] TypeScript types work in consuming components
- [ ] No console errors or warnings

---

## Git Operations

### Commit Strategy

**CC: Commit after each component:**
1. AdminTable complete → "feat(components): Add AdminTable component"
2. StandardForm complete → "feat(components): Add StandardForm component"
3. StatusBadge complete → "feat(components): Add StatusBadge component"
4. MobileNav complete → "feat(components): Add MobileNav component"
5. README complete → "docs(components): Add shared components documentation"

### Push Frequency

**CC: Push after every 2 commits**

**DO NOT merge to main** - Tracy will merge after testing

---

## CRITICAL: End-of-Session Requirements (MANDATORY)

**CC: Before reporting "session complete," you MUST:**

### 1. Create Detailed Session Summary
**File:** `/docs/Session_Summaries/Phase-L-1-Component-Library-2026-01-14.md`

Include:
- All 4 components completed (or which are incomplete)
- Issues encountered and solutions
- Testing performed
- Total commits
- Next steps (if incomplete)

### 2. Update SESSION_LOG
**File:** `/docs/Session_Summaries/SESSION_LOG.md`

Add new phase section for Component Library with today's session entry

### 3. Update MIGRATION_LOG
**Not applicable** - no migrations in this phase

### 4. Commit All Documentation
```
docs: Session summary and logs for Phase-L-1 - 2026-01-14
```

### 5. Report to Tracy

Tell Tracy:
- Session summary filepath
- SESSION_LOG updated
- All 4 components complete (or status if incomplete)
- Total commits and branch name
- Components ready for testing

**Tracy will verify all documentation exists before accepting session as complete**

---

## Success Criteria

- [ ] AdminTable component functional with all features
- [ ] StandardForm component functional with validation
- [ ] StatusBadge component functional with all statuses
- [ ] MobileNav component functional on mobile
- [ ] All components mobile responsive (375px)
- [ ] All components TypeScript typed
- [ ] README documentation complete
- [ ] No console errors
- [ ] All commits pushed to feature/component-library
- [ ] Session documentation complete (summary + logs)
- [ ] NOT merged to main (awaiting Tracy's review)

---

## Notes

**Important considerations:**
- These components will be used by ALL future features (Markets, Analytics, Flash Sales, etc.)
- Focus on mobile-first design - most vendor users will be on phones
- Keep components flexible - don't over-engineer, but allow customization
- Use only Tailwind's core utility classes (no custom CSS or external libraries)
- Prioritize accessibility - vendors may have varying abilities
- If stuck on a feature, implement a simpler version and note it in session summary

**Testing strategy:**
- Create a `/app/test-components/page.tsx` to manually test all components
- This test page can be deleted before merge or kept for future reference
