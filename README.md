# Mirrorball Pool — Dancing With the Stars Season 35 🪩

A fan-made Season 35 prediction pool for Julia's friend group.

## Game rules

Players predict:
- every judge's individual paddle score for each couple
- each couple's total score
- the highest-scoring couple of the episode
- the eliminated couple

Scoring:
- Exact total: **5 points**
- 1 point away: **3 points**
- 2 points away: **1 point**
- Exact individual judge: **+1 point per judge**
- Correct highest-scoring couple: **+5 points**
- Correct elimination: **+5 points**

Once a player locks a prediction, it cannot be changed. Friends' picks stay hidden until the episode ends.

## Player accounts

First visit:
- first name
- last name
- username
- 4-digit PIN
- choose a DWTS-style avatar or upload a profile photo

Returning visits use username + 4-digit PIN.

## Current state

The front-end experience is live in this repository and works in browser-preview mode using local storage. The repo also includes a Supabase schema for turning it into a shared multi-player game.

## Make the group-chat version fully shared

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Put the project URL and anon key into `config.js`.
4. Wire the client calls in `app.js` to the Supabase RPC functions.
5. Add the score-sync Edge Function / scheduled job for automatic weekly scoring.

## Hosting

A GitHub Pages deployment workflow is included at `.github/workflows/pages.yml`. If GitHub Pages is set to **GitHub Actions** in repository settings, pushes to `main` deploy automatically.

## Theme audio

The site currently uses a short original browser-generated ballroom sting on entry. The copyrighted Dancing with the Stars theme recording is not bundled. If you have an authorized clip, it can be connected without changing the game flow.

## Sources / references

- ABC — official DWTS cast and schedule references
- Cosmopolitan — Season 35 cast reference supplied for the project
- Parade — planned judge-by-judge score source
- Entertainment Weekly — planned recap / total-score verification source
- Project-supplied Season 35 imagery — visual design reference

This is an unofficial, noncommercial fan project and is not affiliated with ABC, Disney, BBC Studios, or Dancing with the Stars.
