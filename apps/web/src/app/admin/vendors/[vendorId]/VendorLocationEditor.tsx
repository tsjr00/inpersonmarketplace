'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface VendorLocationEditorProps {
  vendorId: string
  currentLatitude: number | null
  currentLongitude: number | null
}

export default function VendorLocationEditor({
  vendorId,
  currentLatitude,
  currentLongitude
}: VendorLocationEditorProps) {
  const router = useRouter()
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [latitude, setLatitude] = useState(currentLatitude?.toString() || '')
  const [longitude, setLongitude] = useState(currentLongitude?.toString() || '')
  const [error, setError] = useState('')

  const handleSave = async () => {
    setError('')
    setLoading(true)

    // Validate coordinates
    const lat = latitude ? parseFloat(latitude) : null
    const lng = longitude ? parseFloat(longitude) : null

    if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
      setError('Invalid latitude (must be between -90 and 90)')
      setLoading(false)
      return
    }

    if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
      setError('Invalid longitude (must be between -180 and 180)')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update({
        latitude: lat,
        longitude: lng,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorId)

    if (updateError) {
      setError('Failed to update: ' + updateError.message)
      setLoading(false)
      return
    }

    setEditing(false)
    setLoading(false)
    router.refresh()
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 14,
  }

  if (!editing) {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 25,
        marginTop: 20,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <h3 style={{ color: '#333', margin: 0 }}>Location Coordinates</h3>
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f0f0f0',
              color: '#333',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Edit
          </button>
        </div>

        {currentLatitude && currentLongitude ? (
          <div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
              <div>
                <span style={{ color: '#666', fontSize: 13 }}>Latitude: </span>
                <span style={{ color: '#333', fontWeight: 500 }}>{currentLatitude}</span>
              </div>
              <div>
                <span style={{ color: '#666', fontSize: 13 }}>Longitude: </span>
                <span style={{ color: '#333', fontWeight: 500 }}>{currentLongitude}</span>
              </div>
            </div>
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#d4edda',
              borderRadius: 6,
              fontSize: 13,
              color: '#155724'
            }}>
              Location set - vendor will appear in 25-mile radius searches
            </div>
          </div>
        ) : (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fff3cd',
            borderRadius: 6,
            fontSize: 13,
            color: '#856404'
          }}>
            No coordinates set - vendor will only be found through their associated markets
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 8,
      padding: 25,
      marginTop: 20,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      border: '2px solid #0070f3'
    }}>
      <h3 style={{ color: '#333', margin: '0 0 15px 0' }}>Edit Location Coordinates</h3>

      <p style={{ fontSize: 13, color: '#666', marginBottom: 15 }}>
        Setting coordinates allows this vendor to appear in location-based searches even without a market association.
        Get coordinates from{' '}
        <a href="https://www.latlong.net/" target="_blank" rel="noopener noreferrer" style={{ color: '#0070f3' }}>
          latlong.net
        </a>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#333' }}>
            Latitude
          </label>
          <input
            type="text"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="e.g., 30.2672"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#333' }}>
            Longitude
          </label>
          <input
            type="text"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="e.g., -97.7431"
            style={inputStyle}
          />
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleSave}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Saving...' : 'Save Coordinates'}
        </button>
        <button
          onClick={() => {
            setEditing(false)
            setLatitude(currentLatitude?.toString() || '')
            setLongitude(currentLongitude?.toString() || '')
            setError('')
          }}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f0f0f0',
            color: '#333',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        {(currentLatitude || currentLongitude) && (
          <button
            onClick={() => {
              setLatitude('')
              setLongitude('')
            }}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: '#ef4444',
              border: '1px solid #ef4444',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              marginLeft: 'auto'
            }}
          >
            Clear Coordinates
          </button>
        )}
      </div>
    </div>
  )
}
