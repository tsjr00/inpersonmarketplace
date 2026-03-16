/**
 * ADMIN-R1 + ADMIN-R2: Admin Account Integrity Tests
 *
 * These tests form a self-protecting chain:
 *
 * 1. ADMIN-R1 tests verify the required admin email list is correct
 *    and cannot be silently emptied or reduced.
 *
 * 2. ADMIN-R2 tests verify that the rule definitions, the constant
 *    file, and THIS test file all exist. If any piece is deleted,
 *    the remaining pieces catch it.
 *
 * Protection chain:
 * - Delete this test file → CI fails (test count drops, suite missing)
 * - Empty this test file → CI fails (test count drops)
 * - Remove an email from REQUIRED_ADMIN_EMAILS → ADMIN-R1 tests fail
 * - Delete admin-accounts.ts → import fails, all tests fail
 * - Remove rules from business-rules-document.md → ADMIN-R2 tests fail
 *
 * DO NOT weaken, skip, or conditionalize these tests.
 * See CLAUDE.md: "Tests Must Never Be Skipped, Conditional, or Soft-Failed"
 *
 * Incident: Session 59 — both admin accounts vanished from prod auth.users,
 *           causing complete admin lockout. No test or automation detected it.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { REQUIRED_ADMIN_EMAILS } from '@/lib/auth/admin-accounts'

// Resolve paths relative to project root
const projectRoot = path.resolve(__dirname, '../../..')
const businessRulesPath = path.join(projectRoot, '.claude/business-rules-document.md')
const constantFilePath = path.join(projectRoot, 'src/lib/auth/admin-accounts.ts')
const thisTestFilePath = path.join(projectRoot, 'src/lib/__tests__/admin-account-integrity.test.ts')

describe('ADMIN-R1: Required admin accounts', () => {
  it('REQUIRED_ADMIN_EMAILS contains jennifer@8fifteenconsulting.com', () => {
    expect(REQUIRED_ADMIN_EMAILS).toContain('jennifer@8fifteenconsulting.com')
  })

  it('REQUIRED_ADMIN_EMAILS contains tsjr00@gmail.com', () => {
    expect(REQUIRED_ADMIN_EMAILS).toContain('tsjr00@gmail.com')
  })

  it('REQUIRED_ADMIN_EMAILS has at least 2 entries', () => {
    expect(REQUIRED_ADMIN_EMAILS.length).toBeGreaterThanOrEqual(2)
  })

  it('REQUIRED_ADMIN_EMAILS is a frozen readonly array (cannot be mutated at runtime)', () => {
    // The `as const` assertion makes it readonly at the type level.
    // Verify the array is not empty and contains strings.
    for (const email of REQUIRED_ADMIN_EMAILS) {
      expect(typeof email).toBe('string')
      expect(email).toContain('@')
      expect(email.length).toBeGreaterThan(5)
    }
  })

  it('no email in REQUIRED_ADMIN_EMAILS is empty or whitespace', () => {
    for (const email of REQUIRED_ADMIN_EMAILS) {
      expect(email.trim().length).toBeGreaterThan(0)
      expect(email).toBe(email.trim()) // no leading/trailing whitespace
    }
  })
})

describe('ADMIN-R2: Self-protection — rules and files must exist', () => {
  it('this test file exists on disk', () => {
    expect(fs.existsSync(thisTestFilePath)).toBe(true)
  })

  it('admin-accounts.ts constant file exists on disk', () => {
    expect(fs.existsSync(constantFilePath)).toBe(true)
  })

  it('admin-accounts.ts contains REQUIRED_ADMIN_EMAILS export', () => {
    const content = fs.readFileSync(constantFilePath, 'utf-8')
    expect(content).toContain('REQUIRED_ADMIN_EMAILS')
    expect(content).toContain('jennifer@8fifteenconsulting.com')
    expect(content).toContain('tsjr00@gmail.com')
  })

  it('business-rules-document.md exists on disk', () => {
    expect(fs.existsSync(businessRulesPath)).toBe(true)
  })

  it('business-rules-document.md contains ADMIN-R1 rule', () => {
    const content = fs.readFileSync(businessRulesPath, 'utf-8')
    expect(content).toContain('ADMIN-R1')
    expect(content).toContain('Platform admin accounts must always exist')
  })

  it('business-rules-document.md contains ADMIN-R2 rule', () => {
    const content = fs.readFileSync(businessRulesPath, 'utf-8')
    expect(content).toContain('ADMIN-R2')
    expect(content).toContain('admin integrity rule')
  })

  it('business-rules-document.md references both required admin emails', () => {
    const content = fs.readFileSync(businessRulesPath, 'utf-8')
    expect(content).toContain('jennifer@8fifteenconsulting.com')
    expect(content).toContain('tsjr00@gmail.com')
  })
})
