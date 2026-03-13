# Postiz আপডেট আমাদের সিস্টেমে আনার স্ট্র্যাটেজি

আমরা এখন **নিজস্ব কোডবেস** চালাবো। Postiz থেকে direct copy না করে controlled intake করবো।

## Workflow
1. `scripts/check-postiz-upstream.ps1` চালিয়ে latest release metadata আনুন।
2. release note দেখে relevant module list তৈরি করুন (UI, scheduler, integrations, billing impact)।
3. শুধুমাত্র দরকারি ধারণা/প্যাটার্ন `api/`, `worker/`, `web/` এ নিজের architecture অনুযায়ী implement করুন।
4. নতুন feature merge করার আগে smoke test করুন:
   - payment session
   - subscription activation
   - auto-renew worker
   - channel connect flow

## কেন এই approach
- vendor lock-in কমে
- নিজের branding + product direction কন্ট্রোল থাকে
- breaking changes isolate করা সহজ হয়

## Command
```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-postiz-upstream.ps1
```
