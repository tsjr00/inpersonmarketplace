'use client'

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  active: boolean
}

interface ScheduleDisplayProps {
  schedules: Schedule[]
  compact?: boolean
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

export default function ScheduleDisplay({ schedules, compact = false }: ScheduleDisplayProps) {
  const activeSchedules = schedules.filter(s => s.active)

  if (activeSchedules.length === 0) {
    return (
      <span style={{ color: '#666', fontStyle: 'italic' }}>
        No schedule set
      </span>
    )
  }

  // Sort by day of week
  const sortedSchedules = [...activeSchedules].sort((a, b) => a.day_of_week - b.day_of_week)

  if (compact) {
    // Group schedules with same time
    const timeGroups: { [key: string]: number[] } = {}
    sortedSchedules.forEach(s => {
      const timeKey = `${s.start_time}-${s.end_time}`
      if (!timeGroups[timeKey]) {
        timeGroups[timeKey] = []
      }
      timeGroups[timeKey].push(s.day_of_week)
    })

    const parts = Object.entries(timeGroups).map(([timeKey, days]) => {
      const [start, end] = timeKey.split('-')
      const dayNames = days.map(d => DAY_NAMES_SHORT[d]).join(', ')
      return `${dayNames} ${formatTime(start)} - ${formatTime(end)}`
    })

    return (
      <span style={{ color: '#333' }}>
        {parts.join(' | ')}
      </span>
    )
  }

  // Full display
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sortedSchedules.map(schedule => (
        <div
          key={schedule.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: '#f8f9fa',
            borderRadius: 6,
          }}
        >
          <span style={{ fontWeight: 500 }}>
            {DAY_NAMES[schedule.day_of_week]}
          </span>
          <span style={{ color: '#666' }}>
            {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
          </span>
        </div>
      ))}
    </div>
  )
}
