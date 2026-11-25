# iCharge Office Hub

Work + HR app for iCharge staff. The full plan is in [SPEC.md](SPEC.md).

## Build status
- [x] Step 1a: foundation (theme, languages, email-code sign-in, access levels, RLS helpers, test accounts)
- [ ] Step 1b: access requests and invites
- [ ] Step 1c: phone app (PWA), quick sign-in, app updates

## Where things are
| What | Where |
|---|---|
| Database tables, access rules (RLS), sign-up email check | `supabase/migrations/` |
| Sign-in code email (English + 简体中文) | `supabase/templates/otp-code.html` |
| Screens | `src/app/` |
| Menu and who sees each item | `src/lib/nav.ts` |
| English / Chinese text | `messages/en.json`, `messages/zh-Hans.json` |
| Test accounts and test sign-in link (builder only, never deployed) | `scripts/seed.ts`, `scripts/test-login.ts` |

## Builder commands
```bash
npm run dev                 # run on http://localhost:3000
npm run seed                # create departments + the 5 test accounts
npm run test-login staff    # one-time sign-in link: manager | hr | finance | staff
```
Secrets go in `.env.local` (see `.env.example`). Never commit it.
