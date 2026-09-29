'use strict';

// Approximate reading counts, computed at build time with no analytics request.
function countWords(content) {
  const text = hexo.extend.helper.get('site_plain_text')(content);
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
  const characters = (text.match(cjk) || []).length;
  const words = (text.replace(cjk, ' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  return { characters, words };
}

hexo.extend.helper.register('wordcount', content => {
  const { characters, words } = countWords(content);
  return (characters + words).toLocaleString('en-US');
});
hexo.extend.helper.register('min2read', content => {
  const { characters, words } = countWords(content);
  return Math.max(1, Math.ceil(characters / 300 + words / 200));
});
hexo.extend.helper.register('totalcount', site => {
  let count = 0;
  site.posts.forEach(post => {
    const { characters, words } = countWords(post.content);
    count += characters + words;
  });
  return count.toLocaleString('en-US');
});
