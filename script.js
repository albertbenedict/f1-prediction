/* F1 Predictor — vanilla static for GitHub Pages */
const JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1";
const OPENF1_BASE = "https://api.openf1.org/v1";

const TTL = {
  standings: 15 * 60 * 1000,
  schedule: 60 * 60 * 1000,
  results: 10 * 60 * 1000,
  sessions: 5 * 60 * 1000,
  media: 6 * 60 * 60 * 1000,
};

const SCORING = { pole: 5, win: 10, podiumExact: 5, podiumAnyOrder: 2, sprintPole: 3, sprintWin: 5, wildcard: 8 };

let state = {
  weekend: null,
  standings: null,
  currentTab: "play",
  standingsTab: "drivers",
  weekendSessions: [],
};

function showError(msg) {
  const el = document.getElementById("global-error");
  if (!msg) { el.style.display = "none"; el.textContent = ""; return; }
  el.textContent = msg;
  el.style.display = "block";
  el.classList.add("show");
}
function getCached(key, ttl) {
  try {
    const raw = localStorage.getItem("cache:" + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.storedAt < ttl) return obj.data;
  } catch {}
  return null;
}
function setCached(key, data) {
  try { localStorage.setItem("cache:" + key, JSON.stringify({ data, storedAt: Date.now() })); } catch {}
}
async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API ${res.status} on ${url}`);
  return res.json();
}
function fallbackColour(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`;
}
function normalizeTeamName(name) {
  return name.toLowerCase().replace(/\bf1 team\b|\bracing team\b|\bracing\b|\bteam\b|\bworks\b/g, "").replace(/[^a-z0-9]/g, "");
}
function makeWildcardPosition(season, round) {
  const candidates = [];
  for (let i = 4; i <= 22; i++) candidates.push(i);
  const seed = `${season}:${round}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return candidates[hash % candidates.length];
}
function normalizeSessionName(n) {
  if (n === "Practice 1") return "Free Practice 1";
  if (n === "Practice 2") return "Free Practice 2";
  if (n === "Practice 3") return "Free Practice 3";
  return n;
}
function getTimeLeft(targetIso) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    d: Math.floor(diff / (1000*60*60*24)),
    h: Math.floor((diff / (1000*60*60)) % 24),
    m: Math.floor((diff / (1000*60)) % 60),
    s: Math.floor((diff / 1000) % 60),
  };
}

async function getDriverStandings(season="current") {
  const key = `jolpica:driverStandings:${season}`;
  const cached = getCached(key, TTL.standings);
  if (cached) return cached;
  try {
    const json = await fetchJson(`${JOLPICA_BASE}/${season}/driverstandings.json`);
    const list = json?.MRData?.StandingsTable?.StandingsLists?.[0];
    if (!list) return { season, round: null, drivers: [] };
    const data = {
      season: list.season,
      round: list.round,
      drivers: list.DriverStandings.map(d => ({
        position: Number(d.position),
        points: Number(d.points),
        wins: Number(d.wins),
        driverId: d.Driver.driverId,
        code: d.Driver.code,
        givenName: d.Driver.givenName,
        familyName: d.Driver.familyName,
        nationality: d.Driver.nationality,
        constructor: d.Constructors?.[d.Constructors.length - 1]?.name ?? "Unknown",
      })),
    };
    setCached(key, data);
    return data;
  } catch (e) {
    // serve stale cache even if expired on failure
    try {
      const raw = localStorage.getItem("cache:" + key);
      if (raw) { const obj=JSON.parse(raw); if (obj.data) { console.warn("serving stale driverStandings", e.message); return obj.data; } }
    } catch {}
    throw e;
  }
}
async function getConstructorStandings(season="current") {
  const key = `jolpica:constructorStandings:${season}`;
  const cached = getCached(key, TTL.standings);
  if (cached) return cached;
  try {
    const json = await fetchJson(`${JOLPICA_BASE}/${season}/constructorstandings.json`);
    const list = json?.MRData?.StandingsTable?.StandingsLists?.[0];
    if (!list) return { season, round: null, constructors: [] };
    const data = {
      season: list.season,
      round: list.round,
      constructors: list.ConstructorStandings.map(c => ({
        position: Number(c.position),
        points: Number(c.points),
        wins: Number(c.wins),
        constructorId: c.Constructor.constructorId,
        name: c.Constructor.name,
        nationality: c.Constructor.nationality,
      })),
    };
    setCached(key, data);
    return data;
  } catch (e) {
    try { const raw=localStorage.getItem("cache:"+key); if(raw){ const obj=JSON.parse(raw); if(obj.data) { console.warn("serving stale constructorStandings",e.message); return obj.data; } } } catch {}
    throw e;
  }
}
async function getSchedule(season="current") {
  const key = `jolpica:schedule:${season}`;
  const cached = getCached(key, TTL.schedule);
  if (cached) return cached;
  try {
    const json = await fetchJson(`${JOLPICA_BASE}/${season}.json`);
    const races = json?.MRData?.RaceTable?.Races ?? [];
    const data = races.map(r => ({
      season: r.season,
      round: r.round,
      raceName: r.raceName,
      circuitName: r.Circuit.circuitName,
      country: r.Circuit.Location.country,
      locality: r.Circuit.Location.locality,
      date: r.date,
      time: r.time,
      hasSprint: Boolean(r.Sprint),
      sprintDate: r.Sprint?.date ?? null,
      sprintTime: r.Sprint?.time ?? null,
      qualifyingDate: r.Qualifying?.date ?? null,
      qualifyingTime: r.Qualifying?.time ?? null,
      firstPracticeDate: r.FirstPractice?.date ?? null,
      firstPracticeTime: r.FirstPractice?.time ?? null,
      secondPracticeDate: r.SecondPractice?.date ?? null,
      secondPracticeTime: r.SecondPractice?.time ?? null,
      thirdPracticeDate: r.ThirdPractice?.date ?? null,
      thirdPracticeTime: r.ThirdPractice?.time ?? null,
      sprintQualifyingDate: r.SprintQualifying?.date ?? null,
      sprintQualifyingTime: r.SprintQualifying?.time ?? null,
    }));
    setCached(key, data);
    return data;
  } catch (e) {
    try { const raw=localStorage.getItem("cache:"+key); if(raw){ const obj=JSON.parse(raw); if(obj.data) { console.warn("serving stale schedule",e.message); return obj.data; } } } catch {}
    throw e;
  }
}
async function getRaceResults(season="current", round) {
  const key = `jolpica:results:${season}:${round}`;
  const cached = getCached(key, TTL.results);
  if (cached) return cached;
  const json = await fetchJson(`${JOLPICA_BASE}/${season}/${round}/results.json`);
  const race = json?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;
  const data = {
    season: race.season,
    round: race.round,
    raceName: race.raceName,
    date: race.date,
    results: (race.Results ?? []).map(r => ({
      position: r.position,
      positionNum: Number(r.position),
      driverId: r.Driver.driverId,
      code: r.Driver.code,
      givenName: r.Driver.givenName,
      familyName: r.Driver.familyName,
      constructorId: r.Constructor.constructorId,
      constructorName: r.Constructor.name,
      points: Number(r.points),
      grid: Number(r.grid),
      laps: Number(r.laps),
      status: r.status,
      time: r.Time?.time ?? null,
    })),
  };
  setCached(key, data);
  return data;
}
async function getQualifyingResults(season="current", round) {
  const key = `jolpica:quali:${season}:${round}`;
  const cached = getCached(key, TTL.results);
  if (cached) return cached;
  const json = await fetchJson(`${JOLPICA_BASE}/${season}/${round}/qualifying.json`);
  const race = json?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;
  const data = {
    season: race.season,
    round: race.round,
    raceName: race.raceName,
    results: (race.QualifyingResults ?? []).map(r => ({
      position: Number(r.position),
      driverId: r.Driver.driverId,
      code: r.Driver.code,
      givenName: r.Driver.givenName,
      familyName: r.Driver.familyName,
      constructorId: r.Constructor.constructorId,
      constructorName: r.Constructor.name,
      q1: r.Q1 ?? null, q2: r.Q2 ?? null, q3: r.Q3 ?? null,
    })),
  };
  setCached(key, data);
  return data;
}
async function getSprintResults(season="current", round) {
  const key = `jolpica:sprint:${season}:${round}`;
  const cached = getCached(key, TTL.results);
  if (cached) return cached;
  const json = await fetchJson(`${JOLPICA_BASE}/${season}/${round}/sprint.json`);
  const race = json?.MRData?.RaceTable?.Races?.[0];
  if (!race) return null;
  const sprint = race.SprintResults ?? race.Results ?? [];
  const data = {
    season: race.season,
    round: race.round,
    raceName: race.raceName,
    results: sprint.map(r => ({
      position: Number(r.position),
      driverId: r.Driver.driverId,
      code: r.Driver.code,
      givenName: r.Driver.givenName,
      familyName: r.Driver.familyName,
      constructorName: r.Constructor.name,
      points: Number(r.points ?? 0),
      grid: Number(r.grid),
      status: r.status,
    })),
  };
  setCached(key, data);
  return data;
}

async function getSessionsForYear(year) {
  const key = `openf1:sessions:${year}`;
  const cached = getCached(key, TTL.sessions);
  if (cached) return cached;
  try {
    const data = await fetchJson(`${OPENF1_BASE}/sessions?year=${year}`);
    setCached(key, data);
    return data;
  } catch (e) {
    try { const raw=localStorage.getItem("cache:"+key); if(raw){ const obj=JSON.parse(raw); if(obj.data) { console.warn("serving stale sessions",e.message); return obj.data; } } } catch {}
    throw e;
  }
}
const DRIVER_OVERRIDES = {
  HAD: { headshotUrl: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/I/ISAHAD01_Isack_Hadjar/isahad01.png.transform/1col/image.png", teamColour: "#0600EF" },
  TSU: { headshotUrl: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/Y/YUKTSU01_Yuki_Tsunoda/yuktsu01.png.transform/1col/image.png", teamColour: "#6C98FF" },
  LIN: { headshotUrl: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/A/ARVLIN01_Arvid_Lindblad/arvlin01.png.transform/1col/image.png", teamColour: "#6C98FF" },
  BOT: { headshotUrl: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/V/VALBOT01_Valtteri_Bottas/valbot01.png.transform/2col/image.png", teamColour: "#909090" },
  PER: { headshotUrl: "https://media.formula1.com/d_driver_fallback_image.png/content/dam/fom-website/drivers/S/SERPER01_Sergio_Perez/serper01.png.transform/2col/image.png", teamColour: "#909090" },
};
const TEAM_LOGOS = {
  mercedes: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/mercedes.png",
  ferrari: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/ferrari.png",
  mclaren: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/mclaren.png",
  redbull: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/red%20bull.png",
  redbullracing: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/red%20bull.png",
  rbf1team: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/rb.png",
  racingbulls: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/rb.png",
  alpinef1team: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/alpine.png",
  alpine: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/alpine.png",
  haasf1team: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/haas.png",
  haas: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/haas.png",
  audi: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/kick%20sauber.png",
  sauber: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/kick%20sauber.png",
  williams: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/williams.png",
  astonmartin: "https://media.formula1.com/content/dam/fom-website/2018-redesign-assets/team%20logos/aston%20martin.png",
  cadillacf1team: "https://cdn.worldvectorlogo.com/logos/cadillac-1.svg",
  cadillac: "https://cdn.worldvectorlogo.com/logos/cadillac-1.svg",
};

async function getDriverMedia() {
  const key = "openf1:driverMedia";
  const cached = getCached(key, TTL.media);
  if (cached) {
    // ensure overrides are applied even on cached
    const mergedByCode = { ...(cached.byCode||{}), ...DRIVER_OVERRIDES };
    // fill missing colours for overrides where needed
    for (const code of Object.keys(DRIVER_OVERRIDES)) {
      if (!mergedByCode[code]?.teamColour) mergedByCode[code].teamColour = DRIVER_OVERRIDES[code].teamColour;
      if (!mergedByCode[code]?.headshotUrl) mergedByCode[code].headshotUrl = DRIVER_OVERRIDES[code].headshotUrl;
    }
    return { byCode: mergedByCode, teamColours: cached.teamColours||{} };
  }
  try {
    const data = await fetchJson(`${OPENF1_BASE}/drivers?session_key=latest`);
    const byCode = {};
    const teamColours = {};
    for (const d of data ?? []) {
      if (d.name_acronym) {
        byCode[d.name_acronym] = {
          headshotUrl: d.headshot_url ?? null,
          teamColour: d.team_colour ? `#${d.team_colour}` : null,
        };
      }
      const k = d.team_name && normalizeTeamName(d.team_name);
      if (k && !teamColours[k] && d.team_colour) teamColours[k] = `#${d.team_colour}`;
    }
    // apply overrides (force for HAD/LIN/TSU/BOT/PER)
    for (const code of Object.keys(DRIVER_OVERRIDES)) {
      byCode[code] = { ...DRIVER_OVERRIDES[code], ...(byCode[code]||{}) };
      // if OpenF1 had fallback image, override keeps our cleaner one
      if (!byCode[code].headshotUrl || byCode[code].headshotUrl.includes("d_driver_fallback_image")) {
        byCode[code].headshotUrl = DRIVER_OVERRIDES[code].headshotUrl;
      }
      if (!byCode[code].teamColour) byCode[code].teamColour = DRIVER_OVERRIDES[code].teamColour;
    }
    const result = { byCode, teamColours };
    setCached(key, result);
    return result;
  } catch (e) {
    console.warn("driverMedia failed", e.message);
    return { byCode: { ...DRIVER_OVERRIDES }, teamColours: {} };
  }
}
async function getUpcomingSessions(limit=5) {
  const year = new Date().getUTCFullYear();
  const all = await getSessionsForYear(year);
  const now = Date.now();
  const upcoming = (all ?? [])
    .filter(s => !s.is_cancelled && new Date(s.date_start).getTime() > now)
    .sort((a,b)=> new Date(a.date_start)-new Date(b.date_start))
    .slice(0, limit)
    .map(s=> ({
      sessionKey: s.session_key, meetingKey: s.meeting_key,
      sessionName: s.session_name, sessionType: s.session_type,
      country: s.country_name, circuit: s.circuit_short_name,
      startTime: s.date_start, endTime: s.date_end,
    }));
  return upcoming;
}
function buildFallbackSessions(race) {
  if (!race) return [];
  const sessions = [];
  function add(name, date, time, dur) {
    if (!date) return;
    const startIso = `${date}T${time ?? "00:00:00Z"}`;
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + dur*60*1000);
    sessions.push({ sessionName: name, startTime: start.toISOString(), endTime: end.toISOString() });
  }
  add("Free Practice 1", race.firstPracticeDate, race.firstPracticeTime, 60);
  if (race.hasSprint) {
    add("Sprint Qualifying", race.sprintQualifyingDate, race.sprintQualifyingTime, 60);
    add("Sprint", race.sprintDate, race.sprintTime, 60);
  } else {
    add("Free Practice 2", race.secondPracticeDate, race.secondPracticeTime, 60);
    add("Free Practice 3", race.thirdPracticeDate, race.thirdPracticeTime, 60);
  }
  add("Qualifying", race.qualifyingDate, race.qualifyingTime, 60);
  add("Race", race.date, race.time, 120);
  sessions.sort((a,b)=> new Date(a.startTime)-new Date(b.startTime));
  return sessions;
}

