'use client';

import React from 'react';
import Link from 'next/link';

interface NavItem {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

interface MobileNavProps {
  items: NavItem[];
  currentPath: string;
}

export default function MobileNav({ items, currentPath }: MobileNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden bg-white border-t border-gray-200 z-50 pb-safe"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16">
        {items.map((item) => {
          const isActive = item.active !== undefined
            ? item.active
            : currentPath === item.href || currentPath.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center justify-center
                min-w-[64px] min-h-[44px]
                px-3 py-2
                transition-colors duration-200
                ${isActive
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`
                flex items-center justify-center
                w-6 h-6 mb-1
                transition-transform duration-200
                ${isActive ? 'scale-110' : ''}
              `}>
                {item.icon}
              </span>
              <span className={`
                text-xs font-medium
                transition-colors duration-200
              `}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
