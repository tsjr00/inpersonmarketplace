/**
 * T-11: Inventory Restore Vertical Awareness Test
 *
 * Business Rule (Session 62, decisions.md):
 * - FT fulfilled items do NOT restore inventory (cooked food can't be resold)
 * - FM fulfilled items DO restore inventory (produce/goods can potentially be resold)
 * - Non-fulfilled items ALWAYS restore regardless of vertical
 *
 * Reference implementation: resolve-issue route (lines 158-166)
 *
 * IMPORTANT: These tests assert what the business rule REQUIRES.
 * If a test fails, investigate the code — do NOT change the test.
 * See CLAUDE.md "ABSOLUTE RULE" section.
 *
 * Run: npx vitest run src/lib/__tests__/inventory-restore.test.ts
 */
import { describe, it, expect } from 'vitest'
import { shouldRestoreInventory } from '@/lib/inventory-rules'

describe('T-11: Inventory restore vertical awareness', () => {
  // =========================================================================
  // Food Trucks — cooked food can't be resold
  // =========================================================================

  describe('food_trucks vertical', () => {
    it('fulfilled item → DO NOT restore (cooked food)', () => {
      expect(shouldRestoreInventory('fulfilled', 'food_trucks')).toBe(false)
    })

    it('pending item → restore', () => {
      expect(shouldRestoreInventory('pending', 'food_trucks')).toBe(true)
    })

    it('confirmed item → restore', () => {
      expect(shouldRestoreInventory('confirmed', 'food_trucks')).toBe(true)
    })

    it('ready item → restore', () => {
      expect(shouldRestoreInventory('ready', 'food_trucks')).toBe(true)
    })

    it('cancelled item → restore', () => {
      expect(shouldRestoreInventory('cancelled', 'food_trucks')).toBe(true)
    })
  })

  // =========================================================================
  // Farmers Market — produce/goods can potentially be resold
  // =========================================================================

  describe('farmers_market vertical', () => {
    it('fulfilled item → restore (produce can be resold)', () => {
      expect(shouldRestoreInventory('fulfilled', 'farmers_market')).toBe(true)
    })

    it('pending item → restore', () => {
      expect(shouldRestoreInventory('pending', 'farmers_market')).toBe(true)
    })

    it('confirmed item → restore', () => {
      expect(shouldRestoreInventory('confirmed', 'farmers_market')).toBe(true)
    })

    it('ready item → restore', () => {
      expect(shouldRestoreInventory('ready', 'farmers_market')).toBe(true)
    })
  })

  // =========================================================================
  // Cross-vertical consistency
  // =========================================================================

  describe('cross-vertical rules', () => {
    it('only FT + fulfilled = no restore; every other combo restores', () => {
      const verticals = ['food_trucks', 'farmers_market', 'fire_works']
      const statuses = ['pending', 'confirmed', 'ready', 'fulfilled', 'cancelled']

      for (const vertical of verticals) {
        for (const status of statuses) {
          const result = shouldRestoreInventory(status, vertical)
          if (status === 'fulfilled' && vertical === 'food_trucks') {
            expect(result).toBe(false)
          } else {
            expect(result).toBe(true)
          }
        }
      }
    })

    it('fire_works fulfilled → restore (same as FM — not cooked)', () => {
      expect(shouldRestoreInventory('fulfilled', 'fire_works')).toBe(true)
    })

    it('unknown vertical fulfilled → restore (safe default)', () => {
      expect(shouldRestoreInventory('fulfilled', 'some_new_vertical')).toBe(true)
    })
  })
})
