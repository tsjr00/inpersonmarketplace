import { describe, it, expect } from 'vitest'
import {
  tierLabels,
  describeTierLabels,
  validateTierLabelsInput,
  parseLabelList,
  labelsInputFromBody,
  labelColumnsFor,
  friendlyTierLabelError,
  validateBoothInventoryInput,
} from '../booth-types'

/**
 * Booth numbering Option U (owner 2026-09-20, booth_numbering_design.md).
 * The TS side mirrors mig 258: a tier's labels are a RANGE (prefix + first…last)
 * or a LIST; a new ("lettered") market must use lettered ranges; an "existing"
 * market keeps its own labels verbatim. These are the manager-facing rules
 * (N-5 shape · N-10 scheme); overlap and occupancy live in the DB trigger.
 */

describe('tierLabels — the TS mirror of booth_tier_labels()', () => {
  it('materializes a lettered range in order', () => {
    expect(tierLabels({ label_prefix: 'A', label_start: 1, label_end: 4 })).toEqual(['A1', 'A2', 'A3', 'A4'])
  })
  it('materializes a plain-number range (empty prefix)', () => {
    expect(tierLabels({ label_prefix: '', label_start: 21, label_end: 23 })).toEqual(['21', '22', '23'])
    expect(tierLabels({ label_prefix: null, label_start: 5, label_end: 5 })).toEqual(['5'])
  })
  it('returns the list verbatim, in order', () => {
    expect(tierLabels({ labels: ['Pavilion', 'Corner', 'East-1'] })).toEqual(['Pavilion', 'Corner', 'East-1'])
  })
  it('a tier with no labels has no slots (not bookable, N-7)', () => {
    expect(tierLabels({})).toEqual([])
    expect(tierLabels({ label_prefix: 'A', label_start: null, label_end: null })).toEqual([])
    expect(tierLabels({ label_start: 4, label_end: 2 })).toEqual([])
  })
})

describe('describeTierLabels — the map line', () => {
  it('ranges read first–last with the prefix on both ends', () => {
    expect(describeTierLabels({ label_prefix: 'A', label_start: 1, label_end: 4 })).toBe('A1–A4')
    expect(describeTierLabels({ label_prefix: '', label_start: 7, label_end: 7 })).toBe('7')
  })
  it('lists read as written, abbreviated past six', () => {
    expect(describeTierLabels({ labels: ['3', '5', '7'] })).toBe('3, 5, 7')
    expect(describeTierLabels({ labels: ['1', '2', '3', '4', '5', '6', '7'] })).toBe('1, 2, 3, 4, 5, … (7)')
  })
  it('is empty for an unnumbered tier', () => {
    expect(describeTierLabels({})).toBe('')
  })
})

describe('validateTierLabelsInput — scheme rules (N-10)', () => {
  it('a lettered market requires a letter prefix and a range', () => {
    expect(validateTierLabelsInput({ shape: 'range', prefix: 'A', start: 1, end: 4 }, 'lettered')).toBeNull()
    expect(validateTierLabelsInput({ shape: 'range', prefix: '', start: 1, end: 4 }, 'lettered')).toMatch(/letter/)
    expect(validateTierLabelsInput({ shape: 'range', prefix: 'Row-', start: 1, end: 4 }, 'lettered')).toMatch(/letter/)
    expect(validateTierLabelsInput({ shape: 'list', labels: ['Pavilion'] }, 'lettered')).toMatch(/lettered range/)
  })
  it('an existing market may use any prefix, none, or a list', () => {
    expect(validateTierLabelsInput({ shape: 'range', prefix: '', start: 21, end: 40 }, 'existing')).toBeNull()
    expect(validateTierLabelsInput({ shape: 'range', prefix: 'Row-A ', start: 1, end: 12 }, 'existing')).toBeNull()
    expect(validateTierLabelsInput({ shape: 'list', labels: ['Pavilion', 'Corner'] }, 'existing')).toBeNull()
  })
  it('the scheme must be answered before numbering', () => {
    expect(validateTierLabelsInput({ shape: 'range', prefix: 'A', start: 1, end: 4 }, null)).toMatch(/new market or existing/)
  })
  it('no labels is always allowed (a tier waiting to be numbered)', () => {
    expect(validateTierLabelsInput(null, null)).toBeNull()
  })
  it('shape rules: order, size, duplicates, blanks', () => {
    expect(validateTierLabelsInput({ shape: 'range', prefix: 'A', start: 4, end: 1 }, 'lettered')).toMatch(/before/)
    expect(validateTierLabelsInput({ shape: 'range', prefix: 'A', start: 1, end: 600 }, 'lettered')).toMatch(/500/)
    expect(validateTierLabelsInput({ shape: 'list', labels: ['3', '3'] }, 'existing')).toMatch(/twice/)
    expect(validateTierLabelsInput({ shape: 'list', labels: [' ', ''] }, 'existing')).toMatch(/at least one/)
  })
})

