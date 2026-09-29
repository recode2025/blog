'use strict';

const { readFile } = require('node:fs/promises');
const { join } = require('node:path');

// Keep the theme submodule intact, sharing its shell, sidebar and archive cards.
hexo.extend.filter.register('before_generate', async () => {
  const [page, category] = await Promise.all([
    readFile(join(hexo.base_dir, 'layouts/taxonomy.ejs'), 'utf8'),
    readFile(join(hexo.base_dir, 'layouts/taxonomy-category.ejs'), 'utf8')
  ]);
  hexo.theme.setView('category.ejs', page);
  hexo.theme.setView('tag.ejs', page);
  hexo.theme.setView('taxonomy-category.ejs', category);
});

hexo.extend.helper.register('taxonomy_index', function (kind) {
  const terms = this.site[kind].toArray().filter(term => term.posts.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
  const nodes = new Map(terms.map(term => [term._id, { term, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = kind === 'categories' && nodes.get(node.term.parent);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return { terms, roots };
});
