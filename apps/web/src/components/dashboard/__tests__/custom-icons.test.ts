/**
 * Custom icon overlay (owner 2026-10-09): the drawn set sits OVER the lucide
 * vocabulary; the library set stays complete as the fallback; the staging
 * override can never mount on production.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { DASHBOARD_ICONS } from '../icons'
import { CUSTOM_ICONS, DASHBOARD_ICON_SET, CUSTOM_TILE_ICON_SIZE, customIconCssVars, hasCustomIcon, hasCustomIconFor } from '../custom-icons'

const PUBLIC = path.resolve(__dirname, '../../../../public')
const SRC = path.resolve(__dirname, '../../..')

describe('custom icon overlay', () => {
  it('every name in the overlay is a real dashboard icon name (the library set stays the complete fallback)', () => {
    for (const name of Object.keys(CUSTOM_ICONS)) {
      expect(DASHBOARD_ICONS, `${name} is not in DASHBOARD_ICONS`).toHaveProperty(name)
    }
  })

  it('every file the overlay points at exists under public/', () => {
    for (const [name, byVertical] of Object.entries(CUSTOM_ICONS)) {
      for (const [vertical, files] of Object.entries(byVertical ?? {})) {
        for (const url of [files!.full, files!.small]) {
          expect(fs.existsSync(path.join(PUBLIC, url)), `${name}/${vertical}: ${url}`).toBe(true)
        }
      }
    }
  })

  it('the layout variables carry a url and the two display flags for exactly the names the vertical has', () => {
    const ft = customIconCssVars('food_trucks')
    expect(ft['--dash-icon-park-full']).toBe('url("/icons/custom/FoodTruckPark_Icon.png")')
    expect(ft['--dash-icon-park-small']).toBe('url("/icons/custom/FoodTruckPark_Icon_Small.png")')
    expect(ft['--dash-icon-park-has']).toBe('inline-block')
    expect(ft['--dash-icon-park-lib']).toBe('none')
    // booth is FM-only: no variable on food trucks → lucide shows there
    expect(ft['--dash-icon-booth-has']).toBeUndefined()
    const fm = customIconCssVars('farmers_market')
    expect(fm['--dash-icon-booth-has']).toBe('inline-block')
    expect(fm['--dash-icon-park-has']).toBeUndefined()
    expect(customIconCssVars('unknown')).toEqual({})
  })

  it('presence helpers agree with the table', () => {
    expect(hasCustomIcon('locations')).toBe(true)
    expect(hasCustomIcon('park')).toBe(false)
    expect(hasCustomIconFor('park', 'food_trucks')).toBe(true)
    expect(hasCustomIconFor('park', 'farmers_market')).toBe(false)
    expect(hasCustomIcon('orders')).toBe(false)
  })

  it('the switch and the tile size are the committed values', () => {
    expect(['custom', 'library']).toContain(DASHBOARD_ICON_SET)
    expect(CUSTOM_TILE_ICON_SIZE).toBeGreaterThanOrEqual(28)
  })

  it('the staging override mounts only off production, and the library rule can force lucide', () => {
    const layout = fs.readFileSync(path.join(SRC, 'app/[vertical]/layout.tsx'), 'utf-8')
    expect(layout).toContain("const iconOverrideEnabled = process.env.VERCEL_ENV !== 'production'")
    expect(layout).toContain('{iconOverrideEnabled && <IconSetOverride />}')
    expect(layout).toContain('data-icon-set={DASHBOARD_ICON_SET}')
    const css = fs.readFileSync(path.join(SRC, 'app/globals.css'), 'utf-8')
    expect(css).toContain('[data-icon-set="library"] .dash-icon-custom { display: none !important; }')
    expect(css).toContain('[data-icon-set="library"] .dash-icon-library { display: inline-block !important; }')
  })
})