function initTheme() {
  const input = document.getElementById("theme-switch");
  const saved = document.documentElement.getAttribute("data-theme") || "light";
  input.checked = saved === "dark";
  input.addEventListener("change", e => {
    const next = e.target.checked ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
}
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".nav-pill[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab===tab));
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target=document.getElementById(`screen-${tab}`);
  if (target) target.classList.add("active");
  if (tab==="results" && !document.getElementById("results-content").dataset.loaded) loadResults();
  if (tab==="predictions") renderPredictionsTab();
}
function renderDriverOptions(drivers) {
  const selects = ["pole","winner","p2","p3","sprint-pole","sprint-winner","wildcard-driver"];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const keep = el.value;
    // keep first option
    el.innerHTML = `<option value="">${el.querySelector("option").textContent}</option>`;
    drivers.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.driverId;
      opt.textContent = `${d.code} — ${d.givenName} ${d.familyName}`;
      el.appendChild(opt);
    });
    el.value = keep;
  });
}

let countdownInterval = null;
function startCountdown(nextRace, weekendSessions) {
  function tick() {
    const titleEl = document.getElementById("countdown-title");
    const subEl = document.getElementById("countdown-subtitle");
    const dateEl = document.getElementById("countdown-date");
    const pillLabelEl = document.getElementById("countdown-pill-label");
    const gridEl = document.getElementById("countdown-grid");
    const liveEl = document.getElementById("countdown-live");

    if (!nextRace) {
      titleEl.textContent = "Season Complete";
      subEl.textContent = "No upcoming race. Check past results.";
      return;
    }

    let sessions = [];
    if (Array.isArray(weekendSessions) && weekendSessions.length) {
      sessions = weekendSessions.map(s=> ({ name: normalizeSessionName(s.sessionName), start: s.startTime, end: s.endTime }))
        .sort((a,b)=> new Date(a.start)-new Date(b.start));
    } else {
      const raceIso = `${nextRace.date}T${nextRace.time ?? "00:00:00Z"}`;
      const qualiIso = nextRace.qualifyingDate ? `${nextRace.qualifyingDate}T${nextRace.qualifyingTime ?? "00:00:00Z"}` : null;
      const sprintIso = nextRace.hasSprint && nextRace.sprintDate ? `${nextRace.sprintDate}T${nextRace.sprintTime ?? "00:00:00Z"}` : null;
      const fp1Iso = nextRace.firstPracticeDate ? `${nextRace.firstPracticeDate}T${nextRace.firstPracticeTime ?? "00:00:00Z"}` : null;
      if (fp1Iso) sessions.push({ name:"Free Practice 1", start:fp1Iso, end:new Date(new Date(fp1Iso).getTime()+60*60*1000).toISOString() });
      if (nextRace.secondPracticeDate) {
        const s=`${nextRace.secondPracticeDate}T${nextRace.secondPracticeTime ?? "00:00:00Z"}`;
        sessions.push({ name:"Free Practice 2", start:s, end:new Date(new Date(s).getTime()+60*60*1000).toISOString() });
      }
      if (nextRace.thirdPracticeDate) {
        const s=`${nextRace.thirdPracticeDate}T${nextRace.thirdPracticeTime ?? "00:00:00Z"}`;
        sessions.push({ name:"Free Practice 3", start:s, end:new Date(new Date(s).getTime()+60*60*1000).toISOString() });
      }
      if (sprintIso) sessions.push({ name:"Sprint", start:sprintIso, end:new Date(new Date(sprintIso).getTime()+60*60*1000).toISOString() });
      if (qualiIso) sessions.push({ name:"Qualifying", start:qualiIso, end:new Date(new Date(qualiIso).getTime()+60*60*1000).toISOString() });
      sessions.push({ name:"Race", start:raceIso, end:new Date(new Date(raceIso).getTime()+2*60*60*1000).toISOString() });
      sessions.sort((a,b)=> new Date(a.start)-new Date(b.start));
    }

    titleEl.textContent = `Round ${nextRace.round} — ${nextRace.raceName}`;
    subEl.innerHTML = `${nextRace.circuitName} • ${nextRace.country} ${nextRace.hasSprint ? '<span class="wildcard-badge" style="margin-left:8px; font-size:11px;">Sprint Weekend</span>' : ''}`;
    try {
      const raceIso = `${nextRace.date}T${nextRace.time ?? "00:00:00Z"}`;
      dateEl.textContent = new Date(raceIso).toLocaleString(undefined, { dateStyle:"medium", timeStyle:"short" }) + (nextRace.hasSprint ? " • Sprint Sat" : "");
    } catch { dateEl.textContent = `${nextRace.date} ${nextRace.time ?? ""}`; }

    const now = Date.now();
    let pillPrefix = "Next:", pillLabel = sessions[0]?.name ?? "Free Practice 1", targetIso=null, isLive=false;
    let found=false;
    for (const s of sessions) {
      const start=new Date(s.start).getTime();
      const end=s.end ? new Date(s.end).getTime() : start+60*60*1000;
      if (now>=start && now<end) { pillLabel=s.name; pillPrefix="Now:"; targetIso=s.end; isLive=true; found=true; break; }
      if (now<start) { pillLabel=s.name; pillPrefix="Next:"; targetIso=s.start; found=true; break; }
    }
    if (!found) {
      pillLabel = sessions[sessions.length-1]?.name ?? "Race";
      pillPrefix = "Finished";
      targetIso=null;
    }
    pillLabelEl.textContent = pillLabel;
    document.getElementById("countdown-pill").firstChild.textContent = pillPrefix + " ";

    let left = targetIso ? getTimeLeft(targetIso) : null;
    if (targetIso && left) {
      const labels=["Days","Hours","Mins","Secs"];
      const vals=[left.d, String(left.h).padStart(2,"0"), String(left.m).padStart(2,"0"), String(left.s).padStart(2,"0")];
      gridEl.innerHTML = vals.map((v,i)=> `<div class="countdown-box"><div class="countdown-num">${v}</div><div class="countdown-label">${labels[i]}</div></div>`).join("");
      liveEl.style.display = isLive ? "block" : "none";
    } else if (targetIso && isLive) {
      gridEl.innerHTML = `<div class="countdown-box" style="grid-column:1/-1;"><div class="countdown-num">Live</div></div>`;
      liveEl.style.display = "block";
    } else if (!targetIso) {
      gridEl.innerHTML = `<div style="grid-column:1/-1; padding:12px; border-radius:12px; background:var(--surface-2); border:2px solid var(--border-subtle); text-align:center; font-weight:700; font-family:var(--font-display);">🏁 Weekend Complete — results are final</div>`;
      liveEl.style.display="none";
    } else {
      // should not happen
      gridEl.innerHTML = `<div style="grid-column:1/-1; text-align:center;">—</div>`;
      liveEl.style.display="none";
    }
  }
  tick();
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(tick, 1000);
}

