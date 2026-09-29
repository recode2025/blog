'use strict';

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const safeURL = (value, local = false) => {
  if (typeof value !== 'string') return '';
  if (local && /^\/(?!\/)/.test(value) && !/[\\\s]/.test(value)) {
    return `${hexo.config.root || '/'}${value.slice(1)}`;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};
const number = value => (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? value : null;
const formatNumber = value => {
  const valid = number(value);
  return valid === null ? '—' : new Intl.NumberFormat('zh-CN').format(valid);
};
const dateLabel = value => {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
};
const timeHTML = value => dateLabel(value) ? `<time datetime="${escapeHTML(value)}">${dateLabel(value)}</time>` : '';
const stat = (label, value) => number(value) === null ? '' : `<div><strong>${formatNumber(value)}</strong><span>${escapeHTML(label)}</span></div>`;
const getData = () => {
  const data = hexo.locals.get('data');
  return { settings: data.about || {}, live: data['about-live'] || {} };
};

// Refresh rendered tags when a data file changes, including in Hexo watch mode.
hexo.extend.filter.register('before_generate', () => {
  const page = hexo.model('Page').findOne({ source: 'about/index.md' }) || hexo.model('Page').findOne({ source: 'about/index.html' });
  if (!page) return;
  page.content = undefined;
  return page.save();
}, 5);

hexo.extend.tag.register('about_games', () => {
  const { settings, live } = getData();
  return (Array.isArray(settings.games) ? settings.games : []).map(game => {
    const cached = live.games?.[game.id];
    // A different UID must never inherit the previous player's cached numbers.
    const record = cached && game.provider !== 'manual' && String(cached.uid || '') === String(game.uid || '') && cached.provider === game.provider && cached.server === (game.server || '') && (cached.snapshot || '') === (game.snapshot || '') ? cached : null;
    const values = { ...(game.stats || {}), ...(record?.data || {}) };
    for (const field of record?.hiddenFields || []) delete values[field];
    const image = safeURL(game.image, true);
    const url = safeURL(game.url);
    const hasData = ['level', 'characters', 'achievements', 'showcaseCharacters'].some(key => number(values[key]) !== null);
    const characters = number(values.characters) !== null ? values.characters : values.showcaseCharacters;
    const characterLabel = number(values.characters) !== null || number(values.showcaseCharacters) === null ? '角色' : '展柜角色';
    const updatedAt = record?.updatedAt || game.updated_at;
    const note = hasData
      ? `${updatedAt ? `更新于 ${dateLabel(updatedAt)}` : '个人档案'}${record?.status === 'stale' ? ' · 稍后更新' : ''}`
      : '个人档案待补充';
    return `<article class="about-game" data-game="${escapeHTML(game.id)}">
      ${url ? `<a class="about-game-visual" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHTML(game.title)}官网">` : '<div class="about-game-visual">'}
        ${image ? `<img class="about-game-image no-lazy" src="${escapeHTML(image)}" alt="${escapeHTML(game.title)}" width="720" height="450" loading="lazy" decoding="async">` : ''}
        <span class="about-game-server">${escapeHTML(game.server || '')}</span>
      ${url ? '</a>' : '</div>'}
      <div class="about-game-body">
        <h3 class="about-game-title">${escapeHTML(game.title)}</h3>
        <p class="about-game-en">${escapeHTML(game.english)}</p>
        ${hasData ? `<div class="about-game-stats">${stat('等级', values.level)}${stat(characterLabel, characters)}${stat('成就', values.achievements)}</div>` : ''}
        <p class="about-game-note">${escapeHTML(note)}${game.uid ? `<span>UID ${escapeHTML(game.uid)}</span>` : ''}</p>
      </div>
    </article>`;
  }).join('\n');
});

hexo.extend.tag.register('about_github', () => {
  const { settings, live } = getData();
  const config = settings.github || {};
  const username = String(config.username || '');
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) return '';
  const account = String(live.github?.username || '').toLowerCase() === username.toLowerCase() ? live.github : {};
  const profileRecord = account.profile;
  const repositoryRecord = account.repositories;
  const profile = profileRecord?.data || {};
  const home = `https://github.com/${username}`;
  const avatar = safeURL(profile.avatar);
  const limit = Math.max(1, Math.min(6, Number(config.repository_limit) || 3));
  const repositories = Array.isArray(repositoryRecord?.data) ? repositoryRecord.data : [];
  const cards = repositories.slice(0, limit).map(repository => {
    const fullName = String(repository.fullName || '');
    const [owner, name, extra] = fullName.split('/');
    if (extra || owner.toLowerCase() !== username.toLowerCase() || !/^[\w.-]{1,100}$/.test(name || '')) return '';
    const url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const updated = dateLabel(repository.pushedAt);
    return `<a class="about-github-repo" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
      <div class="about-github-repo-heading"><i class="fa-solid fa-book-bookmark" aria-hidden="true"></i><h3>${escapeHTML(name)}</h3><span aria-hidden="true">↗</span></div>
      ${repository.description ? `<p class="about-github-repo-description">${escapeHTML(repository.description)}</p>` : ''}
      <div class="about-github-repo-meta">
        ${repository.language ? `<span class="about-github-language"><span aria-hidden="true"></span>${escapeHTML(repository.language)}</span>` : ''}
        ${number(repository.stars) !== null ? `<span aria-label="${formatNumber(repository.stars)} 个 Star"><i class="fa-regular fa-star" aria-hidden="true"></i>${formatNumber(repository.stars)}</span>` : ''}
        ${number(repository.forks) !== null ? `<span aria-label="${formatNumber(repository.forks)} 个 Fork"><i class="fa-solid fa-code-fork" aria-hidden="true"></i>${formatNumber(repository.forks)}</span>` : ''}
      </div>
      ${updated ? `<p class="about-github-repo-date">推送于 ${timeHTML(repository.pushedAt)}</p>` : ''}
    </a>`;
  }).filter(Boolean).join('\n');
  const statsHTML = [
    ['公开仓库', profile.publicRepos, 'repositories'],
    ['关注者', profile.followers, 'followers'],
    ['正在关注', profile.following, 'following']
  ].filter(([, value]) => number(value) !== null).map(([label, value, tab]) =>
    `<a href="${home}?tab=${tab}" target="_blank" rel="noopener noreferrer">${stat(label, value)}</a>`
  ).join('');
  const notes = [];
  if (dateLabel(profileRecord?.updatedAt)) notes.push(`资料更新于 ${timeHTML(profileRecord.updatedAt)}`);
  if (dateLabel(repositoryRecord?.updatedAt)) notes.push(`仓库更新于 ${timeHTML(repositoryRecord.updatedAt)}`);
  const stale = [profileRecord, repositoryRecord].some(record => record?.status === 'stale');
  const empty = repositoryRecord?.status === 'ok' && !repositories.length
    ? '更多项目可以在 GitHub 主页查看。'
    : '仓库列表暂时未同步，可以先去 GitHub 看看。';
  return `<div class="about-github-card">
    <div class="about-github-overview">
      <div class="about-github-profile">
        ${avatar ? `<img class="about-github-avatar no-lazy" src="${escapeHTML(avatar)}" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="about-github-avatar about-github-avatar-fallback"><i class="fa-brands fa-github" aria-hidden="true"></i></span>'}
        <div class="about-github-identity"><h3>${escapeHTML(profile.name || username)}</h3><a class="about-github-handle" href="${home}" target="_blank" rel="noopener noreferrer">@${escapeHTML(profile.login || username)}</a>${profile.bio ? `<p class="about-github-bio">${escapeHTML(profile.bio)}</p>` : ''}</div>
      </div>
      <a class="about-github-home" href="${home}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-github" aria-hidden="true"></i> GitHub 主页 <span aria-hidden="true">↗</span></a>
    </div>
    ${statsHTML ? `<div class="about-github-stats">${statsHTML}</div>` : ''}
    ${cards ? `<div class="about-github-repositories"><p class="about-github-list-label">最近更新的仓库</p><div class="about-github-repo-grid">${cards}</div></div>` : `<div class="about-empty"><p>${empty}</p></div>`}
    ${notes.length ? `<p class="about-data-note">${notes.join(' · ')}${stale ? ' · 部分数据稍后更新' : ''}</p>` : ''}
  </div>`;
});

hexo.extend.tag.register('about_bilibili', () => {
  const { settings, live } = getData();
  const config = settings.bilibili || {};
  const uid = /^\d+$/.test(String(config.uid || '')) ? String(config.uid) : '';
  if (!uid) return '<div class="about-bilibili-content"><p class="about-empty">B 站主页即将见面。</p></div>';
  const account = String(live.bilibili?.uid || '') === uid ? live.bilibili : {};
  const profile = account.profile?.data || {};
  const stats = account.stats?.data || {};
  const videoRecord = account.videos;
  const fallback = Array.isArray(config.videos) ? config.videos : [];
  const videos = Array.isArray(videoRecord?.data) ? videoRecord.data : fallback;
  const home = `https://space.bilibili.com/${uid}`;
  const avatar = safeURL(profile.avatar);
  const datedNotes = [];
  if (dateLabel(account.stats?.updatedAt)) datedNotes.push(`统计更新于 ${timeHTML(account.stats.updatedAt)}`);
  else if (dateLabel(account.profile?.updatedAt)) datedNotes.push(`资料更新于 ${timeHTML(account.profile.updatedAt)}`);
  if (dateLabel(videoRecord?.updatedAt)) datedNotes.push(`投稿更新于 ${timeHTML(videoRecord.updatedAt)}`);
  const stale = [account.profile, account.stats, videoRecord].some(record => record?.status === 'stale');
  const maximum = Math.max(1, Math.min(12, Number(config.video_limit) || 6));
  const cards = videos.slice(0, maximum).map(video => {
    const bvid = /^BV[a-zA-Z0-9]+$/.test(String(video.bvid || '')) ? String(video.bvid) : '';
    const url = bvid ? `https://www.bilibili.com/video/${bvid}/` : safeURL(video.url);
    if (!url) return '';
    const cover = safeURL(video.cover);
    const published = dateLabel(video.publishedAt);
    return `<a class="about-video" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">
      <div class="about-video-cover">${cover ? `<img class="no-lazy" src="${escapeHTML(cover)}" alt="" width="640" height="400" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '<span class="about-video-placeholder" aria-hidden="true">▶</span>'}${video.duration ? `<span class="about-video-duration">${escapeHTML(video.duration)}</span>` : ''}</div>
      <h3>${escapeHTML(video.title || '查看视频')}</h3>
      <div class="about-video-meta">${number(video.views) !== null ? `<span>${formatNumber(video.views)} 播放</span>` : ''}${published ? `<time datetime="${escapeHTML(video.publishedAt)}">${published}</time>` : ''}</div>
    </a>`;
  }).filter(Boolean).join('\n');
  const empty = videoRecord?.status === 'ok' && Array.isArray(videoRecord.data) && !videoRecord.data.length
    ? '这里还没有公开投稿。'
    : '视频列表暂时未同步，去 B 站看看最新投稿。';
  const statsHTML = `${stat('粉丝', stats.followers)}${stat('关注', stats.following)}${stat('获赞', profile.likes)}${stat('投稿', videoRecord?.total ?? profile.videoCount)}`;
  return `<div class="about-bilibili-content">
    <div class="about-bili-profile">
      ${avatar ? `<img class="about-bili-avatar no-lazy" src="${escapeHTML(avatar)}" alt="" width="56" height="56" loading="lazy" referrerpolicy="no-referrer">` : '<span class="about-bili-mark" aria-hidden="true">bilibili</span>'}
      <div><h3 class="about-bili-name">${escapeHTML(profile.name || '我的 B 站')}</h3><p class="about-bili-sign">${escapeHTML(profile.description || `UID ${uid}`)}</p></div>
      <a class="about-bili-home" href="${home}" target="_blank" rel="noopener noreferrer">去主页看看 <span aria-hidden="true">↗</span></a>
    </div>
    ${statsHTML ? `<div class="about-bili-stats">${statsHTML}</div>` : ''}
    ${cards ? `<div class="about-videos">${cards}</div>` : `<div class="about-empty"><p>${empty}</p><a href="${home}/upload/video" target="_blank" rel="noopener noreferrer">查看投稿 <span aria-hidden="true">↗</span></a></div>`}
    ${datedNotes.length ? `<p class="about-data-note">${datedNotes.join(' · ')}${stale ? ' · 部分数据稍后更新' : ''}</p>` : '<p class="about-data-note">账号数据暂未同步</p>'}
  </div>`;
});
