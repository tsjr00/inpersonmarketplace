/**
 * Tax flag spec — the rule (owner 2026-09-26, option b): the PRODUCTION switch
 * is a committed constant; a Vercel env var may switch tax on for a
 * NON-production environment only, and production must ignore it even when
 * the variable is set there by mistake.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

async function loadFlags(env: { VERCEL_ENV?: string; TAX_STREAM1_STAGING?: string }) {
  vi.resetModules()
  vi.stubEnv('VERCEL_ENV', env.VERCEL_ENV ?? '')
  vi.stubEnv('TAX_STREAM1_STAGING', env.TAX_STREAM1_STAGING ?? '')
  if (env.VERCEL_ENV === undefined) delete process.env.VERCEL_ENV
  if (env.TAX_STREAM1_STAGING === undefined) delete process.env.TAX_STREAM1_STAGING
  return import('../flags')
}

beforeEach(() => { vi.resetModules() })
afterEach(() => { vi.unstubAllEnvs() })

describe('TAX_STREAM1 flags — production is a committed constant, staging is an env override', () => {
  it('production constant ships FALSE', async () => {
    const f = await loadFlags({})
    expect(f.TAX_STREAM1_PROD).toBe(false)
    expect(f.TAX_STREAM1_ENABLED).toBe(false)
  })
  it('a Preview deployment with TAX_STREAM1_STAGING=true is ON (the W13 rehearsal)', async () => {
    const f = await loadFlags({ VERCEL_ENV: 'preview', TAX_STREAM1_STAGING: 'true' })
    expect(f.TAX_STREAM1_STAGING_OVERRIDE).toBe(true)
    expect(f.TAX_STREAM1_ENABLED).toBe(true)
  })
  it('PRODUCTION ignores the variable even when it is set there', async () => {
    const f = await loadFlags({ VERCEL_ENV: 'production', TAX_STREAM1_STAGING: 'true' })
    expect(f.TAX_STREAM1_STAGING_OVERRIDE).toBe(false)
    expect(f.TAX_STREAM1_ENABLED).toBe(false)
  })
  it('the variable must be exactly "true" — anything else is off', async () => {
    expect((await loadFlags({ VERCEL_ENV: 'preview', TAX_STREAM1_STAGING: '1' })).TAX_STREAM1_ENABLED).toBe(false)
    expect((await loadFlags({ VERCEL_ENV: 'preview' })).TAX_STREAM1_ENABLED).toBe(false)
  })
})
