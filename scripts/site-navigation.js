'use strict';

// Only the initial full-screen home cover waits to reveal navigation.
// Clone per-page config so rendering one route cannot change another route.
hexo.extend.filter.register('template_locals', locals => {
  const { page, theme } = locals;
  const hasFullHomeCover = page.__index && page.prev === 0 &&
    theme.cover?.height_scheme === 'full' &&
    (page.cover ?? theme.cover?.display?.home);
  locals.theme = {
    ...theme,
    navbar: { ...theme.navbar, visiable: hasFullHomeCover ? 'auto' : 'always' }
  };
  return locals;
});
