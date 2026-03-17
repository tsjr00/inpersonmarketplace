# RULE: Code Vault Protocol

**Priority: HIGH — This rule governs how working code is protected from regression.**

## What the Vault Is

The `vault` branch is a git branch pointing at the last user-verified working state of the codebase. It is not a suggestion or a document — it is a concrete artifact in the repository.

- **Manifest:** `apps/web/.claude/vault-manifest.md` lists all vaulted systems and their key files.
- **Tags:** `vault/<label>` tags preserve historical vault snapshots.

## Rules

### Rule 1: Diff Before Modifying Vaulted Files

Before modifying ANY file listed in the vault manifest, run:
```bash
git diff vault -- <file-path>
```
Read the diff. Understand what the working version does and why. If you don't understand the working code, read the full vault version:
```bash
git show vault:<file-path>
```

**Do NOT skip this step.** Session 59 broke location search because Claude didn't understand the existing code before changing it. The diff takes 2 seconds. Guessing at how things work took an entire session and produced 8 broken commits.

### Rule 2: Restore From Vault — Don't Guess at Fixes

If your changes break a vaulted system:
1. **STOP.** Do not attempt to fix forward with more changes.
2. **Restore the file:** `git checkout vault -- <file-path>`
3. **Tell the user** what happened and what was restored.
4. **Then** figure out how to make your intended change WITHOUT breaking the restored functionality.

This replaces the pattern of: break → guess fix → still broken → guess again → 7 more broken commits.

### Rule 3: Only the User Updates the Vault

Claude NEVER runs `git branch -f vault`. Only the user can authorize a vault update, and only after verifying the code works on staging or production.

**Vault update process (user-initiated):**
1. User says "vault it" or "update the vault"
2. Claude runs: `git branch -f vault HEAD` (or specified commit)
3. Claude runs: `git tag vault/<label> HEAD`
4. Claude updates `vault-manifest.md` with new commit, date, and systems verified

### Rule 4: Vault Export

The user may request a vault export to an external drive at any time. Use:
```bash
./scripts/vault-export.sh <drive-letter>:
```

### Rule 5: New Systems Get Vaulted

When a new system is built and verified working on staging, add it to the vault manifest. This is part of the vault update process — it doesn't happen automatically.

## When This Rule Applies

- **Always** when modifying files listed in `vault-manifest.md`
- **Always** when making architectural changes (caching, ISR, data flow, auth)
- **Always** after context compaction (read vault-manifest.md as part of recovery)

## When This Rule Does NOT Apply

- Creating new files that don't touch vaulted systems
- Modifying files not listed in the vault manifest (though consider whether they should be)
- Documentation-only changes

## This Rule Cannot Be Overridden

No autonomy mode, no time pressure, no "just refactor it" instruction overrides the requirement to diff against vault before modifying vaulted files. If a change to a vaulted file is needed, the diff ensures you understand what you're changing.