function loadPredictions(season, round) {
  const key = `f1predict:${season}:${round}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function isWeekendLocked(nextRace, weekendSessions) {
  try {
    let fp1Iso = null;
    if (Array.isArray(weekendSessions) && weekendSessions.length) {
      fp1Iso = weekendSessions[0]?.startTime;
    } else if (nextRace?.firstPracticeDate) {
      fp1Iso = `${nextRace.firstPracticeDate}T${nextRace.firstPracticeTime ?? "00:00:00Z"}`;
    }
    if (!fp1Iso) return false;
    return Date.now() >= new Date(fp1Iso).getTime();
  } catch { return false; }
}
function initPredictionForm(drivers, nextRace, weekendSessions) {
  const season = nextRace?.season ?? new Date().getUTCFullYear();
  const round = nextRace?.round ?? "1";
  const hasSprint = Boolean(nextRace?.hasSprint);
  const wildcardPos = makeWildcardPosition(season, round);
  const locked = isWeekendLocked(nextRace, weekendSessions);

  document.getElementById("form-title").textContent = nextRace ? `Your Predictions for the ${nextRace.raceName}` : "Your Predictions for the Next Grand Prix";
  document.getElementById("wildcard-label").innerHTML = `P-What - Who finishes P${wildcardPos} in the Race? <span class="wildcard-badge" style="margin-left:8px;">Bonus ${SCORING.wildcard}pts</span>`;
  document.querySelector('#wildcard-driver option').textContent = `Select driver for P${wildcardPos}`;

  if (!drivers?.length) {
    document.getElementById("form-loading").style.display="block";
    document.getElementById("prediction-form").style.display="none";
    return;
  }
  document.getElementById("form-loading").style.display="none";
  document.getElementById("prediction-form").style.display="block";
  document.getElementById("sprint-section").style.display = hasSprint ? "block" : "none";
  const hintEl=document.getElementById("form-hint");
  if (hintEl) hintEl.innerHTML = hasSprint ? "Fill Pole, Winner, P2, P3 and Wildcard to save (+ Sprint Pole/Winner)." : "Fill Pole, Winner, P2, P3 and Wildcard to save.";

  renderDriverOptions(drivers);

  // lock after FP1 starts
  const formEl=document.getElementById("prediction-form");
  const saveBtn=document.getElementById("save-btn");
  const clearBtn=document.getElementById("clear-btn");
  let lockMsg=document.getElementById("form-locked-msg");
  if (!lockMsg) {
    lockMsg=document.createElement("div");
    lockMsg.id="form-locked-msg";
    lockMsg.style.cssText="display:none; margin-top:12px; padding:10px 14px; border-radius:10px; border:2px solid var(--border-color); background:var(--surface-2); color:var(--danger); font-weight:700; font-size:13px; text-align:center;";
    lockMsg.textContent="🔒 Predictions locked — FP1 has started. Wait for next Grand Prix.";
    formEl.parentNode.insertBefore(lockMsg, formEl);
  }
  if (locked) {
    lockMsg.style.display="block";
    formEl.querySelectorAll("select, button").forEach(el=> el.disabled=true);
    if (saveBtn) saveBtn.disabled=true;
    // keep saved view readable but disabled
    document.getElementById("form-loading").style.display="none";
    formEl.style.display="block";
    document.getElementById("sprint-section").style.display = hasSprint ? "block" : "none";
  } else {
    lockMsg.style.display="none";
    formEl.querySelectorAll("select").forEach(el=> el.disabled=false);
    if (saveBtn) saveBtn.disabled=false;
    if (clearBtn) clearBtn.disabled=false;
  }

  const saved = loadPredictions(season, round);
  if (saved) {
    document.getElementById("pole").value = saved.pole || "";
    document.getElementById("winner").value = saved.winner || "";
    document.getElementById("p2").value = saved.p2 || "";
    document.getElementById("p3").value = saved.p3 || "";
    document.getElementById("sprint-pole").value = saved.sprintPole || "";
    document.getElementById("sprint-winner").value = saved.sprintWinner || "";
    document.getElementById("wildcard-driver").value = saved.wildcardDriver || "";
  }

  function checkDuplicate() {
    const winner = document.getElementById("winner").value;
    const p2 = document.getElementById("p2").value;
    const p3 = document.getElementById("p3").value;
    const vals = [winner,p2,p3].filter(Boolean);
    const dup = new Set(vals).size !== vals.length;
    document.getElementById("error-duplicate").classList.toggle("show", dup);
    // sprint only has pole+win — allow same driver (pole can be winner), no duplicate error needed
  }
  ["pole","winner","p2","p3"].forEach(id=>{
    const el=document.getElementById(id);
    if (el) el.addEventListener("change", checkDuplicate);
  });

  const form = document.getElementById("prediction-form");
  form.onsubmit = (e)=>{
    e.preventDefault();
    if (isWeekendLocked(nextRace, weekendSessions)) {
      showError("Predictions are locked — FP1 has already started.");
      setTimeout(()=>showError(""),3000);
      return;
    }
    const pole = document.getElementById("pole").value;
    const winner = document.getElementById("winner").value;
    const p2 = document.getElementById("p2").value;
    const p3 = document.getElementById("p3").value;
    const sprintPole = document.getElementById("sprint-pole").value;
    const sprintWinner = document.getElementById("sprint-winner").value;
    const wildcardDriver = document.getElementById("wildcard-driver").value;
    if (!pole || !winner || !p2 || !p3 || !wildcardDriver || (hasSprint && (!sprintPole || !sprintWinner))) {
      showError("Fill Pole, Winner, P2, P3 and Wildcard to save" + (hasSprint ? " (+ Sprint Pole/Winner)." : "."));
      setTimeout(()=>showError(""),3000);
      return;
    }
    const vals=[winner,p2,p3].filter(Boolean);
    if (new Set(vals).size !== vals.length) { showError("Winner/P2/P3 must be different drivers."); setTimeout(()=>showError(""),3000); return; }
    const payload={ pole,winner,p2,p3,sprintPole,sprintWinner,wildcardDriver,wildcardPos, season, round, raceName: nextRace?.raceName, savedAt: new Date().toISOString() };
    localStorage.setItem(`f1predict:${season}:${round}`, JSON.stringify(payload));
    const savedEl=document.getElementById("form-saved");
    savedEl.style.display="block"; savedEl.classList.add("show");
    setTimeout(()=>{ savedEl.style.display="none"; },2000);
    showError("");
    if (state.currentTab==="predictions") renderPredictionsTab();
  };
  document.getElementById("clear-btn").onclick = ()=>{
    localStorage.removeItem(`f1predict:${season}:${round}`);
    ["pole","winner","p2","p3","sprint-pole","sprint-winner","wildcard-driver"].forEach(id=> document.getElementById(id).value="");
  };
}

function renderStandings(drivers, constructors) {
  const head = document.getElementById("standings-head").querySelector("tr");
  const body = document.getElementById("standings-body");
  const isDrivers = state.standingsTab==="drivers";
  const cols = isDrivers
    ? [{key:"position",label:"Pos"},{key:"familyName",label:"Driver"},{key:"constructor",label:"Team"},{key:"points",label:"Pts"},{key:"wins",label:"Wins"}]
    : [{key:"position",label:"Pos"},{key:"name",label:"Team"},{key:"points",label:"Pts"},{key:"wins",label:"Wins"}];
  head.innerHTML = cols.map(c=> `<th>${c.label}</th>`).join("");

  const rows = isDrivers ? drivers : constructors;
  body.innerHTML = "";
  if (!rows) return;
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    cols.forEach(c=>{
      const td=document.createElement("td");
      if (isDrivers && c.key==="familyName") {
        const avatar = r.headshotUrl
          ? `<img src="${r.headshotUrl}" alt="" width="32" height="32" style="border-radius:50%; object-fit:cover; border:2px solid var(--border-subtle); background:var(--surface-2);" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div style="display:none; width:32px; height:32px; border-radius:50%; align-items:center; justify-content:center; font-size:11px; font-weight:800; color:#fff; background:${r.teamColour};">${r.code ?? "?"}</div>`
          : `<div style="width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; color:#fff; background:${r.teamColour};">${r.code ?? "?"}</div>`;
        td.innerHTML = `<span style="display:flex; align-items:center; gap:10px;">${avatar}${r.givenName} ${r.familyName} <span style="color:var(--text-dim); font-size:12px;">(${r.code})</span></span>`;
      } else if (!isDrivers && c.key==="name") {
        const key=normalizeTeamName(r.name);
        const logo=TEAM_LOGOS[key];
        if (logo) {
          td.innerHTML = `<span style="display:flex; align-items:center; gap:10px;"><img src="${logo}" alt="${r.name}" style="width:28px; height:28px; object-fit:contain; background:#fff; border-radius:50%; padding:3px; border:2px solid var(--border-subtle);" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div style="display:none; width:28px; height:28px; border-radius:50%; align-items:center; justify-content:center; font-size:10px; font-weight:800; color:#fff; background:${r.teamColour};" title="${r.name}">${r.initials}</div>${r.name}</span>`;
        } else {
          td.innerHTML = `<span style="display:flex; align-items:center; gap:10px;"><div style="width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800; color:#fff; background:${r.teamColour};" title="${r.name}">${r.initials}</div>${r.name}</span>`;
        }
      } else {
        td.textContent = r[c.key] ?? "—";
      }
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  document.getElementById("standings-loading").style.display="none";
  document.getElementById("standings-content").style.display="block";
}

function driverLabel(driverId) {
  if (!driverId) return "—";
  const d = state.standings?.drivers?.find(x=>x.driverId===driverId);
  if (d) return `${d.code} ${d.givenName} ${d.familyName}`;
  return driverId;
}
function driverName(driverId) {
  if (!driverId) return "—";
  const d = state.standings?.drivers?.find(x=>x.driverId===driverId);
  if (d) return `${d.givenName} ${d.familyName}`;
  return driverId;
}
function getAllPredictions() {
  const out=[];
  for (let i=0;i<localStorage.length;i++) {
    const k=localStorage.key(i);
    if (!k || !k.startsWith("f1predict:")) continue;
    // skip wildcardPos helper? we only store f1predict:season:round, not wildcardPos alone now
    const parts=k.split(":");
    if (parts.length!==3) continue;
    try {
      const v=JSON.parse(localStorage.getItem(k));
      if (!v || !v.pole) continue;
      const season=parts[1], round=parts[2];
      out.push({ key:k, season, round: Number(round), raceName: v.raceName || `Round ${round}`, savedAt: v.savedAt, picks: v });
    } catch {}
  }
  out.sort((a,b)=> (b.season!==a.season ? b.season.localeCompare(a.season) : b.round - a.round));
  return out;
}
async function computeScoreForPrediction(pred, race, quali, sprint) {
  const posMap={}; if (race) race.results.forEach(r=> posMap[r.driverId]=r.positionNum);
  const gridPoleId = race?.results?.find(r=> r.grid===1)?.driverId ?? null;
  let score=0; const details=[];
  if (pred.pole && gridPoleId && pred.pole===gridPoleId) { score+=SCORING.pole; details.push("Pole +5"); } else if(pred.pole) details.push("Pole 0");
  if (pred.winner && posMap[pred.winner]===1) { score+=SCORING.win; details.push("Winner +10"); } else details.push("Winner 0");
  [["p2",2],["p3",3]].forEach(([k,pos])=>{
    const id=pred[k];
    if (!id) return;
    const actual=posMap[id];
    if (actual===pos) { score+=SCORING.podiumExact; details.push(`${k.toUpperCase()} exact +5`); }
    else if (actual>=1 && actual<=3) { score+=SCORING.podiumAnyOrder; details.push(`${k.toUpperCase()} podium +2`); }
    else details.push(`${k.toUpperCase()} 0`);
  });
  if (pred.wildcardDriver && pred.wildcardPos) {
    const actual=posMap[pred.wildcardDriver];
    if (actual===Number(pred.wildcardPos)) { score+=SCORING.wildcard; details.push(`P${pred.wildcardPos} +8`); }
    else details.push(`P${pred.wildcardPos} 0`);
  }
  if (pred.sprintPole || pred.sprintWinner) {
    const sprintPosMap={}, sprintGridMap={};
    if (sprint) sprint.results.forEach(r=> { sprintPosMap[r.driverId]=r.position; sprintGridMap[r.driverId]=r.grid; });
    if (pred.sprintWinner && sprintPosMap[pred.sprintWinner]===1) { score+=SCORING.sprintWin; details.push("Sprint Win +5"); } else if(pred.sprintWinner) details.push("Sprint Win 0");
    if (pred.sprintPole && sprintGridMap[pred.sprintPole]===1) { score+=SCORING.sprintPole; details.push("Sprint Pole +3"); } else if(pred.sprintPole) details.push("Sprint Pole 0");
  }
  return { score, details, hasResults: !!(race||quali) };
}
async function renderPredictionsTab() {
  const currentEl=document.getElementById("predictions-current");
  const listEl=document.getElementById("predictions-list");
  const emptyEl=document.getElementById("predictions-empty");
  const all=getAllPredictions();
  const nextRace=state.weekend?.nextRace;
  const nextKey= nextRace ? `f1predict:${nextRace.season}:${nextRace.round}` : null;
  const currentPred = nextKey ? all.find(p=>p.key===nextKey) : null;
  const pastPreds = all.filter(p=>p.key!==nextKey);

  // current
  if (currentPred) {
    const p=currentPred.picks;
    currentEl.style.display="block";
    currentEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
        <h3 style="font-family:var(--font-display); font-weight:700; margin:0; font-size:16;">Current — ${currentPred.raceName} (Rd ${currentPred.round})</h3>
        <span class="pill" style="font-size:12;">Saved ${new Date(p.savedAt).toLocaleString()}</span>
      </div>
      <div id="predictions-current-score" style="color:var(--text-dim); font-size:13;">Checking results…</div>
      <ul style="list-style:none; padding:0; margin:10px 0 0; display:flex; flex-direction:column;">
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Pole</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.pole)}</span></li>
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Winner</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.winner)}</span></li>
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Podium P2</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.p2)}</span></li>
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Podium P3</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.p3)}</span></li>
        ${p.sprintPole ? `<li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Sprint Pole</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.sprintPole)}</span></li>` : ""}
        ${p.sprintWinner ? `<li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Sprint Win</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.sprintWinner)}</span></li>` : ""}
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0;"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Wildcard P${p.wildcardPos}</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.wildcardDriver)}</span></li>
      </ul>
    `;
    // try score it if race done
    (async()=>{
      try {
        const race=await getRaceResults(currentPred.season, String(currentPred.round)).catch(()=>null);
        const quali=await getQualifyingResults(currentPred.season, String(currentPred.round)).catch(()=>null);
        const sprint=await getSprintResults(currentPred.season, String(currentPred.round)).catch(()=>null);
        const {score, details, hasResults}=await computeScoreForPrediction(p, race, quali, sprint);
        const scoreEl=document.getElementById("predictions-current-score");
        if (scoreEl) {
          if (hasResults) scoreEl.innerHTML = `<b style="font-family:var(--font-display); color:var(--text);">${score} pts</b> • <span style="color:var(--text-dim)">${details.join(" • ")}</span>`;
          else scoreEl.textContent = "Race not finished — score pending";
        }
      } catch {}
    })();
  } else {
    currentEl.style.display="none";
  }

  if (!all.length) {
    emptyEl.style.display="block";
    listEl.innerHTML="";
    return;
  }
  emptyEl.style.display="none";

  // past predictions
  listEl.innerHTML = pastPreds.length ? "" : `<div class="card" style="text-align:center; color:var(--text-dim);">No past predictions yet.</div>`;
  for (const item of pastPreds) {
    const p=item.picks;
    const card=document.createElement("div");
    card.className="card";
    card.style.padding="16px";
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; align-items:center;">
        <h4 style="font-family:var(--font-display); font-weight:700; margin:0; font-size:14;">${item.raceName} — Rd ${item.round} (${item.season})</h4>
        <span style="font-size:12; color:var(--text-dim);">${p.savedAt ? new Date(p.savedAt).toLocaleDateString() : ""}</span>
      </div>
      <ul style="list-style:none; padding:0; margin:10px 0 0; display:flex; flex-direction:column;">
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Pole</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.pole)}</span></li>
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Winner</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.winner)}</span></li>
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">P2 / P3</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.p2)} / ${driverName(p.p3)}</span></li>
        ${p.sprintPole||p.sprintWinner ? `<li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Sprint</span><span style="font-weight:700; font-size:14px; text-align:right;">Pole ${driverName(p.sprintPole)} • Win ${driverName(p.sprintWinner)}</span></li>` : ""}
        <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:8px 0;"><span style="color:var(--text-dim); font-weight:600; font-size:13px;">Wildcard P${p.wildcardPos||"?"}</span><span style="font-weight:700; font-size:14px; text-align:right;">${driverName(p.wildcardDriver)}</span></li>
      </ul>
      <div class="score-line" style="margin-top:10px; color:var(--text-dim); font-size:12;">Loading score…</div>
      <div style="margin-top:10px; display:flex; gap:8px;">
        <button class="secondary-btn" style="padding:6px 12px; font-size:12;" data-jump="${item.round}">View Results</button>
        <button class="secondary-btn" style="padding:6px 12px; font-size:12;" data-delete="${item.key}">Delete</button>
      </div>
    `;
    listEl.appendChild(card);
    // async score
    (async()=>{
      try {
        const race=await getRaceResults(item.season, String(item.round)).catch(()=>null);
        const quali=await getQualifyingResults(item.season, String(item.round)).catch(()=>null);
        const sprint=await getSprintResults(item.season, String(item.round)).catch(()=>null);
        const {score, details, hasResults}=await computeScoreForPrediction(p, race, quali, sprint);
        const scoreEl=card.querySelector(".score-line");
        if (hasResults) scoreEl.innerHTML = `<b style="color:var(--text); font-family:var(--font-display);">${score} pts</b> • ${details.join(" • ")}`;
        else scoreEl.textContent="Results not yet available";
      } catch { card.querySelector(".score-line").textContent="Could not load results"; }
    })();
    card.querySelector("[data-jump]")?.addEventListener("click", ()=>{
      switchTab("results");
      loadResults(String(item.round));
      window.scrollTo({top:0, behavior:"smooth"});
    });
    card.querySelector("[data-delete]")?.addEventListener("click", ()=>{
      if (confirm("Delete prediction for "+item.raceName+"?")) {
        localStorage.removeItem(item.key);
        renderPredictionsTab();
      }
    });
  }
}

async function loadResults(roundOverride) {
  const loadingEl=document.getElementById("results-loading");
  const contentEl=document.getElementById("results-content");
  const errorEl=document.getElementById("results-error");
  const titleEl=document.getElementById("results-title");
  loadingEl.style.display="flex";
  contentEl.style.display="none";
  errorEl.style.display="none";
  try {
    let round = roundOverride;
    if (!round) {
      // find last completed race 
      const schedule = await getSchedule("current");
      const now=Date.now();
      let last=null;
      for (const r of schedule) {
        const t=new Date(`${r.date}T${r.time ?? "00:00:00Z"}`).getTime();
        if (t < now) last=r;
      }
      round = last?.round ?? schedule[schedule.length-1]?.round;
    }
    const season="current";
    const [race, quali, sprint] = await Promise.all([
      getRaceResults(season, round).catch(()=>null),
      getQualifyingResults(season, round).catch(()=>null),
      getSprintResults(season, round).catch(()=>null),
    ]);
    if (!race && !quali) throw new Error("No results yet for this round.");
    titleEl.textContent = race ? `${race.raceName} — Round ${round} (${race.date})` : `Round ${round}`;
    document.getElementById("results-round-input").value = round;
    contentEl.dataset.loaded="1";

    // score preview
    try {
      const seasonKey = race?.season ?? new Date().getUTCFullYear();
      const key=`f1predict:${seasonKey}:${round}`;
      const raw=localStorage.getItem(key);
      const previewCard=document.getElementById("score-preview");
      if (raw && race?.results?.length) {
        const pred=JSON.parse(raw);
        const posMap={}; race.results.forEach(r=> posMap[r.driverId]=r.positionNum);
        const gridPoleId = race.results.find(r=> r.grid===1)?.driverId ?? null;
        let score=0; const details=[];
        if (pred.pole && gridPoleId && pred.pole===gridPoleId) { score+=SCORING.pole; details.push("Pole +5"); } else if(pred.pole) details.push("Pole 0");
        if (pred.winner && posMap[pred.winner]===1) { score+=SCORING.win; details.push("Winner +10"); } else details.push("Winner 0");
        [["p2",2],["p3",3]].forEach(([k,pos])=>{
          const id=pred[k];
          if (!id) return;
          const actual=posMap[id];
          if (actual===pos) { score+=SCORING.podiumExact; details.push(`${k.toUpperCase()} exact +5`); }
          else if (actual>=1 && actual<=3) { score+=SCORING.podiumAnyOrder; details.push(`${k.toUpperCase()} podium wrong slot +2`); }
          else details.push(`${k.toUpperCase()} 0`);
        });
        if (pred.wildcardDriver && pred.wildcardPos) {
          const actual=posMap[pred.wildcardDriver];
          if (actual===Number(pred.wildcardPos)) { score+=SCORING.wildcard; details.push(`Wildcard P${pred.wildcardPos} +8`); }
          else details.push(`Wildcard 0 (finished P${actual ?? "?"})`);
        }
        // sprint scoring: only pole (3) + win (5) if sprint weekend
        if (pred.sprintPole || pred.sprintWinner) {
          const sprintPosMap={}; const sprintGridMap={};
          if (sprint) sprint.results.forEach(r=> { sprintPosMap[r.driverId]=r.position; sprintGridMap[r.driverId]=r.grid; });
          if (pred.sprintWinner && sprintPosMap[pred.sprintWinner]===1) { score+=SCORING.sprintWin; details.push("Sprint Win +5"); }
          else if (pred.sprintWinner) details.push("Sprint Win 0");
          if (pred.sprintPole) {
            if (sprintGridMap[pred.sprintPole]===1) { score+=SCORING.sprintPole; details.push("Sprint Pole +3"); }
            else if (sprintGridMap[pred.sprintPole] !== undefined) details.push("Sprint Pole 0");
            else if (pred.sprintPole) details.push("Sprint Pole 0");
          }
        }
        document.getElementById("score-preview-title").textContent = `Your Score — Rd ${round} ${race.raceName}`;
        document.getElementById("score-preview-num").textContent = `${score} pts`;
        document.getElementById("score-preview-details").textContent = details.join(" • ");
        document.getElementById("score-preview-picks").textContent = `Your picks: Pole ${pred.pole} • Win ${pred.winner} • P2 ${pred.p2} • P3 ${pred.p3}` + (pred.wildcardPos ? ` • Wildcard P${pred.wildcardPos}: ${pred.wildcardDriver}` : "") + (pred.sprintPole ? ` • Sprint Pole ${pred.sprintPole}` : "") + (pred.sprintWinner ? ` • Sprint Win ${pred.sprintWinner}` : "");
        previewCard.style.display="block";
      } else { document.getElementById("score-preview").style.display="none"; }
    } catch {}

    // race
    const raceBody=document.getElementById("results-race-body");
    raceBody.innerHTML="";
    if (race?.results?.length) {
      race.results.slice(0,10).forEach(r=>{
        const tr=document.createElement("tr");
        tr.innerHTML=`<td>${r.position}</td><td><b>${r.code}</b> <span style="color:var(--text-dim); font-size:12px;">${r.givenName} ${r.familyName}</span></td><td style="color:var(--text-dim); font-size:12px;">${r.constructorName}</td><td>${r.points}</td><td style="font-size:12px; color:${r.status!=="Finished" ? "var(--danger)" : "var(--text-dim)"};">${r.status}</td>`;
        raceBody.appendChild(tr);
      });
    } else {
      raceBody.innerHTML=`<tr><td colspan="5" style="color:var(--text-dim);">No race results yet.</td></tr>`;
    }
    // quali
    const qualiBody=document.getElementById("results-quali-body");
    const qualiEmpty=document.getElementById("results-quali-empty");
    qualiBody.innerHTML="";
    if (quali?.results?.length) {
      qualiEmpty.style.display="none";
      quali.results.slice(0,5).forEach(r=>{
        const tr=document.createElement("tr");
        tr.innerHTML=`<td>${r.position}</td><td><b>${r.code}</b> <span style="color:var(--text-dim); font-size:12px;">${r.givenName} ${r.familyName}</span></td><td style="font-size:12px; color:var(--text-dim);">${r.constructorName}</td><td style="font-family:monospace; font-size:13px;">${r.q3 ?? r.q2 ?? r.q1 ?? "—"}</td>`;
        qualiBody.appendChild(tr);
      });
    } else {
      qualiEmpty.style.display="block";
      qualiBody.innerHTML="";
    }
    // sprint
    const sprintWrap=document.getElementById("results-sprint-wrap");
    const sprintBody=document.getElementById("results-sprint-body");
    if (sprint?.results?.length) {
      sprintWrap.style.display="block";
      sprintBody.innerHTML="";
      sprint.results.slice(0,5).forEach(r=>{
        const tr=document.createElement("tr");
        tr.innerHTML=`<td>${r.position}</td><td><b>${r.code}</b> <span style="color:var(--text-dim); font-size:12px;">${r.givenName} ${r.familyName}</span></td><td style="font-size:12px; color:var(--text-dim);">${r.constructorName}</td><td>${r.points}</td>`;
        sprintBody.appendChild(tr);
      });
    } else sprintWrap.style.display="none";

    loadingEl.style.display="none";
    contentEl.style.display="block";
  } catch(e){
    loadingEl.style.display="none";
    errorEl.textContent=e.message;
    errorEl.style.display="block";
    errorEl.classList.add("show");
  }
}

async function init() {
  initTheme();
  document.querySelectorAll(".nav-pill[data-tab]").forEach(b=> b.addEventListener("click", ()=> switchTab(b.dataset.tab)));
  document.getElementById("nav-home").addEventListener("click", e=> { e.preventDefault(); switchTab("play"); });
  document.querySelectorAll("[data-standings-tab]").forEach(b=> b.addEventListener("click", ()=>{
    state.standingsTab=b.dataset.standingsTab;
    document.querySelectorAll("[data-standings-tab]").forEach(x=>{
      const active=x.dataset.standingsTab===state.standingsTab;
      x.style.background=active?"var(--surface-2)":"transparent";
      x.style.color=active?"var(--text)":"var(--text-dim)";
    });
    if (state.standings) renderStandings(state.standings.drivers, state.standings.constructors);
  }));
  document.getElementById("results-load-btn").addEventListener("click", ()=>{
    const v=document.getElementById("results-round-input").value;
    if (v) loadResults(v);
  });
  document.getElementById("results-round-input").addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); const v=e.target.value; if(v) loadResults(v);} });

  // fetch weekend + standings — resilient: each call isolated so one rate-limit doesn't kill whole page
  let schedule=null, driverStandings=null, constructorStandings=null, upcoming=[], media={byCode:{},teamColours:{}};
  try { schedule = await getSchedule("current"); } catch(e){ console.error("schedule failed", e); showError("Schedule unavailable — retry shortly (Jolpica may be rate-limited)."); }
  try { driverStandings = await getDriverStandings("current"); } catch(e){ console.error("driverStandings failed", e); }
  try { constructorStandings = await getConstructorStandings("current"); } catch(e){ console.error("constructorStandings failed", e); }
  try { upcoming = await getUpcomingSessions(5); } catch(e){ console.warn("upcoming sessions failed", e.message); upcoming=[]; }
  try { media = await getDriverMedia(); } catch(e){ console.warn("media failed", e.message); media={byCode:{},teamColours:{}}; }

  try {
    if (!schedule || !schedule.length) throw new Error("No schedule data");
    if (!driverStandings || !driverStandings.drivers?.length) {
      // still allow page to run with empty drivers, but warn
      if (!driverStandings) showError("Standings unavailable — showing schedule only. Retry shortly.");
      driverStandings = driverStandings ?? { season:"2026", round:"?", drivers:[] };
      constructorStandings = constructorStandings ?? { season:"2026", round:"?", constructors:[] };
    }

    // find nextRace
    const now=Date.now();
    let nextRace=null, lastRace=null;
    for (const r of schedule) {
      const t=new Date(`${r.date}T${r.time ?? "00:00:00Z"}`).getTime();
      if (t>now && !nextRace) nextRace=r;
      if (t<now) lastRace=r;
    }
    if (!nextRace && schedule.length) nextRace=schedule[schedule.length-1];

    // build weekendSessions precise from OpenF1
    let weekendSessions=[];
    try {
      const year=new Date().getUTCFullYear();
      const all = await getSessionsForYear(year);
      let targetMeetingKey=null;
      if (upcoming.length) {
        targetMeetingKey=upcoming[0].meetingKey;
        const upcomingDate=new Date(upcoming[0].startTime).getTime();
        const nextRaceDate=new Date(`${nextRace.date}T${nextRace.time ?? "00:00:00Z"}`).getTime();
        if (Math.abs(upcomingDate-nextRaceDate) > 7*24*60*60*1000) targetMeetingKey=null;
      }
      if (!targetMeetingKey) {
        let best=null, bestDiff=Infinity;
        for (const s of all) {
          if (s.session_name!=="Race") continue;
          const diff=Math.abs(new Date(s.date_start).getTime()-new Date(`${nextRace.date}T${nextRace.time ?? "00:00:00Z"}`).getTime());
          if (diff<bestDiff){ bestDiff=diff; best=s; }
        }
        if (best) targetMeetingKey=best.meeting_key;
      }
      if (targetMeetingKey!=null) {
        weekendSessions = all.filter(s=> s.meeting_key===targetMeetingKey && !s.is_cancelled)
          .sort((a,b)=> new Date(a.date_start)-new Date(b.date_start))
          .map(s=> ({ sessionName:s.session_name, startTime:s.date_start, endTime:s.date_end }));
      }
    } catch(e){ console.warn("weekendSessions openf1 failed", e.message); }
    if (!weekendSessions.length) weekendSessions = buildFallbackSessions(nextRace);

    state.weekend={ nextRace, lastRace, weekendSessions };
    state.standingsTab="drivers";

    // enrich standings with media
    const byCode=media.byCode ?? {}, teamColours=media.teamColours ?? {};
    const drivers = driverStandings.drivers.map(d=>{
      const m=d.code?byCode[d.code]:null;
      return { ...d, headshotUrl: m?.headshotUrl ?? null, teamColour: m?.teamColour ?? fallbackColour(d.constructor) };
    });
    const constructors = constructorStandings.constructors.map(c=>({
      ...c,
      teamColour: teamColours[normalizeTeamName(c.name)] ?? fallbackColour(c.name),
      initials: c.name.split(" ").filter(w=>w.length>2).slice(0,2).map(w=>w[0]).join("").toUpperCase(),
    }));
    state.standings={ season: driverStandings.season, round: driverStandings.round, drivers, constructors };

    // render
    startCountdown(nextRace, weekendSessions);
    initPredictionForm(drivers, nextRace, weekendSessions);
    document.getElementById("standings-title").textContent = `${state.standings.season} Championship • Round ${state.standings.round}`;
    renderStandings(drivers, constructors);

  } catch(e){
    console.error(e);
    window.lastInitError = e.message + " | " + (e.stack||"").slice(0,800);
    try { localStorage.setItem("lastInitError", window.lastInitError); } catch {}
    const isRateLimit = /429|rate-limit/i.test(e.message || "");
    showError(`Could not load F1 data${isRateLimit ? " — rate-limited (429)" : ""}: ${e.message} — retry shortly. `);
    // also log stack to error div for debugging
    const dbg=document.createElement("pre");
    dbg.style.fontSize="10px"; dbg.style.whiteSpace="pre-wrap"; dbg.style.marginTop="8px"; dbg.style.color="var(--text-dim)";
    dbg.textContent=(e.stack||"").slice(0,600);
    const errEl2=document.getElementById("global-error");
    if (errEl2 && !errEl2.querySelector("pre")) errEl2.appendChild(dbg);
    // append retry button that clears cache
    const errEl3=document.getElementById("global-error");
    if (errEl3 && !errEl3.querySelector("button")) {
      const btn=document.createElement("button");
      btn.textContent="Clear cache & retry";
      btn.className="secondary-btn";
      btn.style.marginLeft="10px";
      btn.style.padding="6px 12px";
      btn.style.fontSize="12px";
      btn.onclick=()=>{
        Object.keys(localStorage).forEach(k=>{ if(k.startsWith("cache:")) localStorage.removeItem(k); });
        location.reload();
      };
      errEl3.appendChild(btn);
    }
    const ct=document.getElementById("countdown-title");
    if (ct) ct.textContent="Could not load weekend";
    const fl=document.getElementById("form-loading");
    if (fl) fl.textContent="Failed to load drivers. Retry refresh.";
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
