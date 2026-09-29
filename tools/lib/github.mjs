// Public REST requests only; deliberately does not read GITHUB_TOKEN or gh auth.
const origin = 'https://api.github.com';
const userAgent = 'PixelAndPointerAbout/1.0 (+https://www.recode88.cn/about/)';
const text = value => typeof value === 'string' ? value : '';
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

export function gitHubUsername(value) {
  const username = text(value).trim();
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(username) || username.includes('--')) {
    throw new Error('Invalid GitHub username');
  }
  return username;
}

export function gitHubRetryAt(headers, status, now = Date.now()) {
  const limited = status === 403 || status === 429;
  const exhausted = headers.get('x-ratelimit-remaining') === '0';
  if (!limited && !exhausted) return undefined;
  const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
  const retry = headers.get('retry-after');
  const retryAt = retry && /^\d+(?:\.\d+)?$/.test(retry)
    ? now + Number(retry) * 1000 : Date.parse(retry || '');
  const minimum = now + 60_000;
  const next = Math.max(minimum, exhausted && Number.isFinite(reset) ? reset + 1000 : 0, Number.isFinite(retryAt) ? retryAt : 0);
  return new Date(next).toISOString();
}

async function request(path) {
  let response;
  try {
    response = await fetch(`${origin}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2026-03-10',
        'User-Agent': userAgent
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'error'
    });
  } catch { throw new Error('GitHub request unavailable'); }
  const nextRefreshAt = gitHubRetryAt(response.headers, response.status);
  if (!response.ok) {
    const error = new Error(`GitHub API HTTP ${response.status}`);
    if (nextRefreshAt) error.nextRefreshAt = nextRefreshAt;
    throw error;
  }
  const raw = await response.text();
  if (raw.length > 5_000_000) throw new Error('GitHub response exceeds 5 MB');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('GitHub response is not JSON'); }
  return { data, nextRefreshAt, hasNext: /<[^>]+>;\s*rel="next"/.test(response.headers.get('link') || '') };
}

export function parseGitHubProfile(value, username) {
  const expected = gitHubUsername(username);
  if (!value || text(value.login).toLowerCase() !== expected.toLowerCase()) throw new Error('GitHub profile username mismatch');
  for (const field of ['followers', 'following', 'public_repos']) {
    if (count(value[field]) === null) throw new Error('Incomplete GitHub profile statistics');
  }
  let avatar = '';
  try {
    const url = new URL(value.avatar_url);
    if (url.protocol === 'https:' && ['avatars.githubusercontent.com', 'github.com'].includes(url.hostname) && !url.username && !url.password) avatar = url.href;
  } catch { /* An unavailable image is not a missing profile. */ }
  return {
    login: value.login,
    name: text(value.name),
    avatar,
    bio: text(value.bio),
    followers: value.followers,
    following: value.following,
    publicRepos: value.public_repos,
    url: `https://github.com/${value.login}`
  };
}

export function parseGitHubRepositories(value, username, limit = 3) {
  const expected = gitHubUsername(username).toLowerCase();
  if (!Array.isArray(value)) throw new Error('Missing GitHub repository list');
  const repositories = [];
  const seen = new Set();
  for (const repository of value) {
    if (!repository || typeof repository !== 'object') throw new Error('Invalid GitHub repository');
    if (text(repository.owner?.login).toLowerCase() !== expected || repository.private !== false || repository.fork !== false || repository.archived !== false) continue;
    const name = text(repository.name);
    if (!name || /[/\\\u0000-\u001f]/.test(name)) throw new Error('Invalid GitHub repository name');
    const fullName = `${repository.owner.login}/${name}`;
    if (text(repository.full_name).toLowerCase() !== fullName.toLowerCase()) throw new Error('GitHub repository owner mismatch');
    if (seen.has(fullName.toLowerCase())) continue;
    seen.add(fullName.toLowerCase());
    repositories.push({
      name,
      fullName,
      url: `https://github.com/${repository.owner.login}/${encodeURIComponent(name)}`,
      description: text(repository.description),
      language: text(repository.language),
      stars: count(repository.stargazers_count),
      forks: count(repository.forks_count),
      pushedAt: date(repository.pushed_at)
    });
  }
  const maximum = Math.max(1, Math.min(6, count(limit) || 3));
  return repositories.sort((a, b) => (Date.parse(b.pushedAt) || 0) - (Date.parse(a.pushedAt) || 0) || a.name.localeCompare(b.name)).slice(0, maximum);
}

export async function fetchGitHubProfile(username) {
  const response = await request(`/users/${gitHubUsername(username)}`);
  return { data: parseGitHubProfile(response.data, username), ...(response.nextRefreshAt ? { nextRefreshAt: response.nextRefreshAt } : {}) };
}

export async function fetchGitHubRepositories(username, limit = 3) {
  const owner = gitHubUsername(username);
  const maximum = Math.max(1, Math.min(6, count(limit) || 3));
  const candidates = [];
  // GitHub sorts before filtering forks/archives. Continue pages until we have
  // enough owned original repositories, or have reached the end of the list.
  for (let page = 1; page <= 10; page++) {
    const response = await request(`/users/${owner}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page=${page}`);
    if (!Array.isArray(response.data)) throw new Error('Missing GitHub repository list');
    candidates.push(...response.data);
    const data = parseGitHubRepositories(candidates, owner, maximum);
    if (data.length >= maximum || !response.hasNext) return { data, ...(response.nextRefreshAt ? { nextRefreshAt: response.nextRefreshAt } : {}) };
    if (response.nextRefreshAt) {
      const error = new Error('GitHub API rate limit deferred remaining repository pages');
      error.nextRefreshAt = response.nextRefreshAt;
      throw error;
    }
  }
  // Keep the previous result instead of claiming a partial scan is complete.
  throw new Error('GitHub repository scan exceeded 10 pages');
}
