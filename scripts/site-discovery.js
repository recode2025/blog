'use strict';

// Static discovery files use Hexo's published models, without browser services.
const xml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
})[character]);
const list = value => value && typeof value.toArray === 'function' ? value.toArray() : Array.from(value || []);
const iso = value => {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '1970-01-01T00:00:00.000Z' : date.toISOString();
};
const decodeEntities = text => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  if (code[0] !== '#') return named[code.toLowerCase()] || entity;
  const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
  return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
    ? String.fromCodePoint(point) : entity;
});
const plainText = html => decodeEntities(hexo.extend.helper.get('strip_html')(String(html || '')
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<\/(?:p|div|li|h[1-6]|pre|td)>|<br\s*\/?>/gi, ' ')))
  .replace(/\s+/g, ' ').trim();
const isPublic = item => item.published !== false && item.hidden !== true && !item.password &&
  !/\bnoindex\b/i.test(String(item.robots || '')) &&
  (hexo.config.future !== false || new Date(item.date || 0) <= new Date());
const feedContent = html => String(html || '').replace(/<img\b[^>]*>/gi, tag => {
  if (!/\sdata-srcset=/.test(tag)) return tag;
  // Feed readers do not execute the theme's lazy loader. Restore real sources.
  return tag.replace(/\ssrcset=(["'])[\s\S]*?\1/gi, '')
    .replace(/\sdata-srcset=/i, ' srcset=');
});

hexo.extend.helper.register('site_plain_text', plainText);
hexo.extend.filter.register('after_render:html', html => {
  if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(html)) return html;
  // Volantis removes .html from canonical URLs. A noindex page (especially 404)
  // should not advertise that alternate, nonexistent URL as a canonical page.
  return html.replace(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi, '');
});

hexo.extend.generator.register('site-discovery', function (locals) {
  const siteUrl = new URL(hexo.config.url.replace(/\/?$/, '/'));
  const absolute = path => new URL(path || '', siteUrl).href;
  const permalink = item => item.permalink || absolute(item.path);
  const taxonomy = values => list(values).map(item => ({
    name: item.name,
    permalink: permalink(item),
    path: new URL(permalink(item)).pathname
  }));
  const posts = list(locals.posts).filter(isPublic).sort((a, b) => new Date(b.date) - new Date(a.date));
  const pages = list(locals.pages).filter(isPublic);
  const searchRecord = item => ({
    title: item.title || '',
    permalink: permalink(item),
    path: new URL(permalink(item)).pathname,
    date: iso(item.date),
    updated: iso(item.updated || item.date),
    description: plainText(item.description || item.excerpt).slice(0, 300),
    text: plainText(item.content),
    tags: taxonomy(item.tags),
    categories: taxonomy(item.categories)
  });
  const searchPosts = posts.filter(item => item.search !== false);
  const searchPages = pages.filter(item => item.search !== false && item.title);
  // Derive taxonomies from searchable posts so excluded posts do not leak tags.
  const searchTaxonomy = key => Array.from(new Map(searchPosts.flatMap(item => taxonomy(item[key]))
    .map(item => [item.permalink, item])).values());
  const index = {
    meta: { title: hexo.config.title, url: siteUrl.href },
    posts: searchPosts.map(searchRecord),
    pages: searchPages.map(searchRecord),
    tags: searchTaxonomy('tags'),
    categories: searchTaxonomy('categories')
  };

  const feedPosts = posts.filter(item => item.feed !== false).slice(0, 30);
  const latestUpdate = feedPosts.reduce((latest, item) => {
    const updated = iso(item.updated || item.date);
    return updated > latest ? updated : latest;
  }, '1970-01-01T00:00:00.000Z');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${xml(hexo.config.language || 'zh-CN')}">
  <title>${xml(hexo.config.title)}</title>
  <subtitle>${xml(hexo.config.subtitle || '')}</subtitle>
  <id>${xml(siteUrl.href)}</id>
  <link href="${xml(siteUrl.href)}"/>
  <link href="${xml(absolute('atom.xml'))}" rel="self" type="application/atom+xml"/>
  <updated>${latestUpdate}</updated>
  <author><name>${xml(hexo.config.author)}</name></author>
${feedPosts.map(item => `  <entry>
    <title>${xml(item.title)}</title>
    <id>${xml(permalink(item))}</id>
    <link href="${xml(permalink(item))}"/>
    <published>${iso(item.date)}</published>
    <updated>${iso(item.updated || item.date)}</updated>
    <summary>${xml(plainText(item.description || item.excerpt || item.content).slice(0, 500))}</summary>
    <content type="html" xml:base="${xml(permalink(item))}">${xml(feedContent(item.content))}</content>
${taxonomy(item.categories).map(category => `    <category term="${xml(category.name)}"/>`).join('\n')}
  </entry>`).join('\n')}
</feed>\n`;

  const urls = new Map([[siteUrl.href, null]]);
  for (const item of [...posts, ...pages]) {
    if (item.sitemap !== false) urls.set(permalink(item), iso(item.updated || item.date));
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urls, ([url, updated]) => `  <url><loc>${xml(url)}</loc>${updated ? `<lastmod>${updated}</lastmod>` : ''}</url>`).join('\n')}
</urlset>\n`;

  return [
    { path: hexo.config.jsonContent?.file || 'search.json', data: JSON.stringify(index) },
    { path: 'atom.xml', data: feed },
    { path: 'sitemap.xml', data: sitemap },
    { path: 'robots.txt', data: `User-agent: *\nAllow: /\n\nSitemap: ${absolute('sitemap.xml')}\n` }
  ];
});

hexo.extend.injector.register('head_end', `<link rel="alternate" type="application/atom+xml" title="${xml(hexo.config.title)}" href="${xml(new URL('atom.xml', hexo.config.url.replace(/\/?$/, '/')).href)}">`);
