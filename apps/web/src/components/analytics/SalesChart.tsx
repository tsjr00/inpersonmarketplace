'use client'

import React from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

interface TrendData {
  date: string
  revenue: number
  orders: number
}

interface SalesChartProps {
  data: TrendData[]
  metric: 'revenue' | 'orders'
  primaryColor?: string
}

export default function SalesChart({
  data,
  metric,
  primaryColor = '#2563eb'
}: SalesChartProps) {
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const chartData = {
    labels: data.map(d => formatDate(d.date)),
    datasets: [
      {
        label: metric === 'revenue' ? 'Revenue' : 'Orders',
        data: data.map(d => metric === 'revenue' ? d.revenue / 100 : d.orders),
        borderColor: primaryColor,
        backgroundColor: `${primaryColor}20`,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: function(context: any) {
            const value = context.parsed?.y ?? 0
            if (metric === 'revenue') {
              return `Revenue: $${value.toFixed(2)}`
            }
            return `Orders: ${value}`
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: '#e5e7eb'
        },
        ticks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          callback: function(tickValue: any) {
            const value = typeof tickValue === 'string' ? parseFloat(tickValue) : tickValue
            if (metric === 'revenue') {
              return `$${value}`
            }
            return value
          }
        }
      }
    }
  }

  if (data.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 300,
        backgroundColor: '#f9fafb',
        borderRadius: 8,
        color: '#6b7280'
      }}>
        No data available for this period
      </div>
    )
  }

  return (
    <div style={{ height: 300 }}>
      <Line data={chartData} options={options} />
    </div>
  )
}
