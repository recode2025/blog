#!/usr/bin/env node
// Public, build-time snapshots only. This script never reads browser cookies.
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const userAgent = 'PixelAndPointerAbout/1.0 (+https://www.recode88.cn/about/)';
const timeout = 15000;
const mixinOrder = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];

const count = value => {
  if (typeof value === 'string' && /^\d+$/.test(value)) value = Number(value);
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
};
const uidString = value => /^\d+$/.test(String(value || '')) ? String(value) : '';
const text = value => typeof value === 'string' ? value : '';
const httpsURL = value => {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value.replace(/^\/\//, 'https://').replace(/^http:\/\//, 'https://'));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};
const date = value => {
  if (typeof value === 'number') value = new Date(value * 1000).toISOString();
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
};

async function fetchJSON(url, { bilibili = false } = {}) {
  const response = await fetch(url, {
    headers: { 'User-Agent': userAgent, ...(bilibili ? { Referer: 'https://space.bilibili.com/' } : {}) },
    signal: AbortSignal.timeout(timeout),
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.text();
  if (raw.length > 5_000_000) throw new Error('Response exceeds 5 MB');
  try { return JSON.parse(raw); } catch { throw new Error('Response is not JSON'); }
}
async function biliAPI(path, params) {
  const result = await fetchJSON(`https://api.bilibili.com${path}?${new URLSearchParams(params)}`, { bilibili: true });
  if (result.code !== 0) throw new Error(`Bilibili API ${result.code ?? 'invalid response'}`);
  if (!result.data || typeof result.data !== 'object') throw new Error('Missing Bilibili data');
  return result.data;
}

export function signWBI(params, keys, timestamp = Math.floor(Date.now() / 1000)) {
  const combined = keys.img + keys.sub;
  if (combined.length !== 64) throw new Error('Invalid WBI keys');
  const mixin = mixinOrder.map(index => combined[index]).join('').slice(0, 32);
  const values = { ...params, wts: timestamp };
  const query = Object.keys(values).sort().map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(values[key]).replace(/[!'()*]/g, ''))}`).join('&');
  return `${query}&w_rid=${createHash('md5').update(query + mixin).digest('hex')}`;
}

async function fetchWBIKeys() {
  // The public nav endpoint includes signing keys even for logged-out visitors.
  const result = await fetchJSON('https://api.bilibili.com/x/web-interface/nav', { bilibili: true });
  const keys = result.data?.wbi_img;
  const name = value => httpsURL(value) ? new URL(value).pathname.split('/').pop().split('.')[0] : '';
  const img = name(keys?.img_url);
  const sub = name(keys?.sub_url);
  if (!/^[a-f0-9]{32}$/.test(img) || !/^[a-f0-9]{32}$/.test(sub)) throw new Error('WBI keys unavailable');
  return { img, sub };
}
async function wbiAPI(path, params, keys) {
  const result = await fetchJSON(`https://api.bilibili.com${path}?${signWBI(params, keys)}`, { bilibili: true });
  if (result.code !== 0) throw new Error(`Bilibili API ${result.code ?? 'invalid response'}`);
  if (!result.data || typeof result.data !== 'object') throw new Error('Missing Bilibili data');
  return result.data;
}

export function parseBiliStats(data) {
  const followers = count(data.follower);
  const following = count(data.following);
  if (followers === null || following === null) throw new Error('Incomplete Bilibili statistics');
  return { followers, following };
}
export function parseBiliProfile(data) {
  const name = text(data.name);
  if (!name) throw new Error('Incomplete Bilibili profile');
  return { name, avatar: httpsURL(data.face), description: text(data.sign), level: count(data.level) };
}
export function parseBiliVideos(data) {
  if (!Array.isArray(data.list?.vlist)) throw new Error('Missing Bilibili video list');
  const videos = data.list.vlist.map(video => {
    if (!/^BV[a-zA-Z0-9]+$/.test(text(video.bvid)) || !text(video.title)) throw new Error('Invalid Bilibili video');
    return {
      bvid: video.bvid,
      title: video.title,
      cover: httpsURL(video.pic),
      views: count(video.play),
      duration: text(video.length),
      publishedAt: date(video.created)
    };
  });
  // An empty object or missing count is unknown, never zero.
  const total = count(data.page?.count);
  if (total === null) throw new Error('Missing Bilibili submission count');
  return { data: videos, total };
}

export function parseEnka(id, response) {
  let data;
  const hiddenFields = [];
  if (id === 'starrail') {
    const profile = response.detailInfo;
    if (count(profile?.level) === null) throw new Error('Missing Star Rail profile');
    const privacy = profile.privacySettingInfo || {};
    const record = privacy.displayRecord === false ? {} : profile.recordInfo || {};
    if (privacy.displayRecord === false) hiddenFields.push('characters', 'achievements');
    if (privacy.displayCollection === false) hiddenFields.push('characters');
    data = {
      level: count(profile.level),
      characters: privacy.displayCollection === false ? null : count(record.avatarCount),
      achievements: count(record.achievementCount)
    };
  } else if (id === 'zzz') {
    const detail = response.PlayerInfo?.SocialDetail;
    if (count(detail?.ProfileDetail?.Level) === null) throw new Error('Missing Zenless Zone Zero profile');
    data = {
      level: count(detail.ProfileDetail.Level),
      showcaseCharacters: Array.isArray(response.PlayerInfo?.ShowcaseDetail?.AvatarList) ? response.PlayerInfo.ShowcaseDetail.AvatarList.length : null
    };
  } else if (id === 'endfield') {
    const card = response.playerInfo?.businessCard;
    if (count(card?.adventureLevel) === null) throw new Error('Missing Endfield profile');
    data = {
      level: count(card.adventureLevel),
      showcaseCharacters: Array.isArray(response.playerInfo.charData) ? response.playerInfo.charData.length : null
    };
  } else throw new Error('This game has no supported Enka adapter');
  const ttl = Math.max(60, count(response.ttl) || 60);
  data = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null));
  return { data, hiddenFields, nextRefreshAt: new Date(Date.now() + ttl * 1000).toISOString(), source: 'Enka.Network' };
}

export function parseGameSnapshot(snapshot, uid) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('Invalid game snapshot');
  if (snapshot.uid !== undefined && String(snapshot.uid) !== uid) throw new Error('Snapshot UID does not match configuration');
  const data = {};
  for (const key of ['level', 'characters', 'achievements', 'showcaseCharacters']) {
    if (snapshot[key] !== undefined && snapshot[key] !== null) {
      const value = count(snapshot[key]);
      if (value === null) throw new Error(`Invalid snapshot field: ${key}`);
      data[key] = value;
    }
  }
  if (!Object.keys(data).length) throw new Error('Snapshot has no supported statistics');
  const updatedAt = date(snapshot.updatedAt);
  if (!updatedAt) throw new Error('Snapshot requires a valid updatedAt timestamp');
  return { data, updatedAt, source: 'snapshot' };
}

export async function refreshSection(previous, fetcher, now = new Date().toISOString()) {
  try {
    const next = await fetcher();
    return { ...next, status: 'ok', updatedAt: next.updatedAt || now, checkedAt: now };
  } catch (error) {
    const hasPrevious = previous && Object.hasOwn(previous, 'data');
    const message = error?.name === 'TimeoutError' ? 'Request timed out' : String(error?.message || 'Request failed');
    const retryAt = date(error?.nextRefreshAt);
    return {
      ...(hasPrevious ? previous : {}),
      status: hasPrevious ? 'stale' : 'unavailable',
      checkedAt: now,
      error: message,
      ...(retryAt ? { nextRefreshAt: retryAt } : message.includes('429') ? { nextRefreshAt: new Date(Date.parse(now) + 3600_000).toISOString() } : {})
    };
  }
}

async function refreshBilibili(config, previous) {
  const uid = uidString(config.uid);
  if (!uid) return undefined;
  const old = previous?.uid === uid ? previous : {};
  const limit = Math.max(1, Math.min(12, count(config.video_limit) || 6));
  // Request signing keys once. No login or cookie is used for these public calls.
  let keys;
  const getKeys = () => (keys ||= fetchWBIKeys());
  const refresh = (previous, fetcher) => previous?.nextRefreshAt && Date.parse(previous.nextRefreshAt) > Date.now()
    ? Promise.resolve(previous) : refreshSection(previous, fetcher);
  const [stats, profile, videos] = await Promise.all([
    refresh(old.stats, async () => ({ data: parseBiliStats(await biliAPI('/x/relation/stat', { vmid: uid })) })),
    refresh(old.profile, async () => {
      try {
        return { data: parseBiliProfile(await wbiAPI('/x/space/wbi/acc/info', { mid: uid }, await getKeys())), source: 'bilibili-space' };
      } catch {
        // The public live profile carries account name/avatar, not Bilibili level.
        const result = await fetchJSON(`https://api.live.bilibili.com/live_user/v1/Master/info?uid=${uid}`, { bilibili: true });
        const info = result.data?.info;
        if (result.code !== 0 || String(info?.uid) !== uid || !text(info?.uname)) throw new Error('Bilibili public profile unavailable');
        return { data: { name: info.uname, avatar: httpsURL(info.face) }, source: 'bilibili-live-public-profile' };
      }
    }),
    refresh(old.videos, async () => parseBiliVideos(await wbiAPI('/x/space/wbi/arc/search', { mid: uid, ps: limit, pn: 1, order: 'pubdate' }, await getKeys())))
  ]);
  return { uid, stats, profile, videos };
}

async function refreshGames(configs, previous) {
  const games = {};
  for (const game of configs) {
    const uid = uidString(game.uid);
    const cached = previous?.[game.id];
    const old = cached?.uid === uid && cached?.provider === game.provider && cached?.server === (game.server || '') && (cached?.snapshot || '') === (game.snapshot || '') ? cached : undefined;
    if (game.provider === 'manual' || !game.provider) continue;
    if (old?.nextRefreshAt && Date.parse(old.nextRefreshAt) > Date.now()) {
      games[game.id] = old;
      continue;
    }
    const record = await refreshSection(old, async () => {
      if (game.provider === 'enka') {
        if (!uid) throw new Error('Game UID is required');
        const prefix = { starrail: 'hsr', zzz: 'zzz', endfield: 'ef' }[game.id];
        if (!prefix) throw new Error('This game has no supported Enka adapter');
        const response = await fetchJSON(`https://enka.network/api/${prefix}/uid/${uid}`);
        if (response.uid !== undefined && String(response.uid) !== uid) throw new Error('Enka returned a different UID');
        return parseEnka(game.id, response);
      }
      if (game.provider === 'snapshot') {
        if (typeof game.snapshot !== 'string' || !game.snapshot) throw new Error('Snapshot path is required');
        const snapshot = /^https:\/\//.test(game.snapshot)
          ? await fetchJSON(httpsURL(game.snapshot))
          : JSON.parse(await readFile(resolve(root, game.snapshot), 'utf8'));
        return parseGameSnapshot(snapshot, uid);
      }
      if (game.provider === 'wuthering') {
        if (!uid) throw new Error('Wuthering Waves UID is required');
        const { fetchWutheringProfile } = await import('./lib/wuthering.mjs');
        return fetchWutheringProfile({
          uid,
          token: process.env.WUTHERING_TOKEN,
          deviceId: process.env.WUTHERING_DEVICE_ID,
          server: game.server || '官服'
        });
      }
      throw new Error(`Unknown game provider: ${game.provider}`);
    });
    games[game.id] = { ...record, uid, provider: game.provider, server: game.server || '', ...(game.snapshot ? { snapshot: game.snapshot } : {}) };
  }
  return games;
}

export async function refreshGitHub(config, previous) {
  if (!config.username) return undefined;
  const { gitHubUsername, fetchGitHubProfile, fetchGitHubRepositories } = await import('./lib/github.mjs');
  const username = gitHubUsername(config.username);
  const old = String(previous?.username || '').toLowerCase() === username.toLowerCase() ? previous : {};
  const isCoolingDown = record => record?.nextRefreshAt && Date.parse(record.nextRefreshAt) > Date.now();
  if (isCoolingDown(old.profile) || isCoolingDown(old.repositories)) return { ...old, username };
  const profile = await refreshSection(old.profile, () => fetchGitHubProfile(username));
  const repositories = isCoolingDown(profile)
    ? await refreshSection(old.repositories, () => {
      const error = new Error('GitHub API rate limit deferred repository refresh');
      error.nextRefreshAt = profile.nextRefreshAt;
      throw error;
    })
    : await refreshSection(old.repositories, () => fetchGitHubRepositories(username, config.repository_limit));
  return { username, profile, repositories };
}

export async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length && (arguments_.length !== 2 || arguments_[0] !== '--only' || !['games', 'bilibili', 'github', 'starrail', 'endfield', 'zzz', 'wuthering'].includes(arguments_[1]))) {
    throw new Error('Usage: node tools/refresh-about.mjs [--only games|bilibili|github|starrail|endfield|zzz|wuthering]');
  }
  const only = arguments_[1];
  const config = yaml.load(await readFile(resolve(root, 'source/_data/about.yml'), 'utf8')) || {};
  const destination = resolve(root, 'source/_data/about-live.json');
  let previous = {};
  try { previous = JSON.parse(await readFile(destination, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Existing cache is invalid; keeping it untouched: ${error.message}`); }
  const singleGame = only && !['games', 'bilibili', 'github'].includes(only);
  const gameConfigs = (Array.isArray(config.games) ? config.games : []).filter(game => !singleGame || game.id === only);
  const [bilibili, refreshedGames, github] = await Promise.all([
    only && only !== 'bilibili' ? previous.bilibili : refreshBilibili(config.bilibili || {}, previous.bilibili),
    ['bilibili', 'github'].includes(only) ? previous.games || {} : refreshGames(gameConfigs, previous.games),
    only && only !== 'github' ? previous.github : refreshGitHub(config.github || {}, previous.github)
  ]);
  const games = singleGame ? { ...previous.games, ...refreshedGames } : refreshedGames;
  const output = { schemaVersion: 1, ...(bilibili ? { bilibili } : {}), games, ...(github ? { github } : {}) };
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`);
  await rename(temporary, destination);
  for (const [key, value] of Object.entries(bilibili || {})) {
    if (key !== 'uid' && (!only || only === 'bilibili')) console.log(`bilibili.${key}: ${value.status}${value.error ? ` (${value.error})` : ''}`);
  }
  if (!['bilibili', 'github'].includes(only)) for (const [key, value] of Object.entries(refreshedGames)) console.log(`games.${key}: ${value.status}${value.error ? ` (${value.error})` : ''}`);
  if (!only || only === 'github') for (const key of ['profile', 'repositories']) {
    const value = github?.[key];
    if (value) console.log(`github.${key}: ${value.status}${value.error ? ` (${value.error})` : ''}`);
  }
  console.log('Saved source/_data/about-live.json. Run npm run build to update the page.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
