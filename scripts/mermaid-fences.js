'use strict';

// Keep Mermaid opt-in. A regular article never loads the diagram runtime.
hexo.extend.filter.register('before_post_render', data => {
  if (!Array.isArray(data.plugins) || !data.plugins.includes('mermaid')) return data;
  if (data.source && !/\.(md|markdown)$/i.test(data.source)) return data;
  const escapeHTML = hexo.extend.helper.get('escape_html');
  const lines = data.content.split('\n');
  const output = [];
  for (let index = 0; index < lines.length; index++) {
    const opener = lines[index].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opener) {
      output.push(lines[index]);
      continue;
    }
    const closingFence = new RegExp(`^ {0,3}${opener[1][0]}{${opener[1].length},}\\s*$`);
    let end = index + 1;
    while (end < lines.length && !closingFence.test(lines[end])) end++;
    if (opener[2].trim().toLowerCase() === 'mermaid' && end < lines.length) {
      const diagram = lines.slice(index + 1, end).join('\n');
      // Encode braces too, so diagram labels never become Hexo/Nunjucks tags.
      output.push(`<pre class="mermaid">${escapeHTML(diagram).replace(/{/g, '&#123;').replace(/}/g, '&#125;')}</pre>`);
    } else {
      output.push(...lines.slice(index, Math.min(end + 1, lines.length)));
    }
    index = end;
  }
  data.content = output.join('\n');
  return data;
}, 5);
