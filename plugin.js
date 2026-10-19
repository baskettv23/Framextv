// Kino plugin: FrameXTV — movies, series and anime from frameXTV's own streaming
// providers (CineJoy via api.wing.st, Movy via api.wecollege.net), catalog data via
// TMDB. All video is served through the site's own sandbox proxy on workers.dev.
// One file, no imports: Kino only loads this file (the "entry").

const ENDEC = "https://enc-dec.app/api";
const WING = "https://api.wing.st";
const MOVY_API = "https://api.wecollege.net";
const MOVY_REF = "https://www.movy.bz/";
const CINE_REF = "https://cinejoy.pk/";
const PROXY = "https://frappe.hybrows.workers.dev/";
const TMDB_HOST = "https://api.themoviedb.org/3";
const TMDB_LANG = "es-CO";
const TMDB_IMG = "https://image.tmdb.org/t/p/";

// CineJoy servers, the site's own cascade order, best first.
const CINE_SERVERS = ["Lisbon", "Nebula", "Athens", "Solara"];
// Movy city servers, the site's own order (4K Miami first).
const MOVY_SERVERS = ["miami", "atlanta", "dallas"];

const ITEM_ID = /^[A-Za-z0-9._~-]{1,128}$/;
const GENRE_BY_TMDB_ID = {
  28: "Acción", 12: "Aventura", 16: "Animación", 35: "Comedia", 80: "Crimen",
  99: "Documental", 18: "Drama", 10751: "Familia", 14: "Fantasía", 36: "Historia",
  27: "Terror", 10402: "Música", 9648: "Misterio", 10749: "Romance",
  878: "Ciencia ficción", 53: "Suspenso", 10770: "Televisión", 10752: "Guerra",
  37: "Western", 10759: "Acción y suspenso", 10762: "Infantil", 10763: "Noticias",
  10764: "Realidad", 10765: "Ciencia ficción y fantasía", 10766: "Telenovela",
  10767: "Talk", 10768: "Guerra y política",
};

// kino.log never breaks what it reports on.
function log(...args) {
  try { kino.log(...args); } catch { /* line lost, result kept */ }
}

// Text the CODE builds at run time follows kino.lang (es-CO before 0.9.54).
function lang() {
  try { return String(kino.lang || "es-CO"); } catch { return "es-CO"; }
}
function tx(es, en) {
  return lang().slice(0, 2) === "en" ? en : es;
}
function err(code, detail, userMessage) {
  return kino.error(code, detail, userMessage ? { userMessage } : undefined);
}
const UMSG = {
  noStream: () => tx("Ningún servidor tiene este título disponible ahora. Prueba más tarde.",
    "No server has this title available right now, try again later."),
  noTmdb: () => tx("Kino no trae llave de TMDB y la mía no está configurada. Escríbela en Ajustes.",
    "Kino has no TMDB key and mine is not set. Write it under Settings."),
  mb: () => tx("No se pudo leer la respuesta del servidor.",
    "Could not read the server's answer."),
};

// ---- base64url helpers -------------------------------------------------

