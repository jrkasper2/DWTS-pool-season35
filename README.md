# Mirrorball Pool — Dancing With the Stars Season 35 🪩

A mobile-friendly, fan-made prediction game for Julia's friend group.

## What players do

Each week, players predict:

- every judge's individual paddle score for each active couple
- the couple's total score, calculated automatically from the judge picks
- the highest-scoring couple of the episode
- the eliminated couple

Once a prediction is locked, it cannot be edited. Players can keep making any still-open picks through the live episode until the episode ends. Everyone else's picks stay hidden until the episode is over.

## Scoring

- Exact couple total: **5 points**
- 1 point away: **3 points**
- 2 points away: **1 point**
- Exact individual judge: **+1 point per judge**
- Correct highest-scoring couple: **+5 points**
- Correct elimination: **+5 points**

The scoring rules are shown during first-time onboarding and can also be reopened from the player's profile.

## Accounts

On the first visit, a player enters:

- first name
- last name
- unique username
- 4-digit PIN
- a themed avatar or an uploaded profile photo

Returning players use username + PIN. PINs are bcrypt-hashed in Postgres. Login attempts are throttled after repeated failures. Session tokens expire after 120 days.

The public leaderboard shows usernames and avatars, not players' full names.

## Shared multiplayer backend

Production data is stored in Supabase project **DWTS Season 35 Mirrorball Pool**.

The frontend calls controlled RPC functions for registration, login, locking predictions, leaderboard reads, and post-episode reveals. User-data tables have Row Level Security enabled and are not directly readable from the browser.

## Automatic weekly updates

A Supabase Edge Function named `sync-dwts` runs automatically every 30 minutes through Supabase Cron.

It checks the structured Season 35 weekly score table and:

1. updates dance styles and songs when a weekly table is available
2. waits until the episode is over before accepting results
3. requires a complete score row for every active couple
4. parses each judge's individual score and validates that the paddles add up to the reported total
5. identifies the week's highest-scoring couple or tied couples
6. detects eliminated or withdrawn couples
7. stores the verified results
8. calculates every player's points
9. removes eliminated couples from future prediction slates
10. advances the site to the next episode

If the source is incomplete, the job does nothing and tries again on the next scheduled run instead of publishing partial results.

The automatic structured source is the Season 35 Wikipedia scorecard. ABC, Parade, Entertainment Weekly, and the Cosmopolitan cast guide are retained as reference sources for cast, scheduling, episode reporting, and verification.

## Site files

- `index.html` — application shell and ballroom entrance
- `styles.css` — responsive DWTS-inspired visual theme
- `app.js` — accounts, predictions, results, standings, profile, and onboarding
- `assets.js` — project-supplied Mirrorball visual
- `config.js` — public Supabase project configuration and reference links
- `manifest.webmanifest` — installable web-app metadata
- `supabase/functions/sync-dwts/` — source for the automatic results synchronizer
- `.github/workflows/pages.yml` — GitHub Pages deployment

## Intro audio

Browsers require a user interaction before audio can start, so the entrance screen begins sound when the player taps **Enter the Ballroom**.

The repository currently uses an original short ballroom/disco sting. The copyrighted *Dancing with the Stars* theme recording is not bundled. An authorized audio clip can be swapped into the same entrance flow.

## Hosting

The site is configured to deploy with GitHub Pages from GitHub Actions.

Expected public URL:

**https://jrkasper2.github.io/DWTS-pool-season35/**

## Disclaimer

This is an unofficial, noncommercial fan project and is not affiliated with ABC, Disney, BBC Studios, or *Dancing with the Stars*.