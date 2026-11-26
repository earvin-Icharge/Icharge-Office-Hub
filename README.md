# iCharge Office Hub

Work + HR app for iCharge staff. The full plan is in [SPEC.md](SPEC.md).

## Build status
All steps 1–12 of SPEC.md are built (version 1.0.0). Live at icharge-office-hub.vercel.app since 25 Nov 2026. Android app: direct download at /download (see mobile/README.md). Step 13 store apps (Capacitor) stay optional.

Done: Supabase SMTP (sign-in codes) and Vercel env `RESEND_API_KEY` (app emails).

## Still to do (needs the owner)
| Item | Why |
|---|---|
| Verify icharge.com.ph in Resend (DNS records), then set the sender in Supabase SMTP and Vercel env `EMAIL_FROM` | Codes and emails reach every staff inbox, not only earvin@ |
| Settings: office pin, field sites, CEO, iScreen BD commission % | Location checks, leave approval, BD plan |
| Deactivate the four plus-address test accounts | Spec 14.1 |

## Where things are
| What | Where |
|---|---|
| Database tables, access rules (RLS), sign-up email check | `supabase/migrations/` |
| Sign-in code email (English + 简体中文) | `supabase/templates/otp-code.html` |
| Screens | `src/app/` |
| Menu and who sees each item | `src/lib/nav.ts` |
| English / Chinese text | `messages/en.json`, `messages/zh-Hans.json` |
| Test accounts and test sign-in link (builder only, never deployed) | `scripts/seed.ts`, `scripts/test-login.ts` |
| Apply a database file (builder only) | `scripts/db-apply.sh` |

## Builder commands
```bash
npm run dev                 # run on http://localhost:3000
npm run seed                # create departments + the 5 test accounts
npm run test-login staff    # one-time sign-in link: manager | hr | finance | staff
```
Secrets go in `.env.local` (see `.env.example`). Never commit it.

## Releasing a new version
1. Raise `APP_VERSION` in `src/lib/version.ts`.
2. Add a row to `app_releases` with the same version and What's new (English + 简体中文).
3. Push to a branch: Vercel makes a private test link. Check it.
4. Merge to `main`: it goes live, and open apps show "New version ready · Update now".
5. Problem? Vercel › Deployments › previous one › Instant Rollback.
