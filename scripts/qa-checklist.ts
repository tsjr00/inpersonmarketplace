/**
 * S-6: Pre-commit QA Checklist Script
 *
 * Scans the codebase for common quality issues:
 * 1. API routes missing withErrorTracing
 * 2. API routes missing auth checks
 * 3. console.log in production code
 * 4. Hardcoded hex colors outside design tokens
 * 5. API routes missing vertical isolation
 *
 * Run: npx tsx scripts/qa-checklist.ts
 */

import fs from 'fs'
import path from 'path'

const WEB_SRC = path.join(__dirname, '..', 'apps', 'web', 'src')

// ── Helpers ─────────────────────────────────────────────

function getAllFiles(dir: string, ext: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules, __tests__, .next
      if (['node_modules', '.next', '__tests__', '__mocks__'].includes(entry.name)) continue
      results.push(...getAllFiles(full, ext))
    } else if (entry.name.endsWith(ext)) {
      results.push(full)
    }
  }
  return results
}

function relativePath(filepath: string): string {
  return path.relative(path.join(__dirname, '..', 'apps', 'web'), filepath).replace(/\\/g, '/')
}

interface Issue {
  file: string
  check: string
  detail: string
}

const issues: Issue[] = []
const stats = {
  routesChecked: 0,
  errorTracingMissing: 0,
  authMissing: 0,
  consoleLogFound: 0,
  hardcodedColors: 0,
  verticalIsolation: 0,
}

// ── Check 1: withErrorTracing ───────────────────────────

function checkErrorTracing() {
  const apiDir = path.join(WEB_SRC, 'app', 'api')
  const routeFiles = getAllFiles(apiDir, 'route.ts')
  stats.routesChecked = routeFiles.length

  for (const file of routeFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const rel = relativePath(file)

    // Check for exported HTTP methods
    const hasExport = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/g.test(content)
    if (!hasExport) continue

    if (!content.includes('withErrorTracing')) {
      issues.push({ file: rel, check: 'error-tracing', detail: 'Missing withErrorTracing wrapper' })
      stats.errorTracingMissing++
    }
  }
}

// ── Check 2: Auth checks ────────────────────────────────

function checkAuth() {
  const apiDir = path.join(WEB_SRC, 'app', 'api')
  const routeFiles = getAllFiles(apiDir, 'route.ts')

  // Routes that legitimately skip auth
  const authExempt = [
    'api/cron',        // Cron jobs use CRON_SECRET
    'api/webhooks',    // Webhooks use signature verification
    'api/stripe',      // Stripe webhooks
    'api/health',      // Health checks
    'api/submit',      // Public vendor signup
    'api/marketing',   // Public activity feed
  ]

  for (const file of routeFiles) {
    const content = fs.readFileSync(file, 'utf-8')
    const rel = relativePath(file)

    // Skip exempt routes
    if (authExempt.some(exempt => rel.includes(exempt))) continue

    const hasAuth = content.includes('auth.getUser()') ||
                    content.includes('getUser()') ||
                    content.includes('CRON_SECRET') ||
                    content.includes('stripe.webhooks.constructEvent')

    if (!hasAuth) {
      issues.push({ file: rel, check: 'auth', detail: 'No auth.getUser() or equivalent found' })
      stats.authMissing++
    }
  }
}

// ── Check 3: console.log ────────────────────────────────

