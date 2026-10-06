// Serialized without imports so each source serves this component from itself.
export function installOutbound() {
  'use strict';
  if (document.__dndrOutboundInstalled) return;
  document.__dndrOutboundInstalled = true;
  var script = document.currentScript;
  var aliases = ((script && script.dataset.sameSite) || location.hostname).split(',');
  var endpoint = (script && script.dataset.endpoint) || '/__analytics/outbound';
  function capture(event) {
    if (
      event.defaultPrevented ||
      (event.type === 'click' && event.button !== 0) ||
      (event.type === 'auxclick' && event.button !== 1)
    )
      return;
    var anchor = event.target && event.target.closest && event.target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;
    var href = anchor.getAttribute('href');
    if (!href || href.trim().startsWith('#')) return;
    try {
      var url = new URL(href, location.href);
      var host = url.hostname.toLowerCase().replace(/\.$/, '');
      if (
        !/^https?:$/.test(url.protocol) ||
        url.username ||
        url.password ||
        aliases.some(function (alias) {
          return alias.toLowerCase().replace(/\.$/, '') === host;
        })
      )
        return;
      if (
        /;(?:[^/]*=)?|\/(?:access[_-]?token|auth(?:orization)?|session(?:[_-]?id)?|reset[_-]?password|password[_-]?reset)(?:\/|=)/i.test(
          decodeURIComponent(url.pathname),
        )
      )
        return;
      url.search = '';
      url.hash = '';
      if (url.href.length > 2048) return;
      var body = JSON.stringify({
        eventId: crypto.randomUUID(),
        path: location.pathname,
        destination: url.href,
      });
      try {
        if (
          navigator.sendBeacon &&
          navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))
        )
          return;
      } catch {
        /* Same identity on fallback. */
      }
      fetch(endpoint, {
        method: 'POST',
        body: body,
        headers: { 'content-type': 'text/plain' },
        keepalive: true,
      }).catch(function () {});
    } catch {
      /* Delivery never affects navigation. */
    }
  }
  document.addEventListener('click', capture);
  document.addEventListener('auxclick', capture);
}

export const OUTBOUND_SCRIPT = `(${installOutbound.toString()})();\n`;
