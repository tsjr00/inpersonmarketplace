import { describe, it, expect, vi } from 'vitest'
import { getVendorProfileForVertical } from '../getVendorProfile'

function mockSupabase(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  builder.eq = vi.fn(() => builder)
  builder.select = vi.fn(() => builder)
  builder.then = (
    onFulfilled: (value: { data: unknown; error: unknown }) => unknown
  ) => Promise.resolve(result).then(onFulfilled)

  return {
    from: vi.fn(() => builder),
    _builder: builder,
  }
}

describe('getVendorProfileForVertical', () => {
  it('returns the profile when user has exactly one vendor profile (no vertical param)', async () => {
    const supabase = mockSupabase({
      data: [{ id: 'vp-1', vertical_id: 'farmers_market' }],
      error: null,
    })

    const result = await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      null
    )

    expect(result.error).toBeNull()
    expect(result.profile).toEqual({ id: 'vp-1', vertical_id: 'farmers_market' })
  })

  it('returns the profile when user has exactly one and vertical param matches', async () => {
    const supabase = mockSupabase({
      data: [{ id: 'vp-1', vertical_id: 'farmers_market' }],
      error: null,
    })

    const result = await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      'farmers_market'
    )

    expect(result.error).toBeNull()
    expect(result.profile).toEqual({ id: 'vp-1', vertical_id: 'farmers_market' })
  })

  it('returns the matching profile when user has multiple profiles and vertical is specified', async () => {
    const supabase = mockSupabase({
      data: [{ id: 'vp-2', vertical_id: 'food_trucks' }],
      error: null,
    })

    const result = await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      'food_trucks'
    )

    expect(result.error).toBeNull()
    expect(result.profile).toEqual({ id: 'vp-2', vertical_id: 'food_trucks' })
  })

  it('returns disambiguation error when user has multiple profiles and vertical is missing', async () => {
    const supabase = mockSupabase({
      data: [
        { id: 'vp-1', vertical_id: 'farmers_market' },
        { id: 'vp-2', vertical_id: 'food_trucks' },
      ],
      error: null,
    })

    const result = await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      null
    )

    expect(result.profile).toBeNull()
    expect(result.error).toContain('multiple verticals')
    expect(result.error).toContain('farmers_market')
    expect(result.error).toContain('food_trucks')
    expect(result.error).toContain('vertical parameter is required')
  })

  it('returns not-found error when user has zero profiles and no vertical', async () => {
    const supabase = mockSupabase({ data: [], error: null })

    const result = await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      null
    )

    expect(result.profile).toBeNull()
    expect(result.error).toBe('vendor profile not found')
  })

  it('includes vertical in not-found error when specified vertical has no match', async () => {
    const supabase = mockSupabase({ data: [], error: null })

    const result = await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      'food_trucks'
    )

    expect(result.profile).toBeNull()
    expect(result.error).toBe("vendor profile not found for vertical 'food_trucks'")
  })

  it('returns error when supabase query fails', async () => {
    const supabase = mockSupabase({
      data: null,
      error: { message: 'connection refused' },
    })

    const result = await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      null
    )

    expect(result.profile).toBeNull()
    expect(result.error).toBe('connection refused')
  })

  it('automatically adds vertical_id to custom select fields', async () => {
    const supabase = mockSupabase({
      data: [{ id: 'vp-1', tier: 'pro', vertical_id: 'farmers_market' }],
      error: null,
    })

    await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      null,
      'id, tier'
    )

    const builder = (supabase as unknown as { _builder: { select: ReturnType<typeof vi.fn> } })._builder
    expect(builder.select).toHaveBeenCalledWith('id, tier, vertical_id')
  })

  it('does not duplicate vertical_id when already in select', async () => {
    const supabase = mockSupabase({
      data: [{ id: 'vp-1', vertical_id: 'farmers_market' }],
      error: null,
    })

    await getVendorProfileForVertical(
      supabase as never,
      'user-1',
      null,
      'id, vertical_id'
    )

    const builder = (supabase as unknown as { _builder: { select: ReturnType<typeof vi.fn> } })._builder
    expect(builder.select).toHaveBeenCalledWith('id, vertical_id')
  })
})
