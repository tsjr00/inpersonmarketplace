#!/usr/bin/env node
/**
 * PreToolUse hook: deny-once-then-allow gate for Edit/Write on protected paths.
 *
 * Wired in .claude/settings.json (repo root). Reads the hook JSON from stdin and
 * checks tool_input.file_path against apps/web/.claude/protected-paths.txt
 * (substring match, case-insensitive, forward-slash normalized; optional
 * " :: hint" suffix per entry names the governing decision).
 *
 * DESIGN (Session 92, user-directed): the gate redirects CLAUDE, not the user.
 * The FIRST attempt to touch a protected file in a session is DENIED with an
 * instruction fed back to Claude: read the named decision, verify the change
 * against it (including feature-flag state), then retry. The retry — and any
 * later edit to the same file this session — passes through to the normal
 * permission flow. The user is only involved if Claude surfaces a conflict.
 *
 * Fail-open by design: any internal error exits 0 with no output so a broken
 * hook can't block all editing — the rule files remain the next defense layer.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

function normalize(p) {
  return String(p).replace(/\\/g, '/').toLowerCase()
}

try {
  const input = JSON.parse(readFileSync(0, 'utf8'))
  const filePath = input?.tool_input?.file_path
  if (!filePath) process.exit(0)

  const listPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../.claude/protected-paths.txt'
  )
  const entries = readFileSync(listPath, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const [path, ...hint] = l.split('::')
      return { path: normalize(path.trim()), hint: hint.join('::').trim() }
    })

  const target = normalize(filePath)
  const hit = entries.find(e => target.includes(e.path))
  if (!hit) process.exit(0)

  // Deny only the FIRST attempt per (session, file) — the conscious retry passes.
  const sessionId = String(input.session_id || 'unknown')
  const stateDir = join(tmpdir(), 'claude-protected-paths')
  const marker = join(stateDir, createHash('sha1').update(`${sessionId}|${target}`).digest('hex'))
  if (existsSync(marker)) process.exit(0)
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(marker, target)

  const hintText = hit.hint || 'apps/web/.claude/decisions.md (search for this file/feature)'
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `PROTECTED PATH — first attempt this session blocked (matched "${hit.path}"). ` +
        `Before retrying, Claude must: (1) READ the governing decision: ${hintText}. ` +
        `(2) VERIFY the planned change is consistent with it — including feature-flag state ` +
        `(e.g. EXTERNAL_PAYMENTS_ENABLED in src/lib/constants.ts) and any required user approval ` +
        `(critical-path files need file-level approval per change-discipline.md Rule 3). ` +
        `(3) If consistent and approved, RETRY the same edit — it will proceed. ` +
        `If there is a conflict, STOP and present it to the user instead of editing.`
    }
  }))
} catch {
  process.exit(0)
}
