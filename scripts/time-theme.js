'use strict';

// Replace only the theme's mode controller; keep its dark styles and callback API.
hexo.extend.filter.register('before_generate', () => {
  hexo.theme.setView('_plugins/darkmode/script.ejs',
    '<script>window.pixelTheme?.connect();</script>');
}, 5);