function checkConsoleLogs() {
  const tsFiles = getAllFiles(WEB_SRC, '.ts')
    .concat(getAllFiles(WEB_SRC, '.tsx'))

  // Files where console.log is intentional
  const exempt = [
    'error-catalog.ts',
    'resolution-tracker.ts',
    'logger.ts',
    'with-error-tracing.ts',
  ]

  for (const file of tsFiles) {
    const basename = path.basename(file)
    if (exempt.includes(basename)) continue

    const content = fs.readFileSync(file, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Match console.log but not console.error or console.warn (those are OK)
      if (/console\.log\s*\(/.test(line) && !line.trim().startsWith('//')) {
        issues.push({
          file: relativePath(file),
          check: 'console-log',
          detail: `Line ${i + 1}: ${line.trim().substring(0, 80)}`,
        })
        stats.consoleLogFound++
      }
    }
  }
}

// ── Check 4: Hardcoded colors ───────────────────────────

function checkHardcodedColors() {
  const tsxFiles = getAllFiles(WEB_SRC, '.tsx')

  // Files where hardcoded colors are expected
  const exempt = [
    'design-tokens.ts',
    'globals.css',
    'branding',  // branding directory
  ]

  // Regex for hex colors in style attributes
  const hexColorRegex = /#[0-9a-fA-F]{6}\b/g

  for (const file of tsxFiles) {
    const rel = relativePath(file)
    if (exempt.some(e => rel.includes(e))) continue

    const content = fs.readFileSync(file, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].match(hexColorRegex)
      if (matches) {
        // Only flag if it's in a style context (not a comment or string constant)
        const line = lines[i]
        if (line.includes('style') || line.includes('color') || line.includes('background') || line.includes('border')) {
          for (const match of matches) {
            issues.push({
              file: rel,
              check: 'hardcoded-color',
              detail: `Line ${i + 1}: ${match} — consider using design tokens`,
            })
            stats.hardcodedColors++
          }
        }
      }
    }
  }
}

// ── Check 5: Vertical isolation ─────────────────────────

function checkVerticalIsolation() {
  const apiDir = path.join(WEB_SRC, 'app', 'api')
  const routeFiles = getAllFiles(apiDir, 'route.ts')

  // Routes that should have vertical filtering
  const verticalRoutes = ['vendor', 'buyer', 'listings', 'orders', 'markets']

  // Routes exempt from vertical check
  const exempt = ['api/cron', 'api/webhooks', 'api/stripe', 'api/admin', 'api/health']

  for (const file of routeFiles) {
    const rel = relativePath(file)
    if (exempt.some(e => rel.includes(e))) continue

    // Only check routes in vertical-relevant paths
    if (!verticalRoutes.some(v => rel.includes(v))) continue

    const content = fs.readFileSync(file, 'utf-8')

    const hasVerticalFilter = content.includes("vertical_id") ||
                              content.includes("vertical") && content.includes(".eq(")

    if (!hasVerticalFilter) {
      issues.push({
        file: rel,
        check: 'vertical-isolation',
        detail: 'No vertical_id filter found — may return cross-vertical data',
      })
      stats.verticalIsolation++
    }
  }
}

// ── Run All Checks ──────────────────────────────────────

console.log('\n🔍 QA Checklist — Scanning codebase...\n')

checkErrorTracing()
checkAuth()
checkConsoleLogs()
checkHardcodedColors()
checkVerticalIsolation()

// ── Report ──────────────────────────────────────────────

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  QA CHECKLIST RESULTS')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`  API routes scanned:        ${stats.routesChecked}`)
console.log(`  Error tracing missing:     ${stats.errorTracingMissing} ${stats.errorTracingMissing === 0 ? '✅' : '⚠️'}`)
console.log(`  Auth checks missing:       ${stats.authMissing} ${stats.authMissing === 0 ? '✅' : '⚠️'}`)
console.log(`  console.log found:         ${stats.consoleLogFound} ${stats.consoleLogFound === 0 ? '✅' : '⚠️'}`)
console.log(`  Hardcoded colors:          ${stats.hardcodedColors} (informational)`)
console.log(`  Vertical isolation gaps:   ${stats.verticalIsolation} ${stats.verticalIsolation === 0 ? '✅' : '⚠️'}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

if (issues.length > 0) {
  console.log(`\n📋 ${issues.length} issues found:\n`)

  const grouped: Record<string, Issue[]> = {}
  for (const issue of issues) {
    if (!grouped[issue.check]) grouped[issue.check] = []
    grouped[issue.check].push(issue)
  }

  for (const [check, checkIssues] of Object.entries(grouped)) {
    console.log(`\n── ${check.toUpperCase()} (${checkIssues.length}) ──`)
    for (const issue of checkIssues.slice(0, 20)) {
      console.log(`  ${issue.file}`)
      console.log(`    ${issue.detail}`)
    }
    if (checkIssues.length > 20) {
      console.log(`  ... and ${checkIssues.length - 20} more`)
    }
  }
}

const criticalCount = stats.errorTracingMissing + stats.authMissing
console.log(`\n${criticalCount === 0 ? '✅ All critical checks passed!' : `⚠️  ${criticalCount} critical issue(s) need attention.`}\n`)

process.exit(criticalCount > 0 ? 1 : 0)
