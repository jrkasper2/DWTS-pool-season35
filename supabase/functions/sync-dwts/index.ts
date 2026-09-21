import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!PROJECT_URL || !SERVICE_KEY) throw new Error("Missing Supabase environment");

const supabase = createClient(PROJECT_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};

const WIKI_PAGE = "Dancing_with_the_Stars_(American_TV_series)_season_35";
const WIKI_URL = "https://en.wikipedia.org/wiki/" + WIKI_PAGE;

function decodeEntities(s) {
  return String(s || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ldquo;|&#8220;/gi, "“")
    .replace(/&rdquo;|&#8221;/gi, "”")
    .replace(/&rsquo;|&#8217;/gi, "’")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#(\d+);/g, (_,n)=>String.fromCharCode(Number(n)));
}

function cleanHtml(s) {
  return decodeEntities(String(s || "")
    .replace(/<sup[\s\S]*?<\/sup>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMusic(s) {
  return cleanHtml(s)
    .replace(/^["“]\s*/, "")
    .replace(/\s*["”]\s*—\s*/, " — ")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(s) {
  return cleanHtml(s).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

async function fetchWikiHtml() {
  const api = "https://en.wikipedia.org/w/api.php?action=parse&page=" +
    encodeURIComponent(WIKI_PAGE) +
    "&prop=text&format=json&formatversion=2&origin=*";
  const r = await fetch(api, {
    headers: {
      "User-Agent":"MirrorballPool/1.0 (friend-group prediction game; https://github.com/jrkasper2/DWTS-pool-season35)",
      "Accept":"application/json"
    }
  });
  if (!r.ok) throw new Error("Wikipedia fetch failed: " + r.status);
  const j = await r.json();
  if (!j || !j.parse || !j.parse.text) throw new Error("Wikipedia response missing page HTML");
  return String(j.parse.text);
}

function sectionForWeek(html, week) {
  const token = 'id="Week_' + week;
  let start = html.indexOf(token);
  if (start < 0) {
    const alt = "Week " + week + ":";
    start = html.toLowerCase().indexOf(alt.toLowerCase());
  }
  if (start < 0) return null;

  const nextWeek = html.indexOf('id="Week_' + (week + 1), start + token.length);
  const danceChart = html.indexOf('id="Dance_chart"', start + token.length);
  const scoringChart = html.indexOf('id="Scoring_chart"', start + token.length);
  const ends = [nextWeek,danceChart,scoringChart].filter(x=>x>start);
  const end = ends.length ? Math.min(...ends) : Math.min(html.length, start + 120000);
  return html.slice(start,end);
}

function parseRows(section, couples) {
  const rows = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const rm of section.matchAll(rowRe)) {
    const cells = [];
    const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
    for (const cm of rm[1].matchAll(cellRe)) cells.push(cleanHtml(cm[1]));
    if (cells.length < 4) continue;

    const pair = norm(cells[0]);
    const couple = couples.find(c => {
      const celebFirst = norm(c.celebrity).split(" ")[0];
      const proFirst = norm(c.pro).split(" ")[0];
      return pair.startsWith(celebFirst + " ") && pair.includes(proFirst);
    });
    if (!couple) continue;

    const scoreCell = cells[1] || "";
    const scoreMatch = scoreCell.match(/(\d{1,2})\s*\(([^)]+)\)/);
    let judgeScores = null;
    let total = null;
    if (scoreMatch) {
      total = Number(scoreMatch[1]);
      judgeScores = scoreMatch[2].split(",")
        .map(x=>Number((x.match(/\d{1,2}/)||[])[0]))
        .filter(Number.isFinite);
      if (!judgeScores.length || judgeScores.reduce((a,b)=>a+b,0)!==total) {
        judgeScores = null;
        total = null;
      }
    }

    rows.push({
      slug:couple.slug,
      celebrity:couple.celebrity,
      pro:couple.pro,
      scoreCell,
      judgeScores,
      total,
      dance:cells[2] || null,
      music:cells[3] || null,
      result:cells[4] || ""
    });
  }
  return rows;
}

async function syncMetadata(ep, couples, html) {
  const section = sectionForWeek(html, ep.week);
  if (!section) return {ok:false,reason:"weekly section not published yet",source:WIKI_URL};
  const parsed = parseRows(section,couples);
  if (!parsed.length) return {ok:false,reason:"weekly table not published yet",source:WIKI_URL};

  const rows = parsed.map(r=>({
    episode_slug:ep.slug,
    couple_slug:r.slug,
    dance_style:r.dance,
    song:r.music
  }));

  const {error} = await supabase.from("episode_couples").upsert(rows,{onConflict:"episode_slug,couple_slug"});
  if (error) throw error;

  await supabase.from("episodes").update({metadata_source_url:WIKI_URL}).eq("slug",ep.slug);
  return {ok:true,matched:rows.length,source:WIKI_URL};
}

async function syncResults(ep, couples, html) {
  const section = sectionForWeek(html,ep.week);
  if (!section) return {ok:false,reason:"weekly section not published yet",source:WIKI_URL};
  const parsed = parseRows(section,couples);
  const complete = parsed.filter(r=>Array.isArray(r.judgeScores) && Number.isFinite(r.total));

  if (complete.length !== couples.length) {
    return {
      ok:false,
      reason:"scores incomplete: " + complete.length + " of " + couples.length,
      source:WIKI_URL
    };
  }

  const counts = [...new Set(complete.map(r=>r.judgeScores.length))];
  if (counts.length!==1) return {ok:false,reason:"inconsistent judge counts",source:WIKI_URL};

  const judgeCount = counts[0];
  let judgeNames = Array.isArray(ep.judges) ? ep.judges : [];
  if (judgeNames.length !== judgeCount) {
    judgeNames = judgeCount===3
      ? ["Carrie Ann","Derek","Bruno"]
      : judgeCount===4
        ? ["Carrie Ann","Derek","Guest Judge","Bruno"]
        : Array.from({length:judgeCount},(_,i)=>"Judge " + (i+1));
    const {error:jErr} = await supabase.from("episodes").update({judges:judgeNames}).eq("slug",ep.slug);
    if (jErr) throw jErr;
  }

  const highestTotal = Math.max(...complete.map(r=>r.total));
  const outSlugs = complete
    .filter(r=>/eliminated|withdrew|withdrawn/i.test(r.result))
    .map(r=>r.slug);

  const resultRows = complete.map(r=>({
    episode_slug:ep.slug,
    couple_slug:r.slug,
    judge_scores:r.judgeScores,
    total:r.total,
    highest:r.total===highestTotal,
    eliminated:outSlugs.includes(r.slug),
    source_url:WIKI_URL,
    verified_at:new Date().toISOString()
  }));

  const {error:rErr} = await supabase.from("results").upsert(resultRows,{onConflict:"episode_slug,couple_slug"});
  if (rErr) throw rErr;

  const {error:sErr} = await supabase.rpc("recalculate_episode_scores",{p_episode_slug:ep.slug});
  if (sErr) throw sErr;

  if (outSlugs.length) {
    const {error:oErr} = await supabase.from("couples").update({active:false}).in("slug",outSlugs);
    if (oErr) throw oErr;
  }

  const {error:eErr} = await supabase.from("episodes").update({
    status:"scored",
    results_source_url:WIKI_URL,
    results_verified:true,
    synced_at:new Date().toISOString()
  }).eq("slug",ep.slug);
  if (eErr) throw eErr;

  return {
    ok:true,
    couples:resultRows.length,
    highestTotal,
    eliminated:outSlugs,
    source:WIKI_URL
  };
}

Deno.serve(async req=>{
  if (req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try {
    const now = new Date();
    const html = await fetchWikiHtml();

    const {data:episodes,error:epErr} = await supabase
      .from("episodes").select("*").order("starts_at",{ascending:true});
    if (epErr) throw epErr;

    const {data:activeCouples,error:cErr} = await supabase
      .from("couples").select("slug,celebrity,pro,active").eq("active",true).order("celebrity");
    if (cErr) throw cErr;

    const report = [];
    const current = (episodes||[]).find(e=>e.status!=="scored");

    if (current) {
      const daysAway = (new Date(current.starts_at).getTime()-now.getTime())/86400000;
      if (daysAway<=8) {
        try {
          const m=await syncMetadata(current,activeCouples||[],html);
          report.push(Object.assign({type:"metadata",episode:current.slug},m));
        } catch(e) {
          report.push({type:"metadata",episode:current.slug,ok:false,error:String(e)});
        }
      }
    }

    for (const ep of (episodes||[])) {
      if (ep.status==="scored") continue;
      if (!ep.ends_at || now.getTime()<new Date(ep.ends_at).getTime()) continue;
      const ageHours=(now.getTime()-new Date(ep.ends_at).getTime())/3600000;
      if (ageHours>96) continue;
      try {
        const rr=await syncResults(ep,activeCouples||[],html);
        report.push(Object.assign({type:"results",episode:ep.slug},rr));
      } catch(e) {
        report.push({type:"results",episode:ep.slug,ok:false,error:String(e)});
      }
    }

    return new Response(JSON.stringify({ok:true,at:now.toISOString(),report},null,2),{headers:cors});
  } catch(e) {
    return new Response(JSON.stringify({ok:false,error:String(e)},null,2),{status:500,headers:cors});
  }
});