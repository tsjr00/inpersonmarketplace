'use client';

import React from 'react';

type StatusType =
  | 'pending'
  | 'active'
  | 'inactive'
  | 'approved'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'draft';

interface CustomColor {
  bg: string;
  text: string;
  border: string;
}

interface StatusBadgeProps {
  status: StatusType | string;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  customColor?: CustomColor;
}

const statusColors: Record<StatusType, CustomColor> = {
  pending: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    border: 'border-amber-300',
  },
  active: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
  },
  inactive: {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-300',
  },
  approved: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    border: 'border-green-300',
  },
  rejected: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
  },
  completed: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-300',
  },
  cancelled: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-300',
  },
  draft: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
  },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

export default function StatusBadge({
  status,
  size = 'md',
  icon,
  customColor,
}: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase() as StatusType;
  const colors = customColor || statusColors[normalizedStatus] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    border: 'border-gray-300',
  };

  const displayStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

  return (
    <span
      className={`
        inline-flex items-center gap-1
        ${colors.bg} ${colors.text} ${colors.border}
        ${sizeClasses[size]}
        font-medium rounded-full border
      `}
      role="status"
      aria-label={`Status: ${displayStatus}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {displayStatus}
    </span>
  );
}
