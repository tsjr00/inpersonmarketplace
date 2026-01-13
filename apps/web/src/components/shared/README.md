# Shared Components Library

Reusable UI components used across the FastWrks BuildApp.

## Components

### AdminTable
**Import:** `import AdminTable from '@/components/shared/AdminTable'`

**Usage:**
```tsx
<AdminTable
  data={listings}
  columns={[
    { key: 'title', label: 'Title', sortable: true, filterable: true },
    { key: 'price', label: 'Price', sortable: true, render: (val) => `$${val}` },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> }
  ]}
  itemsPerPage={20}
/>
```

### StandardForm
**Import:** `import StandardForm from '@/components/shared/StandardForm'`

**Usage:**
```tsx
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
```

### StatusBadge
**Import:** `import StatusBadge from '@/components/shared/StatusBadge'`

**Usage:**
```tsx
<StatusBadge status="active" />
<StatusBadge status="pending" size="lg" />
<StatusBadge status="custom" customColor={{ bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' }} />
```

### MobileNav
**Import:** `import MobileNav from '@/components/shared/MobileNav'`

**Usage:**
```tsx
<MobileNav
  items={[
    { href: '/dashboard', icon: <HomeIcon />, label: 'Home' },
    { href: '/listings', icon: <ListIcon />, label: 'Listings' },
    { href: '/orders', icon: <OrderIcon />, label: 'Orders' }
  ]}
  currentPath={pathname}
/>
```

## Design Guidelines

- **Mobile First:** All components work at 375px width
- **Tailwind Only:** Use Tailwind utility classes, no custom CSS
- **Accessible:** WCAG AA contrast, proper ARIA labels, keyboard navigation
- **TypeScript:** Fully typed props and generics where appropriate
- **Consistent:** Follow existing app color scheme and spacing
