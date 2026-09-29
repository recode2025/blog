// Independently implemented from the documented request/response shapes in:
// https://github.com/Loping151/XutheringWavesUID/tree/0e34452e96002277e0b80d94b058bd1ffd7990e2/XutheringWavesUID/utils/api
// Node-only adapter. Callers must source credentials from local environment
// variables; neither credentials nor complete upstream responses are returned.
const origin = 'https://api.kurobbs.com';
const cnServer = '76402e5b20be2c39f095a152090afddc';
const clientVersion = '3.1.3';
const userAgent = `Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) KuroGameBox/${clientVersion}`;
const timeout = 15000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function credential(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${name}`);
  const result = value.trim();
  if (result.length > 8192 || /[^\x20-\x7e]/.test(result)) throw new Error(`Invalid ${name}`);
  return result;
}

function resolveServer(server) {
  if (server === undefined || server === '' || ['官服', '国服', 'cn', cnServer].includes(server)) return cnServer;
  throw new Error('Wuthering Waves adapter supports the China server only');
}

function apiFailure(code) {
  if ([220, 10903].includes(code)) return new Error('Wuthering Waves authorization expired');
  if ([130, 132, 270].includes(code)) return new Error('Wuthering Waves verification requires user action');
  return new Error('Wuthering Waves API request failed');
}

async function post(path, headers, values) {
  let response;
  let envelope;
  try {
    response = await fetch(`${origin}${path}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        'User-Agent': userAgent,
        source: 'ios',
        ...headers
      },
      body: new URLSearchParams(values)
    });
  } catch {
    // Fetch errors can contain request details; never forward the raw error.
    throw new Error('Wuthering Waves request unavailable');
  }
  if (response.status === 429) throw new Error('Wuthering Waves HTTP 429');
  if (!response.ok) throw new Error('Wuthering Waves request unavailable');
  try {
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new Error();
    envelope = JSON.parse(raw);
  } catch {
    // Fetch errors and response bodies can contain request headers or login
    // details. Do not forward them to the build log or public snapshot.
    throw new Error('Wuthering Waves request unavailable');
  }
  if (!object(envelope) || ![0, 200].includes(envelope.code) || envelope.success === false) {
    throw apiFailure(envelope?.code);
  }
  let payload = envelope.data;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); }
    catch { throw new Error('Wuthering Waves response format invalid'); }
  }
  return payload;
}

function parseStatistics(profile, uid) {
  if (!object(profile) || String(profile.id) !== uid) {
    throw new Error('Wuthering Waves profile UID mismatch');
  }
  const data = {};
  for (const [input, output] of [['level', 'level'], ['roleNum', 'characters'], ['achievementCount', 'achievements']]) {
    const raw = profile[input];
    // Hidden/missing values remain unknown. A real numeric zero is retained.
    if (raw === undefined || raw === null) continue;
    const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Wuthering Waves statistics format invalid');
    data[output] = value;
  }
  if (!Object.keys(data).length) throw new Error('Wuthering Waves statistics are not shared');
  return data;
}

export async function fetchWutheringProfile({
  uid,
  token = process.env.WUTHERING_TOKEN,
  deviceId = process.env.WUTHERING_DEVICE_ID,
  server
} = {}) {
  const roleId = String(uid ?? '');
  if (!/^1\d{8}$/.test(roleId)) throw new Error('A nine-digit China-server Wuthering Waves UID is required');
  const serverId = resolveServer(server);
  const loginToken = credential(token, 'WUTHERING_TOKEN');
  const device = credential(deviceId, 'WUTHERING_DEVICE_ID');

  // Prove that the configured role belongs to this authenticated account.
  // A public UID or another account's shared cookie is never sufficient.
  const roles = await post('/gamer/role/list', { token: loginToken, devCode: device }, { gameId: '3' });
  if (!Array.isArray(roles) || !roles.some(role => object(role)
    && String(role.gameId) === '3'
    && String(role.roleId) === roleId
    && role.serverId === serverId)) {
    throw new Error('Wuthering Waves UID is not bound to this account and server');
  }

  const authorization = await post('/aki/roleBox/requestToken', {
    token: loginToken,
    devCode: device,
    did: device,
    'b-at': ''
  }, { serverId, roleId });
  const accessToken = credential(authorization?.accessToken, 'Wuthering Waves access token');
  const profile = await post('/aki/roleBox/akiBox/baseData', {
    devCode: device,
    did: device,
    'b-at': accessToken
  }, { gameId: '3', serverId, roleId });

  return {
    data: parseStatistics(profile, roleId),
    source: 'kuro-bbs',
    updatedAt: new Date().toISOString()
  };
}