describe('request plumbing', () => {
  it('parseLabelList splits on commas and newlines and trims', () => {
    expect(parseLabelList(' 3, 5 ,7\nPavilion ,, ')).toEqual(['3', '5', '7', 'Pavilion'])
  })
  it('labelsInputFromBody reads both shapes and ignores junk', () => {
    expect(labelsInputFromBody({ labels: { shape: 'range', prefix: ' A ', start: '1', end: '4' } })).toEqual({ shape: 'range', prefix: 'A', start: 1, end: 4 })
    expect(labelsInputFromBody({ labels: { shape: 'list', labels: ['x', 2, 'y'] } })).toEqual({ shape: 'list', labels: ['x', 'y'] })
    expect(labelsInputFromBody({ labels: { shape: 'other' } })).toBeNull()
    expect(labelsInputFromBody({})).toBeNull()
  })
  it('labelColumnsFor writes exactly one shape, the other NULL', () => {
    expect(labelColumnsFor({ shape: 'range', prefix: 'B', start: 1, end: 3 })).toEqual({ label_prefix: 'B', label_start: 1, label_end: 3, labels: null })
    expect(labelColumnsFor({ shape: 'list', labels: [' Pavilion ', '', 'Corner'] })).toEqual({ label_prefix: null, label_start: null, label_end: null, labels: ['Pavilion', 'Corner'] })
    expect(labelColumnsFor(null)).toEqual({ label_prefix: null, label_start: null, label_end: null, labels: null })
  })
  it('count is not validated when labels are given (the trigger derives it)', () => {
    expect(validateBoothInventoryInput({ size_label: 'Small', count: -5, weekly_price_cents: 1000, labels: { shape: 'range', prefix: 'A', start: 1, end: 4 } })).toBeNull()
    expect(validateBoothInventoryInput({ size_label: 'Small', count: -5, weekly_price_cents: 1000 })).toMatch(/Count/)
  })
})

describe('friendlyTierLabelError — trigger codes in the manager\'s words', () => {
  it('strips the code prefix and keeps the DB\'s specifics', () => {
    expect(friendlyTierLabelError('P0010', 'TIER_LABEL_OVERLAP: A3 is already a Medium booth', 'Small')).toBe('A3 is already a Medium booth')
    expect(friendlyTierLabelError('P0011', 'TIER_LABEL_OCCUPIED: B3 is still held or booked — free it before removing it from this size', 'Medium'))
      .toMatch(/^B3 is still held or booked.*Medium numbers\.$/)
    expect(friendlyTierLabelError('P0014', 'SCHEME_REQUIRED', 'Small')).toMatch(/new market or existing/)
  })
  it('is null for codes that are not ours', () => {
    expect(friendlyTierLabelError('23505', 'duplicate key', 'Small')).toBeNull()
    expect(friendlyTierLabelError(undefined, undefined, 'Small')).toBeNull()
  })
})
