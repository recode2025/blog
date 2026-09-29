'use strict';

// Build real HTML so every work remains accessible without JavaScript / WebGL.
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const localURL = value => {
  const url = String(value || '');
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return `${hexo.config.root || '/'}${url.slice(1)}`;
  throw new Error(`Gallery URLs must start with / or https://: ${url}`);
};

// Data-file changes do not invalidate Hexo's cached page content. Clear only this
// page before Hexo's render_post filter (priority 10), which renders its original
// _content with the latest data on both normal builds and watch regenerations.
hexo.extend.filter.register('before_generate', () => {
  const page = hexo.model('Page').findOne({ source: 'gallery/index.html' });
  if (!page) return;
  page.content = undefined;
  return page.save();
}, 5);

hexo.extend.tag.register('gallery_url', args => escapeHTML(localURL(args[0])));
hexo.extend.tag.register('portfolio_count', () => String((hexo.locals.get('data').portfolio || []).length).padStart(2, '0'));
hexo.extend.tag.register('portfolio_gallery', () => {
  const works = hexo.locals.get('data').portfolio || [];
  if (!Array.isArray(works)) throw new Error('source/_data/portfolio.yml must contain a list of works.');
  return works.map((work, index) => {
    if (!work.title || !work.image || !['3D', 'Generative', 'Design'].includes(work.category)) {
      throw new Error(`Gallery work ${index + 1} needs a title, image, and a category (3D, Generative, Design).`);
    }
    const image = escapeHTML(localURL(work.image));
    return `<article class="work-card" data-category="${escapeHTML(work.category)}" data-demo="${work.demo === true}">
      <a class="work-image" href="${image}" data-open-work aria-label="查看 ${escapeHTML(work.title)}">
        <img class="no-lazy" src="${image}" alt="${escapeHTML(work.subtitle || work.title)}" width="800" height="1000" loading="lazy" decoding="async">
        <span class="work-open" aria-hidden="true">↗</span>
      </a>
      <div class="work-meta"><span>${String(index + 1).padStart(2, '0')} / ${escapeHTML(work.category)}</span><span>${escapeHTML(work.year)}</span></div>
      <h2>${escapeHTML(work.title)}</h2>
      <p class="work-subtitle">${escapeHTML(work.subtitle)}</p>
      <div class="work-details" hidden><p>${escapeHTML(work.description)}</p>
        <ul>${(work.tools || []).map(tool => `<li>${escapeHTML(tool)}</li>`).join('')}</ul>
        ${work.url ? `<a href="${escapeHTML(localURL(work.url))}" target="_blank" rel="noopener noreferrer">查看项目 ↗</a>` : ''}
      </div>
      ${work.demo === true ? '<span class="work-demo">示例展品</span>' : ''}
    </article>`;
  }).join('\n');
});
