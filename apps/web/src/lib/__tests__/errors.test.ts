import { describe, it, expect } from 'vitest'
import { TracedError } from '@/lib/errors/traced-error'
import { getHttpStatus } from '@/lib/errors/types'

describe('TracedError', () => {
  it('creates error with code and message', () => {
    const err = new TracedError('ERR_AUTH_001', 'Not authenticated')

    expect(err.code).toBe('ERR_AUTH_001')
    expect(err.message).toBe('Not authenticated')
    expect(err.traceId).toBeTruthy()
    expect(err.timestamp).toBeGreaterThan(0)
  })

  it('generates unique trace IDs', () => {
    const err1 = new TracedError('ERR_TEST_001', 'Error 1')
    const err2 = new TracedError('ERR_TEST_002', 'Error 2')

    expect(err1.traceId).not.toBe(err2.traceId)
  })

  it('includes context data', () => {
    const err = new TracedError('ERR_DB_001', 'Query failed', {
      table: 'orders',
      operation: 'select',
    })

    expect(err.context.table).toBe('orders')
    expect(err.context.operation).toBe('select')
  })

  it('toResponse includes traceId and code', () => {
    const err = new TracedError('ERR_AUTH_001', 'Not authenticated')
    const response = err.toResponse(false)

    expect(response.error).toBe('Not authenticated')
    expect(response.traceId).toBe(err.traceId)
    expect(response.code).toBe('ERR_AUTH_001')
    // Should NOT include details in production mode
    expect(response.details).toBeUndefined()
  })

  it('toResponse includes details in dev mode when pgDetail present', () => {
    const err = new TracedError('ERR_RLS_001', 'Access denied', {
      pgDetail: 'policy "orders_select" failed'
    })
    const response = err.toResponse(true) // showDetails=true

    expect(response.details).toBe('policy "orders_select" failed')
  })

  it('fromUnknown wraps plain errors', () => {
    const original = new Error('Something went wrong')
    const traced = TracedError.fromUnknown(original)

    expect(traced.code).toBe('ERR_UNKNOWN_001')
    expect(traced.message).toBe('Something went wrong')
  })

  it('fromUnknown passes through TracedError unchanged', () => {
    const original = new TracedError('ERR_AUTH_001', 'Auth failed')
    const result = TracedError.fromUnknown(original)

    expect(result).toBe(original)
  })
})

describe('getHttpStatus', () => {
  it('maps auth errors to 401', () => {
    expect(getHttpStatus('ERR_AUTH_001')).toBe(401)
  })

  it('maps RLS recursion to 500', () => {
    expect(getHttpStatus('ERR_RLS_001')).toBe(500)
  })

  it('maps RLS access denied to 403', () => {
    expect(getHttpStatus('ERR_RLS_002')).toBe(403)
  })

  it('defaults unknown codes to 500', () => {
    expect(getHttpStatus('ERR_UNKNOWN_999')).toBe(500)
  })
})
