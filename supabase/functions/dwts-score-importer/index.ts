import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WIKI_URL =
  "https://en.wikipedia.org/wiki/Dancing_with_the_Stars_(American_TV_series)_season_35";
const PEOPLE_TRACKER =
  "https://people.com/who-was-eliminated-from-dancing-with-the-stars-season-35-12122717";
const UA =
  "Mozilla/5.0 (compatible; MirrorballPool/1.0; +https://github.com/jrkasper2/DWTS-pool-season35)";

type Couple = { slug: string; celebrity: string; pro: string; active: boolean };
type ParsedScore = {
  couple_slug: string;
  judge_scores: number[];
  total: number;
  eliminated: boolean;
  dances: string[];
};

function norm(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&amp;/gi, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeEntities(s: string) {
  const named: Record<string, string> = {
    amp: "&", nbsp: " ", quot: '"', apos: "'", rsquo: "’", lsquo: "‘",
    rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

function stripTags(s: string) {
  return decodeEntities(
    s
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function aliases(name: string) {
  const n = norm(name);
  const parts = n.split(" ").filter(Boolean);
  const out = new Set<string>([n]);
  if (parts[0]) out.add(parts[0]);
  if (parts.length >= 2) out.add(parts.slice(0, 2).join(" "));
  return [...out];
}

function findCoupleFromCell(cell: string, couples: Couple[]) {
  const n = norm(cell);
  for (const c of couples) {
    const ca = aliases(c.celebrity);
    const pa = aliases(c.pro);
    if (ca.some((a) => n.includes(a)) && pa.some((a) => n.includes(a))) return c;
  }
  return null;
}

async function fetchPage(url: string) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
    },
  });
  if (!res.ok) return null;
  return { text: await res.text(), finalUrl: res.url || url };
}

function getWeekTable(html: string, week: number) {
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const target = tables.find((t) => {
    const plain = norm(stripTags(t));
    return plain.includes(`dancing with the stars season 35 week ${week}`) &&
      plain.includes("scores") &&
      plain.includes("result");
  });
  return target || null;
}

function tableRows(tableHtml: string) {
  return [...tableHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => {
    const row = m[0];
    const cells = [...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map((c) => stripTags(c[1]))
      .filter((x) => x.length);
    return cells;
  }).filter((cells) => cells.length);
}

function scoreFromCell(cell: string) {
  const m = cell.match(/(\d{1,3})\s*\(([^)]+)\)/);
  if (!m) return null;
  const total = Number(m[1]);
  const judges = [...m[2].matchAll(/\d{1,2}/g)].map((x) => Number(x[0]));
  if (judges.length < 3 || judges.reduce((a, b) => a + b, 0) !== total) return null;
  return { total, judges };
}

function parseWikipediaWeek(html: string, week: number, couples: Couple[]) {
  const table = getWeekTable(html, week);
  if (!table) return { scores: [] as ParsedScore[], tableFound: false, rawRows: [] as string[][] };

  const rows = tableRows(table);
  const agg = new Map<string, ParsedScore>();
  let current: Couple | null = null;

  for (const cells of rows) {
    const matched = cells.map((c) => findCoupleFromCell(c, couples)).find(Boolean) as Couple | undefined;
    if (matched) current = matched;
    if (!current) continue;

    const scoreCell = cells.map(scoreFromCell).find(Boolean) as { total: number; judges: number[] } | undefined;
    if (!scoreCell) continue;

    const danceCell = cells.find((c) =>
      /cha-cha|foxtrot|tango|jive|salsa|quickstep|waltz|paso|rumba|samba|contemporary|jazz|charleston|freestyle/i.test(c)
    ) || "";

    const eliminated = cells.some((c) => /eliminated/i.test(c));
    const prev = agg.get(current.slug);
    if (!prev) {
      agg.set(current.slug, {
        couple_slug: current.slug,
        judge_scores: scoreCell.judges,
        total: scoreCell.total,
        eliminated,
        dances: danceCell ? [danceCell] : [],
      });
    } else {
      const len = Math.max(prev.judge_scores.length, scoreCell.judges.length);
      prev.judge_scores = Array.from({ length: len }, (_, i) =>
        (prev.judge_scores[i] ?? 0) + (scoreCell.judges[i] ?? 0)
      );
      prev.total += scoreCell.total;
      prev.eliminated = prev.eliminated || eliminated;
      if (danceCell) prev.dances.push(danceCell);
      agg.set(current.slug, prev);
    }
  }

  return { scores: [...agg.values()], tableFound: true, rawRows: rows };
}

function weekSectionSaysNoElimination(html: string, week: number) {
  const plain = norm(stripTags(html));
  const marker = `week ${week}`;
  const idx = plain.indexOf(marker);
  if (idx < 0) return false;
  const section = plain.slice(idx, idx + 6000);
  return section.includes("no elimination") ||
    section.includes("no one was eliminated") ||
    section.includes("nobody was eliminated");
}

async function verifyPeople(eliminated: Couple[]) {
  if (!eliminated.length) return { ok: true, url: PEOPLE_TRACKER };
  const page = await fetchPage(PEOPLE_TRACKER);
  if (!page) return { ok: false, url: PEOPLE_TRACKER };
  const text = norm(stripTags(page.text));
  return {
    ok: eliminated.every((c) => text.includes(norm(c.celebrity))),
    url: page.finalUrl,
  };
}

async function logRun(
  episodeSlug: string | null,
  status: string,
  sourceUrl: string | null,
  verificationUrl: string | null,
  details: Record<string, unknown>,
) {
  await db.from("score_import_runs").insert({
    episode_slug: episodeSlug,
    status,
    source_url: sourceUrl,
    verification_url: verificationUrl,
    details,
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST required", { status: 405 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }

  try {
    const requestedSlug = typeof body.episode_slug === "string" ? body.episode_slug : null;
    const dryRun = body.dry_run === true;

    let q = db.from("episodes").select("*").neq("status", "scored");
    if (requestedSlug) {
      q = q.eq("slug", requestedSlug);
    } else {
      q = q
        .lte("ends_at", new Date().toISOString())
        .gte("ends_at", new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
        .order("ends_at", { ascending: true })
        .limit(1);
    }

    const { data: episodes, error: episodeError } = await q;
    if (episodeError) throw episodeError;
    const episode = Array.isArray(episodes) ? episodes[0] : episodes;
    if (!episode) {
      return Response.json({ ok: true, status: "noop", message: "No ended unscored episode." });
    }

    const { data: couples, error: coupleError } = await db
      .from("couples")
      .select("slug,celebrity,pro,active")
      .eq("active", true);
    if (coupleError) throw coupleError;

    const wiki = await fetchPage(WIKI_URL);
    if (!wiki) {
      await logRun(episode.slug, "pending_source", WIKI_URL, PEOPLE_TRACKER, { week: episode.week });
      return Response.json({ ok: true, status: "pending_source", message: "Wikipedia is temporarily unavailable." });
    }

    const parsed = parseWikipediaWeek(wiki.text, episode.week, couples as Couple[]);
    if (!parsed.tableFound) {
      await logRun(episode.slug, "pending_table", wiki.finalUrl, PEOPLE_TRACKER, { week: episode.week });
      return Response.json({
        ok: true,
        status: "pending_table",
        source_url: wiki.finalUrl,
        message: "The weekly score table has not been published yet.",
      });
    }

    if (parsed.scores.length !== couples.length) {
      await logRun(episode.slug, "pending_scores", wiki.finalUrl, PEOPLE_TRACKER, {
        expected_couples: couples.length,
        parsed_couples: parsed.scores.length,
        parsed: parsed.scores.map((x) => x.couple_slug),
      });
      return Response.json({
        ok: true,
        status: "pending_scores",
        source_url: wiki.finalUrl,
        expected_couples: couples.length,
        parsed_couples: parsed.scores.length,
        message: "The weekly table exists, but not every active couple has a complete score yet.",
      });
    }

    const eliminatedSlugs = parsed.scores.filter((x) => x.eliminated).map((x) => x.couple_slug);
    const explicitNoElimination = weekSectionSaysNoElimination(wiki.text, episode.week);
    if (!eliminatedSlugs.length && !explicitNoElimination) {
      await logRun(episode.slug, "pending_elimination", wiki.finalUrl, PEOPLE_TRACKER, {});
      return Response.json({
        ok: true,
        status: "pending_elimination",
        source_url: wiki.finalUrl,
        message: "All scores are present, but the result column is not final yet.",
      });
    }

    const eliminatedCouples = (couples as Couple[]).filter((c) => eliminatedSlugs.includes(c.slug));
    const people = await verifyPeople(eliminatedCouples);
    if (!people.ok) {
      await logRun(episode.slug, "pending_verification", wiki.finalUrl, people.url, {
        eliminated: eliminatedSlugs,
      });
      return Response.json({
        ok: true,
        status: "pending_verification",
        source_url: wiki.finalUrl,
        verification_url: people.url,
        message: "Scores are complete. Waiting for People to confirm the elimination.",
      });
    }

    const highestTotal = Math.max(...parsed.scores.map((x) => x.total));
    const rows = parsed.scores.map((x) => ({
      episode_slug: episode.slug,
      couple_slug: x.couple_slug,
      judge_scores: x.judge_scores,
      total: x.total,
      highest: x.total === highestTotal,
      eliminated: x.eliminated,
      source_url: wiki.finalUrl,
      verified_at: new Date().toISOString(),
    }));

    if (dryRun) {
      return Response.json({
        ok: true,
        status: "dry_run",
        episode: episode.slug,
        source_url: wiki.finalUrl,
        verification_url: people.url,
        highest_total: highestTotal,
        eliminated: eliminatedSlugs,
        results: rows,
      });
    }

    const { error: resultError } = await db
      .from("results")
      .upsert(rows, { onConflict: "episode_slug,couple_slug" });
    if (resultError) throw resultError;

    const { error: episodeUpdateError } = await db
      .from("episodes")
      .update({ source_url: wiki.finalUrl, verification_url: people.url })
      .eq("slug", episode.slug);
    if (episodeUpdateError) throw episodeUpdateError;

    const { data: scoring, error: scoringError } = await db.rpc("score_episode", {
      p_episode_slug: episode.slug,
    });
    if (scoringError) throw scoringError;

    await logRun(episode.slug, "success", wiki.finalUrl, people.url, {
      highest_total: highestTotal,
      eliminated: eliminatedSlugs,
      results: rows.length,
      scoring,
    });

    return Response.json({
      ok: true,
      status: "scored",
      episode: episode.slug,
      source_url: wiki.finalUrl,
      verification_url: people.url,
      highest_total: highestTotal,
      eliminated: eliminatedSlugs,
      results_imported: rows.length,
      scoring,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try { await logRun(null, "error", null, null, { message }); } catch {}
    return Response.json({ ok: false, status: "error", message }, { status: 500 });
  }
});