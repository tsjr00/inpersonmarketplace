'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Vendor {
  id: string
  vendor_profile_id: string
  approved: boolean
  booth_number: string | null
  notes: string | null
  created_at: string
  business_name: string
  vendor_status: string
}

interface VendorManagerProps {
  marketId: string
  vendors: Vendor[]
  type: 'pending' | 'approved'
}

export default function VendorManager({ marketId, vendors, type }: VendorManagerProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [editingBooth, setEditingBooth] = useState<string | null>(null)
  const [boothNumber, setBoothNumber] = useState('')

  const handleApprove = async (vendorId: string, booth?: string) => {
    setLoading(vendorId)

    try {
      const response = await fetch(`/api/markets/${marketId}/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved: true,
          booth_number: booth || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to approve')
      }

      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to approve vendor')
    } finally {
      setLoading(null)
      setEditingBooth(null)
    }
  }

  const handleReject = async (vendorId: string) => {
    if (!confirm('Remove this vendor application?')) return

    setLoading(vendorId)

    try {
      const response = await fetch(`/api/markets/${marketId}/vendors/${vendorId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to remove')
      }

      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove vendor')
    } finally {
      setLoading(null)
    }
  }

  const handleUpdateBooth = async (vendorId: string) => {
    setLoading(vendorId)

    try {
      const response = await fetch(`/api/markets/${marketId}/vendors/${vendorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booth_number: boothNumber }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update')
      }

      router.refresh()
      setEditingBooth(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update booth')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {vendors.map((vendor) => (
        <div
          key={vendor.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: type === 'pending' ? 'rgba(255,255,255,0.7)' : '#f8f9fa',
            borderRadius: 8,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontWeight: 600, color: '#333' }}>{vendor.business_name}</div>
            {vendor.notes && (
              <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                Note: {vendor.notes}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              Applied: {new Date(vendor.created_at).toLocaleDateString()}
            </div>
          </div>

          {/* Booth number for approved vendors */}
          {type === 'approved' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {editingBooth === vendor.id ? (
                <>
                  <input
                    type="text"
                    value={boothNumber}
                    onChange={(e) => setBoothNumber(e.target.value)}
                    placeholder="Booth #"
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      fontSize: 13,
                      width: 80,
                    }}
                  />
                  <button
                    onClick={() => handleUpdateBooth(vendor.id)}
                    disabled={loading === vendor.id}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#0070f3',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingBooth(null)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f0f0f0',
                      color: '#666',
                      border: 'none',
                      borderRadius: 4,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setBoothNumber(vendor.booth_number || '')
                    setEditingBooth(vendor.id)
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: vendor.booth_number ? '#e3f2fd' : '#f0f0f0',
                    color: vendor.booth_number ? '#1565c0' : '#666',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {vendor.booth_number ? `Booth ${vendor.booth_number}` : 'Assign Booth'}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            {type === 'pending' && (
              <>
                <button
                  onClick={() => {
                    const booth = prompt('Assign booth number (optional):')
                    if (booth !== null) {
                      handleApprove(vendor.id, booth || undefined)
                    }
                  }}
                  disabled={loading === vendor.id}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: loading === vendor.id ? '#ccc' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: loading === vendor.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  {loading === vendor.id ? 'Processing...' : 'Approve'}
                </button>
                <button
                  onClick={() => handleReject(vendor.id)}
                  disabled={loading === vendor.id}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#f8f9fa',
                    color: '#dc3545',
                    border: '1px solid #dc3545',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: loading === vendor.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  Reject
                </button>
              </>
            )}

            {type === 'approved' && (
              <button
                onClick={() => handleReject(vendor.id)}
                disabled={loading === vendor.id}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#fff',
                  color: '#dc3545',
                  border: '1px solid #dc3545',
                  borderRadius: 4,
                  fontSize: 12,
                  cursor: loading === vendor.id ? 'not-allowed' : 'pointer',
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
