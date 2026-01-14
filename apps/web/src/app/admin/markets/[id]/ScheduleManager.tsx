'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface ScheduleManagerProps {
  marketId: string
  schedules: Schedule[]
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function ScheduleManager({ marketId, schedules }: ScheduleManagerProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    day_of_week: 0,
    start_time: '08:00',
    end_time: '14:00',
  })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/markets/${marketId}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add schedule')
      }

      setShowForm(false)
      setFormData({ day_of_week: 0, start_time: '08:00', end_time: '14:00' })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (scheduleId: string) => {
    if (!confirm('Delete this schedule?')) return

    try {
      const response = await fetch(`/api/markets/${marketId}/schedules/${scheduleId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete')
      }

      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete schedule')
    }
  }

  const inputStyle = {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 14,
  }

  return (
    <div>
      {/* Existing schedules with delete buttons */}
      {schedules.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {schedules.map(schedule => (
              <div
                key={schedule.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  backgroundColor: '#f0f0f0',
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <span>
                  {DAY_NAMES[schedule.day_of_week]} {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                </span>
                <button
                  onClick={() => handleDelete(schedule.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc3545',
                    cursor: 'pointer',
                    padding: 2,
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                  title="Delete"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add schedule form */}
      {showForm ? (
        <form onSubmit={handleAdd} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>Day</label>
            <select
              value={formData.day_of_week}
              onChange={(e) => setFormData(prev => ({ ...prev, day_of_week: parseInt(e.target.value) }))}
              style={{ ...inputStyle, minWidth: 120 }}
            >
              {DAY_NAMES.map((day, i) => (
                <option key={i} value={i}>{day}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>Start</label>
            <input
              type="time"
              value={formData.start_time}
              onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#666' }}>End</label>
            <input
              type="time"
              value={formData.end_time}
              onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: loading ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Adding...' : 'Add'}
          </button>

          <button
            type="button"
            onClick={() => setShowForm(false)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f0f0f0',
              color: '#666',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>

          {error && (
            <div style={{ width: '100%', color: '#dc3545', fontSize: 13 }}>
              {error}
            </div>
          )}
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f0f0f0',
            color: '#333',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          + Add Schedule
        </button>
      )}
    </div>
  )
}