function b64pad(s) {
  let t = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return t;
}
function b64ToU8(s) {
  const bin = atob(b64pad(s));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function u8ToB64(u) {
  let s = "";
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

// Every video goes through the site's sandbox proxy, so the player only ever
// touches one declared host (frappe.hybrows.workers.dev) no matter which CDN
// a server rotates through.
function throughProxy(url, ref) {
  const p = new URLSearchParams({ url, ref, referer: ref, origin: ref });
  return PROXY + "?" + p.toString();
}

// ---- one fetch, one thrown only AFTER its first await -------------------

async function getJson(url, options) {
  await null;
  const r = await kino.fetch(url, options);
  if (!r.ok) throw new Error("HTTP " + r.status + " en " + url.slice(0, 60));
  return r.json();
}

// ---- TMDB catalog ----------------------------------------------------

// kino.tmdb (Kino 0.9.53) first: no key anywhere in the code. Older Kino falls
// back to the person's own key in settings. Never a throw before its first await.
async function tmdbGet(path, params) {
  await null;
  if (typeof kino.tmdb === "function") {
    return kino.tmdb(path, params || {});
  }
  const key = String(kino.config.get("tmdbKey") || "").trim();
  if (!key) throw err("auth_required", "Kino " + kino.appVersion + " sin kino.tmdb y sin llave", UMSG.noTmdb());
  const p = new URLSearchParams();
  p.set("api_key", key);
  p.set("language", TMDB_LANG);
  for (const k of Object.keys(params || {})) {
    const v = params[k];
    p.set(k, String(v));
  }
  return getJson(TMDB_HOST + path + "?" + p.toString(), { timeoutMs: 20000 });
}

function tmdbYear(d) {
  const s = String(d || "");
  return /^\d{4}/.test(s) ? s.slice(0, 4) : undefined;
}
function tmdbGenres(ids) {
  const out = [];
  for (const id of ids || []) {
    const g = GENRE_BY_TMDB_ID[id];
    if (g && !out.includes(g)) out.push(g);
    if (out.length >= 5) break;
  }
  return out;
}
function tmdbItem(res, kindHint) {
  const kind = kindHint || (res.media_type === "tv" ? "series" : "movie");
  const name = res.title || res.name || "";
  const year = tmdbYear(res.release_date || res.first_air_date);
  const item = {
    id: (kind === "series" ? "s" : "f") + res.id,
    ref: (kind === "series" ? "t:" : "f:") + res.id,
    title: String(name).slice(0, 200),
    kind,
  };
  if (year) item.year = year;
  if (res.poster_path) item.poster = TMDB_IMG + "w500" + res.poster_path;
  if (res.backdrop_path) item.backdrop = TMDB_IMG + "w780" + res.backdrop_path;
  if (res.overview) item.overview = String(res.overview).slice(0, 400);
  if (res.original_title || res.original_name) item.originalTitle = String(res.original_title || res.original_name).slice(0, 200);
  const genres = tmdbGenres(res.genre_ids);
  if (genres.length) item.genres = genres;
  if (typeof res.vote_average === "number" && res.vote_average > 0) item.rating = Math.round(res.vote_average * 10) / 10;
  item.ids = { tmdb: res.id };
  if (res.adult === true) item.adult = true;
  return item;
}

// A search: movie queries, series queries and a mixed multi-search, in TMDB.
export async function search(q) {
  await null;
  const text = String(q.q || "").trim();
  if (!text || q.type === "music" || q.type === "podcast") return [];
  let path = "/search/multi";
  const params = { query: text, include_adult: false, language: TMDB_LANG, page: 1 };
  if (q.type === "series") path = "/search/tv";
  if (q.type === "movie") path = "/search/movie";
  if (q.year) {
    if (path === "/search/movie") params.year = q.year;
    else if (path === "/search/tv") params.first_air_date_year = q.year;
  }
  const data = await tmdbGet(path, params);
  const items = [];
  const seen = new Set();
  for (const res of (data && data.results) || []) {
    if (!res || !res.id) continue;
    const kind = path === "/search/movie" ? "movie" : path === "/search/tv" ? "series" : res.media_type === "tv" ? "series" : res.media_type === "movie" ? "movie" : null;
    if (!kind) continue;
    const item = tmdbItem(res, kind);
    if (!item.title || seen.has(item.id) || !ITEM_ID.test(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= 60) break;
  }
  return items;
}

// ---- the Home rows -----------------------------------------------------

const ROWS = [
  { id: "trend", key: "all-day", title: () => tx("Populares hoy", "Popular today"), path: "/trending/all/day", params: null, genre: "otros" },
  { id: "movies", key: "movie-week", title: () => tx("Películas en tendencia", "Trending movies"), path: "/trending/movie/week", params: null, genre: "peliculas" },
  { id: "series", key: "tv-week", title: () => tx("Series en tendencia", "Trending series"), path: "/trending/tv/week", params: null, genre: "series" },
  { id: "cines", key: "movie-now", title: () => tx("Recién estrenadas", "In theaters"), path: "/movie/now_playing", params: null, genre: "peliculas" },
  { id: "anime", key: "anime", title: () => tx("Anime", "Anime"), path: "/discover/tv", params: { with_genres: 16, sort_by: "popularity.desc" }, genre: "anime" },
];

async function rowPage(rowParams, page) {
  await null;
  const params = Object.assign({}, rowParams.params || {}, { page, language: TMDB_LANG });
  if (rowParams.params && rowParams.params.with_genres) params.include_adult = false;
  const data = await tmdbGet(rowParams.path, params);
  const items = [];
  const kindHint = rowParams.path.indexOf("/tv") === 0 || rowParams.path.indexOf("/trending/tv") === 0 ? "series" : null;
  for (const res of (data && data.results) || []) {
    if (!res || !res.id) continue;
    const item = tmdbItem(res, kindHint);
    if (!item.title || !ITEM_ID.test(item.id)) continue;
    items.push(item);
    if (items.length >= 40) break;
  }
  return items;
}

export async function home() {
  await null;
  const rows = await Promise.all(ROWS.map(async (row) => {
    try {
      const items = await rowPage(row, 1);
      if (!items.length) return null;
      return { id: "row-" + row.id, title: row.title(), genre: row.genre, ref: "t:" + row.key, items };
    } catch (e) {
      log("home row ", row.id, " fallo: ", String(e && e.message || e).slice(0, 120));
      return null;
    }
  }));
  return rows.filter(Boolean);
}

export async function browse(ref, cursor) {
  await null;
  const m = /^t:([a-z-]+):p(\d+)$/.exec(String(cursor || ""));
  const key = m ? m[1] : String(ref || "").slice(2);
  const page = m ? parseInt(m[2], 10) : 1;
  const row = ROWS.find((r) => r.key === key);
  if (!row || page < 1 || page > 500) throw err("not_found", "fila " + String(key).slice(0, 40) + " pagina " + page, UMSG.mb());
  const items = await rowPage(row, page);
  const next = items.length >= 20 ? "t:" + key + ":p" + (page + 1) : undefined;
  return next ? { items, next } : { items };
}

// ---- series seasons and episodes ---------------------------------------

export async function episodes(ref) {
  await null;
  const m = /^t:(\d+)(?::(\d{1,3}))?$/.exec(String(ref || ""));
  if (!m) throw err("not_found", "ref de serie invalido", UMSG.mb());
  const id = m[1];
  const want = m[2] ? parseInt(m[2], 10) : 1;
  const info = await tmdbGet("/tv/" + id, {});
  const seasons = [];
  for (const s of (info.seasons || [])) {
    if (s && s.season_number >= 1 && s.episode_count >= 1) seasons.push(s);
  }
  if (seasons.length > 50) seasons.length = 50;
  let data = null;
  try { data = await tmdbGet("/tv/" + id + "/season/" + want, {}); } catch (e) {
    log("temporada ", want, " fallo: ", String(e && e.message || e).slice(0, 120));
  }
  const list = episodesOf(data, want, id);
  const seasonObjs = seasons.map((s) => ({
    id: "s" + id + "." + s.season_number,
    ref: "t:" + id + ":" + s.season_number,
    title: "T" + s.season_number,
    number: s.season_number,
    current: s.season_number === want,
  }));
  if (!list.length && !seasonObjs.length) throw err("not_found", "sin temporadas en TMDB para " + id, UMSG.mb());
  return { episodes: list, seasons: seasonObjs };
}
function episodesOf(data, season, id) {
  const list = [];
  for (const ep of ((data && data.episodes) || [])) {
    if (!ep || !(ep.episode_number >= 1)) continue;
    const e = { season, number: ep.episode_number, ref: "k:" + id + ":" + season + ":" + ep.episode_number };
    if (ep.name) e.title = String(ep.name).slice(0, 200);
    if (ep.still_path) e.still = TMDB_IMG + "w300" + ep.still_path;
    if (ep.overview) e.overview = String(ep.overview).slice(0, 300);
    if (/^\d{4}-\d\d-\d\d$/.test(String(ep.air_date || ""))) e.airDate = ep.air_date;
    if (ep.runtime >= 1) e.runtimeMinutes = Math.min(1000, ep.runtime);
    list.push(e);
    if (list.length >= 500) break;
  }
  return list;
}

// ---- stream resolution ---------------------------------------------------

export async function resolve(ref) {
  await null;
  const parsed = parseRef(ref);
  if (!parsed) throw err("not_found", "ref no reconocido", UMSG.mb());
  const { tmdb, type, s, e } = parsed;
  const pinned = parsed.server;
  const want = pinned ? [pinned] : CINE_SERVERS.concat(["Movy"]);

  // First working server becomes the concrete stream; the rest become lazy copies.
  let done = null;
  for (let i = 0; i < want.length; i++) {
    const server = want[i];
    try {
      const src = server === "Movy" ? await movy(tmdb, type, s, e, -1) : await cinejoy(tmdb, type, s, e, server);
      if (src && src.url) { done = { server, src, resolved: i + 1 }; break; }
    } catch (ex) {
      log("resolve ", server, ": ", String(ex && ex.message || ex).slice(0, 150));
    }
  }
  if (!done) throw err("not_found", "sin servidor para " + String(ref).slice(0, 60), UMSG.noStream());

  const others = want.filter((w) => w !== done.server);
  const base = parsed.pinned || String(ref);
  const stream = {
    url: done.src.url,
    label: labelOf(done.server),
    alternatives: others.slice(0, 8).map((w) => ({ ref: base + "@" + w, label: labelOf(w) })),
    expiresInSeconds: 1800,
  };
  if (done.src.hls) stream.mime = "application/vnd.apple.mpegurl";
  if (done.src.subtitles && done.src.subtitles.length) {
    stream.subtitles = done.src.subtitles.slice(0, 8).map((sb) => ({ lang: (sb.lang || "en").slice(0, 16) || "en", url: sb.url }));
  }
  return stream;
}

function labelOf(server) {
  const name = server === "Movy" ? "Movy" : "CineJoy " + server;
  return name.slice(0, 48);
}

function parseRef(raw) {
  const ref = String(raw || "").split("@");
  const label = ref.length > 1 ? ref[1] : null;
  const body = ref[0];
  let m = /^f:(\d+)$/.exec(body);
  if (m) return { tmdb: m[1], type: "movie", s: 1, e: 1, server: label, pinned: label ? body : null };
  m = /^k:(\d+):(\d{1,3}):(\d{1,5})$/.exec(body);
  if (m) return { tmdb: m[1], type: "tv", s: parseInt(m[2], 10) || 1, e: parseInt(m[3], 10) || 1, server: label, pinned: label ? body : null };
  m = /^t:(\d+)(?::(\d{1,3}))?$/.exec(body);
  if (m && label) return { tmdb: m[1], type: "tv", s: m[2] ? parseInt(m[2], 10) : 1, e: 1, server: label, pinned: body };
  return null;
}

async function cinejoy(tmdbId, type, season, episode, server) {
  await null;
  const isTv = type === "tv";
  let wingUrl = WING + "/?title=movie&type=" + (isTv ? "series" : "movie") + "&year=&imdb=&tmdb=" + encodeURIComponent(tmdbId) + "&server=" + encodeURIComponent(server);
  if (isTv) wingUrl += "&season=" + encodeURIComponent(String(season)) + "&episode=" + encodeURIComponent(String(episode));
  const enc = await getJson(ENDEC + "/enc-cinejoy?url=" + encodeURIComponent(wingUrl), {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36" },
  });
  if (!enc || enc.status !== 200 || !enc.result || !enc.result.data) throw new Error("enc-cinejoy sin payload");
  const state = enc.result.state || null;
  const body = b64ToU8(enc.result.data);
  const raw = await getJsonForBin(WING + "/g", u8ToB64(body), CINE_REF);
  let json = null;
  if (state && state.responseKey && state.aad) {
    try {
      const iv = raw.subarray ? raw.subarray(0, 12) : raw.slice(0, 12);
      const ct = raw.subarray ? raw.subarray(12) : raw.slice(12);
      json = JSON.parse(kino.crypto.decrypt("aes-256-gcm", {
        key: state.responseKey, keyEncoding: "base64",
        iv: u8ToB64(iv), ivEncoding: "base64",
        data: u8ToB64(ct), inputEncoding: "base64", outputEncoding: "utf8",
        aad: state.aad, aadEncoding: "base64",
      }));
    } catch (ex) {
      log("gcm fallo: ", String(ex && ex.message || ex).slice(0, 120));
      json = null;
    }
  }
  if (!json) {
    const dec = await kino.fetch(ENDEC + "/dec-cinejoy", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ text: u8ToB64(raw), state }),
    });
    if (dec.ok) { const j = await dec.json(); json = j && j.result; }
  }
  if (!json) throw new Error(UMSG.mb());
  const streams = (json && json.data && json.data.stream) || json.stream || null;
  if (!Array.isArray(streams)) throw new Error("payload sin fuentes HLS");
  let picked = null;
  for (const st of streams) {
    if (!st) continue;
    if (st.type === "hls" && typeof st.playlist === "string" && st.playlist.slice(0, 8) === "https://") { picked = { url: st.playlist, hls: true }; break; }
    if (st.type === "file" && st.qualities) {
      for (const q of Object.keys(st.qualities)) {
        const u = st.qualities && st.qualities[q] && st.qualities[q].url;
        if (typeof u === "string" && u.slice(0, 8) === "https://") { picked = { url: u }; break; }
      }
      if (picked) break;
    }
  }
  if (!picked) throw new Error("sin fuente https");
  if (picked.hls) picked.url = throughProxy(picked.url, CINE_REF);
  return picked;
}

