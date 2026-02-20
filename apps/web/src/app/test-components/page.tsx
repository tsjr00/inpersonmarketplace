'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminTable from '@/components/shared/AdminTable';
import StandardForm from '@/components/shared/StandardForm';
import StatusBadge from '@/components/shared/StatusBadge';
import MobileNav from '@/components/shared/MobileNav';

// Sample data for AdminTable
const sampleListings = [
  { id: 1, title: 'Fresh Tomatoes', price: 4.99, status: 'active', category: 'Vegetables' },
  { id: 2, title: 'Organic Eggs', price: 6.50, status: 'pending', category: 'Dairy' },
  { id: 3, title: 'Local Honey', price: 12.00, status: 'active', category: 'Specialty' },
  { id: 4, title: 'Homemade Bread', price: 5.00, status: 'draft', category: 'Bakery' },
  { id: 5, title: 'Fresh Apples', price: 3.50, status: 'active', category: 'Fruits' },
  { id: 6, title: 'Grass-fed Beef', price: 15.99, status: 'approved', category: 'Meat' },
  { id: 7, title: 'Farm Cheese', price: 8.00, status: 'rejected', category: 'Dairy' },
  { id: 8, title: 'Pickled Cucumbers', price: 4.50, status: 'completed', category: 'Specialty' },
];

// Icons for MobileNav
const HomeIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const ListIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

const OrderIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const UserIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

export default function TestComponentsPage() {
  const router = useRouter();

  // H10 FIX: Block access in production
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      router.replace('/');
    }
  }, [router]);

  const [formLoading, setFormLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);

  const handleFormSubmit = async (data: Record<string, string>) => {
    setFormLoading(true);
    console.log('Form submitted:', data);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setFormLoading(false);
  };

  const toggleTableLoading = () => {
    setTableLoading(true);
    setTimeout(() => setTableLoading(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Component Library Test Page</h1>
          <p className="text-gray-600 text-sm mt-1">Testing all shared components</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-12">
        {/* StatusBadge Section */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">StatusBadge Component</h2>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">All Status Types</h3>
              <div className="flex flex-wrap gap-2">
                <StatusBadge status="pending" />
                <StatusBadge status="active" />
                <StatusBadge status="inactive" />
                <StatusBadge status="approved" />
                <StatusBadge status="rejected" />
                <StatusBadge status="completed" />
                <StatusBadge status="cancelled" />
                <StatusBadge status="draft" />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Sizes</h3>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="active" size="sm" />
                <StatusBadge status="active" size="md" />
                <StatusBadge status="active" size="lg" />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Custom Colors</h3>
              <div className="flex flex-wrap gap-2">
                <StatusBadge
                  status="VIP"
                  customColor={{ bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' }}
                />
                <StatusBadge
                  status="Featured"
                  customColor={{ bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* AdminTable Section */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">AdminTable Component</h2>
            <button
              onClick={toggleTableLoading}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Toggle Loading
            </button>
          </div>

          <AdminTable
            data={sampleListings}
            columns={[
              { key: 'id', label: 'ID', sortable: true },
              { key: 'title', label: 'Title', sortable: true, filterable: true },
              { key: 'price', label: 'Price', sortable: true, render: (val) => `$${Number(val).toFixed(2)}` },
              { key: 'category', label: 'Category', filterable: true },
              { key: 'status', label: 'Status', render: (val) => <StatusBadge status={String(val)} size="sm" /> },
            ]}
            itemsPerPage={5}
            loading={tableLoading}
          />
        </section>

        {/* StandardForm Section */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">StandardForm Component</h2>

          <div className="max-w-md">
            <StandardForm
              fields={[
                { name: 'name', label: 'Full Name', type: 'text', required: true },
                {
                  name: 'email',
                  label: 'Email Address',
                  type: 'email',
                  required: true,
                  placeholder: 'you@example.com',
                },
                {
                  name: 'category',
                  label: 'Category',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'vegetables', label: 'Vegetables' },
                    { value: 'fruits', label: 'Fruits' },
                    { value: 'dairy', label: 'Dairy' },
                    { value: 'meat', label: 'Meat' },
                  ],
                },
                {
                  name: 'quantity',
                  label: 'Quantity',
                  type: 'number',
                  placeholder: 'Enter quantity',
                  validation: {
                    custom: (val) => {
                      const num = parseInt(val, 10);
                      if (isNaN(num) || num < 1) return 'Quantity must be at least 1';
                      if (num > 100) return 'Quantity cannot exceed 100';
                      return null;
                    },
                  },
                },
                {
                  name: 'message',
                  label: 'Message',
                  type: 'textarea',
                  placeholder: 'Enter your message...',
                  validation: { minLength: 10, maxLength: 500 },
                },
              ]}
              onSubmit={handleFormSubmit}
              submitLabel="Submit Form"
              loading={formLoading}
            />
          </div>
        </section>

        {/* MobileNav Info Section */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">MobileNav Component</h2>
          <p className="text-gray-600">
            The MobileNav component is visible at the bottom of this page when viewed on mobile devices (width &lt; 768px).
            Resize your browser window or use mobile dev tools to see it.
          </p>
          <div className="mt-4 p-4 bg-gray-100 rounded-lg">
            <p className="text-sm text-gray-500">Preview of nav items:</p>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-2 text-blue-600">
                <HomeIcon /> Home
              </div>
              <div className="flex items-center gap-2 text-gray-500">
                <ListIcon /> Listings
              </div>
              <div className="flex items-center gap-2 text-gray-500">
                <OrderIcon /> Orders
              </div>
              <div className="flex items-center gap-2 text-gray-500">
                <UserIcon /> Profile
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* MobileNav - visible only on mobile */}
      <MobileNav
        items={[
          { href: '/test-components', icon: <HomeIcon />, label: 'Home' },
          { href: '/listings', icon: <ListIcon />, label: 'Listings' },
          { href: '/orders', icon: <OrderIcon />, label: 'Orders' },
          { href: '/profile', icon: <UserIcon />, label: 'Profile' },
        ]}
        currentPath="/test-components"
      />
    </div>
  );
}
