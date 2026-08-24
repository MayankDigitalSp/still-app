# Still — Meditation & Habit Companion

This is the complete first-version source package for **Still**, a responsive wellness PWA built with Next.js, TypeScript, Tailwind CSS, Supabase-ready authentication/data, and Capacitor configuration for Android packaging.

## Included

- 5/10/15/20/30/45/60 minute meditation presets and custom hours/minutes
- Preparation countdown, interval bells, start/finish bell, pause/resume/restart/end
- Refresh/tab-safe timer using absolute timestamps
- 10 ambient sound profiles, up to 3-layer mixing, preview, volume, saved mixes, silent mode
- Meditation streaks, longest streak, totals, averages, week/month progress, milestones
- Meditation calendar with intensity levels and selected-day session details
- Unlimited custom habits with icon, colour, schedule, target, reminder, separate calendar, current/longest streak, completion rates, edit/archive/delete
- Meditation partner UI with invite code, privacy controls, reactions, shared challenge, remove/block controls
- Post-session mood, rating, private note, sound combination, journal history
- Responsive desktop sidebar and mobile bottom navigation
- Light/dark calming themes, visible focus states, reduced-motion support, large touch targets
- Demo data and local persistence
- Supabase SQL schema with RLS, duplicate habit-entry protection, consent-oriented partner model, and privacy-safe partner stats function
- PWA manifest/service worker
- Capacitor Android configuration

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Demo mode
Without Supabase environment variables, any valid email plus a 6+ character password opens the local demo. Changes persist in local storage.

## Connect Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Add your project URL and anon key.
5. Enable Email and Google auth providers.
6. Add your deployed site to Auth redirect URLs.

## PWA build

```bash
npm run build
```

Static output is written to `out/`. Serve over HTTPS for installation and browser notification support.

## Android APK

The included `capacitor.config.ts` makes the project Android-wrapper ready.

On a machine with Android Studio / Android SDK:

```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

Then choose **Build > Build APK(s)** in Android Studio, or configure signing for a release APK/AAB.

## Audio note

The preview uses locally generated ambient sound layers so the project is self-contained and copyright-safe. For a store release, swap these for properly licensed looping audio files in Supabase Storage for higher fidelity and better media-session behavior.

## Production data wiring

The app is fully interactive in demo mode. Supabase auth is wired directly; the SQL schema/RLS is ready. For a full cloud deployment, map the existing session/habit/partner state actions to the supplied tables and add Supabase Realtime subscriptions for `connections`, `shared_challenges`, and `reactions`.