async function getJsonForBin(url, base64, ref) {
  await null;
  const r = await kino.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", Accept: "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36", Origin: ref, Referer: ref },
    body: { base64 },
    timeoutMs: 25000,
  });
  if (!r.ok) throw new Error("gateway HTTP " + r.status);
  return b64ToU8(r.base64());
}

// ---- Movy ---------------------------------------------------------------

async function movySeed(tmdbId) {
  await null;
  const r = await kino.fetch(MOVY_API + "/seed?mediaId=" + encodeURIComponent(tmdbId), {
    headers: { Origin: MOVY_REF, Referer: MOVY_REF, "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36" },
    timeoutMs: 20000,
  });
  if (!r.ok) throw new Error("seed HTTP " + r.status);
  const j = await r.json();
  if (!j || typeof j.seed !== "string" || j.seed.length < 8) throw new Error("seed invalido");
  return j.seed;
}

async function movy(tmdbId, type, season, episode, serverIdx) {
  await null;
  const seed = await movySeed(tmdbId);
  const list = serverIdx >= 0 ? [MOVY_SERVERS[serverIdx]] : MOVY_SERVERS;
  let out = null;
  for (const endpoint of list) {
    const p = new URLSearchParams();
    p.set("mediaType", type === "tv" ? "tv" : "movie");
    p.set("tmdbId", String(tmdbId));
    p.set("enc", "2");
    p.set("seed", seed);
    if (type === "tv") { p.set("seasonId", String(season)); p.set("episodeId", String(episode)); }
    const r = await kino.fetch(MOVY_API + "/" + endpoint + "/sources?" + p.toString(), {
      headers: { Origin: MOVY_REF, Referer: MOVY_REF, "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36" },
      timeoutMs: 25000,
    });
    if (!r.ok) continue;
    const text = r.text().trim();
    if (text.length <= 10) continue;
    let data;
    try { data = JSON.parse(movyDecrypt(text, seed, parseInt(String(tmdbId), 10) || 0)); } catch { data = null; }
    if (!data) continue;
    let url = null;
    let hls = false;
    for (const src of (data.sources || [])) {
      const u = src && src.url || "";
      if (typeof u !== "string" || u.slice(0, 8) !== "https://") continue;
      const split = u.split("?")[0].toLowerCase();
      if (split.endsWith(".mp4") && !hls) { url = u; out = { url: throughProxy(u, MOVY_REF) }; }
      else if (!hls) { url = u; hls = true; out = { url: throughProxy(u, MOVY_REF), hls: true }; }
      if (hls) break;
    }
    if (Array.isArray(data.subtitles)) {
      const subs = [];
      for (const sb of data.subtitles) {
        const u = sb && sb.url || "";
        if (typeof u === "string" && u.slice(0, 8) === "https://") subs.push({ lang: (sb.lang || sb.language || "en").slice(0, 16) || "en", url: throughProxy(u, MOVY_REF) });
      }
      if (subs.length) out.subtitles = subs;
    }
    if (out) break;
  }
  return out;
}

