'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Pagination from '@/components/admin/Pagination'

interface BrowsePaginationProps {
  vertical: string
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

export default function BrowsePagination({
  vertical,
  currentPage,
  totalPages,
  totalItems,
  pageSize,
}: BrowsePaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (page > 1) {
      params.set('page', String(page))
    } else {
      params.delete('page')
    }
    router.push(`/${vertical}/browse${params.toString() ? '?' + params.toString() : ''}`)
  }

  if (totalPages <= 1) return null

  return (
    <Pagination
      currentPage={currentPage}
      totalPages={totalPages}
      totalItems={totalItems}
      pageSize={pageSize}
      onPageChange={handlePageChange}
    />
  )
}
