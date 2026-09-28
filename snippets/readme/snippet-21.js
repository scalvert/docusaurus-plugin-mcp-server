createWebRequestHandler({
  docs,
  searchIndexData: searchIndex,
  name: 'my-docs',
  // Defaults: title 3, slug 3, headings 2, description 1.5, content 1
  localSearch: { fieldBoosts: { headings: 3 } },
});