function movyCipher(data) {
  // the site's own PRNG state table, ported verbatim (BigInt is supported by QuickJS)
  const shift = (v, n) => { const k = n & 31; return k === 0 ? v >>> 0 : ((v << k) | (v >>> (32 - k))) >>> 0; };
  const mix = (t) => { t = BigInt(t) & 4294967295n; t ^= t >> 16n; t = (t * 2246822507n) & 4294967295n; t ^= t >> 13n; t = (t * 3266489909n) & 4294967295n; return Number((t ^ (t >> 16n)) & 4294967295n); };
  const fnv = (s) => { let t = 2166136261; for (let i = 0; i < s.length; i++) t = Math.imul(t ^ s.charCodeAt(i), 16777619) >>> 0; return mix(t); };
  const initState = (key, extra) => {
    const s = new Uint32Array(61);
    const isSet = new Uint8Array(61);
    let i = mix(fnv(key) ^ mix((extra ^ 2654435769) >>> 0));
    for (let e = 0; e < 8; e++) {
      const t = i % 61;
      i = shift((i + 2654435769) >>> 0, 7 + (7 * e));
      s[t] = (i ^ mix(i)) >>> 0;
      isSet[t] = 1;
      i = mix((i + t) >>> 0);
    }
    return { s, isSet, acc: mix((2779096485 ^ i) >>> 0) };
  };
  const step = (st, n) => {
    const slot = st.acc % 61;
    let hi = 0;
    let lo = 0;
    if (st.isSet[slot]) { hi = 4294967295; lo = st.s[slot]; }
    const o = Math.imul(n + 1, 2654435769) >>> 0;
    const c = (lo ^ o) >>> 0;
    const joined = (((st.acc ^ c | st.acc & c & hi) >>> 0) + st.acc) >>> 0;
    st.acc = mix((shift(joined, 31 & slot) ^ shift(st.acc, 31 & (st.acc * 7))) + 2654435769 >>> 0);
    st.s[slot] = st.acc;
    st.isSet[slot] = 1;
    return st.acc;
  };
  return { initState, step };
}
function movyDecrypt(text, seed, tmdbId) {
  const { initState, step } = movyCipher();
  const st = initState(seed, tmdbId >>> 0);
  const data = b64ToU8(text);
  let i = 0;
  for (let p = 0; p < data.length;) {
    const w = step(st, i++);
    data[p] ^= w & 255; p++;
    if (p < data.length) { data[p] ^= (w >>> 8) & 255; p++; }
    if (p < data.length) { data[p] ^= (w >>> 16) & 255; p++; }
    if (p < data.length) { data[p] ^= (w >>> 24) & 255; p++; }
  }
  if (!(data[0] === 109 && data[1] === 118 && data[2] === 109 && data[3] === 49)) throw new Error("mvm1: prefijo");
  return new TextDecoder().decode(data.subarray(4));
}
