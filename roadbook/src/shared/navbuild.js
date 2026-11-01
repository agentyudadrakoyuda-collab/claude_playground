/* Roadbook · monta o HTML único do Navigator a partir do modelo (gerado no build) e da configuração RB. */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /* JSON seguro dentro de <script>: sem "</", sem U+2028/2029 */
  const safeJSON = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  function brandCSS(pal) {
    const v = t => `--laterite:${t.primary};--laterite-ink:${t.onPrimary};--route:${t.route};`;
    return `:root{${v(pal.light)}}\n@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${v(pal.dark)}}}\n:root[data-theme="dark"]{${v(pal.dark)}}`;
  }
  function build(template, cfg) {
    if (!template || template.indexOf('/*@@RB@@*/') < 0) throw new Error('Modelo do Navigator inválido.');
    /* split/join evita padrões especiais de String.replace ($&, $1…) dentro dos dados */
    return template.split('@@TITLE@@').join(esc(cfg.title))
      .split('/*@@BRAND_CSS@@*/').join(brandCSS(cfg.pal))
      .split('/*@@RB@@*/').join('window.RB=' + safeJSON(cfg) + ';');
  }
  const api = { build, brandCSS, safeJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RBNav = api;
})(typeof window !== 'undefined' ? window : globalThis);
