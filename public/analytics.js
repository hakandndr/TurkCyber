/**
 * TurkCyber private analytics beacon.
 *
 * Sends one pixel request per page per browser session. sessionStorage
 * deduplicates reloads so repeatedly refreshing an article does not inflate the
 * page-view count. Everything is wrapped: analytics must never throw on a
 * visitor's page, and a failure here must never affect rendering.
 */
(function () {
  try {
    var p = location.hostname + location.pathname + location.search;
    var k = 'analytics:' + p;
    try {
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch (e) {
      /* private mode or storage disabled — still send, just without dedupe */
    }
    new Image().src =
      '/collect?path=' +
      encodeURIComponent(p) +
      '&referrer=' +
      encodeURIComponent(document.referrer || '') +
      '&t=' +
      Date.now();
  } catch (e) {
    /* never surface */
  }
})();
