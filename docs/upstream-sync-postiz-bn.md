# Postiz Upstream Sync Strategy (Owned Codebase)

We keep this platform fully owned.  
So we do **controlled intake** from Postiz updates (not direct copy-paste replacement).

## Workflow
1. Run `scripts/check-postiz-upstream.ps1` to fetch latest release metadata.
2. Read release note and mark relevant modules (integrations, scheduler, billing ideas).
3. Re-implement useful changes in:
   - `cmd/api`
   - `cmd/worker`
   - `web`
4. Run smoke tests before merge:
   - payment session
   - subscription activation
   - auto-renew cycle
   - channel connect/list flow

## Why this model
- No vendor lock-in
- Full control over branding and roadmap
- Safer handling of breaking changes

## Command
```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-postiz-upstream.ps1
```
