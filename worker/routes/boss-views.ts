/**
 * /boss HTML rendering.
 *
 * Kept separate from routing so the markup can be asserted in tests without
 * standing up a request pipeline.
 *
 * Every interpolated value passes through escapeHtml. These rows carry
 * attacker-controlled strings — user agents, referrers, paths, comment bodies.
 * A private panel that renders them raw is a stored XSS against the only
 * account that matters.
 */
import { escapeHtml } from '../lib/http';
import { formatPanelTimestamp } from '../lib/time';
import {
  PAGE_SIZE,
  RETENTION_CONFIRM_PHRASE,
  RETENTION_DAYS,
  repeatFlag,
  type BuiltFilters,
  type RetentionStats,
} from '../lib/analytics-query';

const STYLE = `
:root{--bg:#090b0c;--panel:#0c0f10;--raised:#101415;--raised-2:#13191a;
--line:rgba(255,255,255,.08);--line-strong:rgba(255,255,255,.14);--text:#f1f5f4;
--muted:#8e9995;--faint:#64706c;--green:#21e67a;--cyan:#00c8ff;--amber:#ffb54a;
--red:#ff6a5e;--brand-red:#e30a17}
*{box-sizing:border-box}
html{background:var(--bg);color-scheme:dark}
body{margin:0;min-width:0;background:var(--bg);color:var(--text);
font:12px/1.45 ui-monospace,"JetBrains Mono","DejaVu Sans Mono",monospace}
a{color:var(--cyan)}
.console{width:100%;max-width:1920px;margin:0 auto;padding:14px clamp(10px,1.25vw,24px) 48px}
header.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;
justify-content:space-between;gap:18px;min-height:50px;margin-bottom:14px;padding:7px 0 9px;
background:rgba(9,11,12,.96);border-bottom:1px solid var(--line-strong)}
.brand{display:flex;align-items:center;gap:0;min-width:0;color:var(--muted);font-size:18px;font-weight:600;letter-spacing:-.02em}
.brand .b{color:var(--muted)}.brand .t{color:var(--text)}
.brand .c{color:var(--brand-red)}.brand .s{color:var(--muted)}
nav.sub{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
nav.sub a{position:relative;color:var(--muted);text-decoration:none;padding:7px 9px;
border:1px solid transparent;border-radius:3px}
nav.sub a.on{color:var(--text);background:var(--raised);border-color:var(--line-strong)}
nav.sub a.on:after{content:"";position:absolute;inset:auto 9px -1px;height:1px;background:var(--cyan)}
nav.sub a:hover{color:var(--cyan);background:var(--raised)}
.cards{display:grid;grid-template-columns:repeat(6,minmax(112px,1fr));gap:7px;margin-bottom:14px}
.card{position:relative;min-width:0;background:var(--panel);border:1px solid var(--line);
border-radius:3px;padding:9px 11px;overflow:hidden}
.card:before{content:"";position:absolute;inset:0 auto 0 0;width:1px;background:var(--line-strong)}
.card .k{overflow:hidden;color:var(--muted);font-size:9px;letter-spacing:.13em;
text-transform:uppercase;text-overflow:ellipsis;white-space:nowrap}
.card .v{margin-top:2px;font-size:19px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums}
.card .v.green{color:var(--green)}.card .v.amber{color:var(--amber)}
h2{display:flex;align-items:center;gap:8px;margin:16px 0 7px;color:var(--muted);
font-size:9px;line-height:1.2;font-weight:600;letter-spacing:.16em;text-transform:uppercase}
h2:before{content:"";width:12px;height:1px;background:var(--cyan)}
.top{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:6px;margin-bottom:8px}
.top div{display:flex;justify-content:space-between;gap:10px;min-width:0;padding:6px 9px;
background:var(--panel);border:1px solid var(--line);border-radius:2px}
.top div span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top span.n{color:var(--green);font-variant-numeric:tabular-nums}
form.filters{display:grid;grid-template-columns:repeat(5,minmax(92px,1fr)) auto auto auto auto;
gap:6px;align-items:center;margin-bottom:8px;padding:8px;background:var(--panel);
border:1px solid var(--line);border-radius:3px}
input,select,button{min-width:0;font:inherit;background:var(--raised);color:var(--text);
border:1px solid var(--line-strong);border-radius:2px;padding:5px 7px}
input{width:100%}
input:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible{
outline:2px solid var(--cyan);outline-offset:1px}
button{cursor:pointer;color:var(--cyan);border-color:rgba(0,200,255,.32)}
button:hover{background:var(--raised-2);border-color:rgba(0,200,255,.6)}
label.chk{display:flex;align-items:center;gap:5px;color:var(--muted);white-space:nowrap}
label.chk input{width:auto}
.counter{color:var(--muted);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tablewrap{width:100%;max-width:100%;overflow:auto;background:var(--panel);
border:1px solid var(--line-strong);border-radius:3px;scrollbar-color:var(--line-strong) var(--panel)}
table{width:100%;min-width:1220px;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{position:sticky;top:0;z-index:1;padding:6px 7px;background:var(--raised-2);color:var(--muted);
border-bottom:1px solid var(--line-strong);font-size:9px;font-weight:600;letter-spacing:.08em;
text-align:left;white-space:nowrap}
td{padding:5px 7px;border-bottom:1px solid rgba(255,255,255,.045);vertical-align:top;white-space:nowrap}
td.wrap{max-width:320px;white-space:normal;overflow-wrap:anywhere}
tbody tr:nth-child(even) td{background:rgba(255,255,255,.009)}
tr:hover td{background:var(--raised)}
.flag-ok{color:var(--muted)}.flag-repeat{color:var(--amber)}.flag-high{color:var(--red)}
.bot{color:var(--amber)}.human{color:var(--green)}
.pager{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:9px}
.pager a,.pager span{color:var(--muted);text-decoration:none}
.pager a:hover{color:var(--cyan)}
.empty{width:min(100%,520px);margin:0;padding:16px 18px;color:var(--muted);text-align:left;
background:var(--panel);border:1px solid var(--line);border-left:2px solid var(--cyan);border-radius:3px}
.empty strong{display:block;margin-top:3px;color:var(--text);font-size:13px;font-weight:500}
.empty small{display:block;margin-top:3px;color:var(--faint)}
.empty .signal{color:var(--cyan);font-size:9px;letter-spacing:.14em;text-transform:uppercase}
.err{margin-bottom:12px;padding:9px 11px;color:var(--red);background:rgba(255,106,94,.06);
border:1px solid rgba(255,106,94,.4);border-radius:3px}
.login{max-width:340px;margin:12vh auto;padding:0 16px}
.login form{display:flex;flex-direction:column;gap:9px;padding:18px;background:var(--panel);
border:1px solid var(--line-strong);border-radius:4px}
.login input{width:100%}.login button{padding:8px}
.cmt{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 18px;
margin-bottom:7px;padding:10px 12px;background:var(--panel);border:1px solid var(--line);
border-left:2px solid var(--line-strong);border-radius:3px}
.cmt-pending{border-left-color:var(--amber)}.cmt-approved{border-left-color:var(--green)}
.cmt-rejected{border-left-color:var(--muted)}.cmt-spam{border-left-color:var(--red)}
.cmt .meta{grid-column:1/-1;display:flex;gap:7px 12px;flex-wrap:wrap;color:var(--muted);font-size:10px}
.cmt .body{min-width:0;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 system-ui,sans-serif}
.cmt form{display:inline}.cmt .acts{display:flex;align-items:flex-start;justify-content:flex-end;gap:5px;flex-wrap:wrap}
.cmt .acts button{font-size:10px;padding:4px 7px}.cmt .action-delete,.cmt .action-spam{color:var(--red);border-color:rgba(255,106,94,.32)}
.s-pending{color:var(--amber)}.s-approved{color:var(--green)}
.s-rejected{color:var(--muted)}.s-spam{color:var(--red)}
.danger{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.65fr);gap:8px 24px;
padding:12px 14px;background:var(--panel);border:1px solid rgba(255,106,94,.32);
border-left:2px solid var(--red);border-radius:3px}
.danger h3{grid-column:1/-1;margin:0;font-size:12px;color:var(--red);font-weight:600}
.danger p{margin:0;color:var(--muted);max-width:78ch}.danger p+p{margin-top:5px}
.danger form,.danger .none{grid-column:2;grid-row:2/4;align-self:center}
.danger form{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.danger input{width:130px}
.danger button{color:var(--red);border-color:rgba(255,106,94,.45)}
.danger button:hover{background:#1b1211}.danger .none{color:var(--muted)}
.notice{margin-bottom:9px;padding:7px 10px;background:var(--raised);border:1px solid var(--line);
border-left:2px solid var(--green);border-radius:2px}.notice.bad{border-left-color:var(--red)}
@media(max-width:1100px){.cards{grid-template-columns:repeat(3,minmax(110px,1fr))}
form.filters{grid-template-columns:repeat(3,minmax(100px,1fr))}.counter{margin-left:0;text-align:left}}
@media(max-width:720px){.console{padding:8px 8px 36px}header.bar{position:static;align-items:flex-start}
nav.sub{width:100%;border-top:1px solid var(--line);padding-top:5px}
nav.sub a{padding:6px}.cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.card{padding:8px}.card .v{font-size:17px}form.filters{grid-template-columns:repeat(2,minmax(0,1fr))}
form.filters .counter{grid-column:1/-1}.cmt{grid-template-columns:1fr}.cmt .acts{justify-content:flex-start}
.danger{grid-template-columns:1fr}.danger form,.danger .none{grid-column:1;grid-row:auto}}
@media(max-width:420px){body{font-size:11px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}
form.filters{grid-template-columns:1fr}.top{grid-template-columns:1fr}.login{margin-top:8vh}}
`;

function shell(title: string, active: string, body: string): string {
  const tab = (href: string, label: string): string =>
    `<a href="${href}"${active === href ? ' class="on"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><div class="console">
<header class="bar">
<div class="brand"><span class="b">&lt;</span><span class="t">T</span><span class="c">C</span><span class="s">/</span><span class="b">&gt;</span> boss</div>
<nav class="sub">${tab('/boss/', 'Overview')}${tab('/boss/analytics/', 'Analytics')}${tab(
    '/boss/comments/',
    'Comments',
  )}${tab('/boss/system/', 'System')}
<form method="post" action="/boss/logout/" style="display:inline">
<button type="submit">Sign out</button></form></nav>
</header>
${body}
</div></body></html>`;
}

export function renderLogin(error?: string): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>boss</title><style>${STYLE}</style></head>
<body><div class="login">
<div class="brand" style="margin-bottom:16px;font-size:22px">
<span class="b">&lt;</span><span class="t">T</span><span class="c">C</span><span class="s">/</span><span class="b">&gt;</span></div>
${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/boss/login/">
<input name="username" autocomplete="username" placeholder="user" required autofocus>
<input name="password" type="password" autocomplete="current-password" placeholder="password" required>
<button type="submit">Sign in</button>
</form></div></body></html>`;
}

export function renderUnconfigured(): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="robots" content="noindex, nofollow"><title>boss</title><style>${STYLE}</style></head>
<body><div class="login"><div class="err">Panel is not configured.</div></div></body></html>`;
}

export interface SummaryData {
  events: number;
  visitors: number;
  humans: number;
  automated: number;
  last24h: number;
  pendingComments: number;
}

function cards(s: SummaryData): string {
  const card = (k: string, v: number, cls = ''): string =>
    `<div class="card"><div class="k">${escapeHtml(k)}</div>
<div class="v ${cls}">${v.toLocaleString('en-US')}</div></div>`;
  return `<div class="cards">
${card('all time', s.events)}${card('last 24h', s.last24h)}${card('addresses', s.visitors)}
${card('human', s.humans, 'green')}${card('automated', s.automated, 'amber')}
${card('pending comments', s.pendingComments, s.pendingComments > 0 ? 'amber' : '')}</div>`;
}

export interface VisitRow {
  seq: number;
  day_seq: number;
  occurred_at: string;
  local_date: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  host: string;
  path: string;
  referrer: string | null;
  device: string | null;
  browser: string | null;
  user_agent: string | null;
  source: string;
  visits: number;
  automated: number;
}

export function renderOverview(
  summary: SummaryData,
  recent: VisitRow[],
  topPages: Array<{ location: string; events: number }>,
  timeZone: string,
  error?: string,
): string {
  const top = topPages
    .map(
      (p) => `<div><span>${escapeHtml(p.location)}</span><span class="n">${p.events}</span></div>`,
    )
    .join('');
  return shell(
    'boss — overview',
    '/boss/',
    `${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
${cards(summary)}
<h2>top pages</h2><div class="top">${top || '<div><span>—</span><span>0</span></div>'}</div>
<h2>recent visits</h2>
${renderTable(recent, timeZone)}
<div class="pager"><a href="/boss/analytics/">Full analytics →</a></div>`,
  );
}

export function renderTable(rows: VisitRow[], timeZone: string): string {
  if (rows.length === 0) {
    return `<div class="tablewrap"><div class="empty">No rows match this filter.</div></div>`;
  }
  const body = rows
    .map((r) => {
      const flag = repeatFlag(r.visits);
      return `<tr>
<td>${r.seq}</td>
<td>${r.day_seq}</td>
<td>${escapeHtml(r.ip)}</td>
<td class="flag-${flag}">${flag}</td>
<td class="${r.automated ? 'bot' : 'human'}">${r.automated ? 'automated' : 'human'}</td>
<td>${escapeHtml(formatPanelTimestamp(r.occurred_at, timeZone))}</td>
<td>${escapeHtml(r.country)}</td>
<td>${escapeHtml(r.city)}</td>
<td class="wrap">${escapeHtml(`${r.host}${r.path}`)}</td>
<td class="wrap">${escapeHtml(r.referrer)}</td>
<td class="wrap">${escapeHtml(`${r.device ?? ''} / ${r.browser ?? ''}`)}</td>
<td>${escapeHtml(r.source)}</td>
</tr>`;
    })
    .join('');
  return `<div class="tablewrap"><table>
<thead><tr><th>#</th><th>DAY</th><th>ADDRESS</th><th>FLAG</th><th>SOURCE</th><th>DATE</th>
<th>COUNTRY</th><th>CITY</th><th>PAGE</th><th>REFERRER</th><th>DEVICE / BROWSER</th><th>ORIGIN</th>
</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderFilterForm(f: BuiltFilters, matched: number, total: number): string {
  const v = (s: string): string => escapeHtml(s);
  const a = f.active;
  const opt = (value: string, label: string): string =>
    `<option value="${value}"${a.flag === value ? ' selected' : ''}>${label}</option>`;
  return `<form class="filters" method="get" action="/boss/analytics/" id="filters">
<input name="ip" value="${v(a.ip)}" placeholder="ip" aria-label="ip">
<input name="country" value="${v(a.country)}" placeholder="country" aria-label="country">
<input name="city" value="${v(a.city)}" placeholder="city" aria-label="city">
<input name="path" value="${v(a.path)}" placeholder="page" aria-label="page">
<input name="referrer" value="${v(a.referrer)}" placeholder="referrer" aria-label="referrer">
<select name="flag" aria-label="repeat flag">${opt('', 'any flag')}${opt('ok', 'ok')}${opt(
    'repeat',
    'repeat',
  )}${opt('high', 'high repeat')}</select>
<label class="chk"><input type="checkbox" name="humans" value="1"${
    a.humans ? ' checked' : ''
  }> humans only</label>
<button type="submit">Filter</button>
<a href="/boss/analytics/" style="color:var(--muted)">clear</a>
<span class="counter" id="counter">${matched.toLocaleString('en-US')} / ${total.toLocaleString(
    'en-US',
  )} rows</span>
</form>`;
}

export function renderPager(page: number, matched: number, query: string): string {
  const pages = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const link = (p: number, label: string): string =>
    `<a href="/boss/analytics/?${query}${query ? '&' : ''}page=${p}">${label}</a>`;
  const options = Array.from(
    { length: pages },
    (_, i) => `<option value="${i + 1}"${i + 1 === page ? ' selected' : ''}>page ${i + 1}</option>`,
  ).join('');
  return `<div class="pager">
${page > 1 ? link(page - 1, '&larr; newer') : '<span>&larr; newer</span>'}
${page < pages ? link(page + 1, 'older &rarr;') : '<span>older &rarr;</span>'}
<form method="get" action="/boss/analytics/" style="display:flex;gap:6px">
${hiddenFields(query)}<select name="page" onchange="this.form.submit()" aria-label="page">${options}</select>
<noscript><button type="submit">go</button></noscript></form>
<span>of ${pages}</span></div>`;
}

function hiddenFields(query: string): string {
  if (!query) return '';
  return new URLSearchParams(query)
    .toString()
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const [k = '', val = ''] = pair.split('=');
      if (k === 'page') return '';
      return `<input type="hidden" name="${escapeHtml(decodeURIComponent(k))}" value="${escapeHtml(
        decodeURIComponent(val),
      )}">`;
    })
    .join('');
}

export function renderAnalytics(
  summary: SummaryData,
  filters: BuiltFilters,
  rows: VisitRow[],
  matched: number,
  total: number,
  page: number,
  query: string,
  timeZone: string,
  error?: string,
): string {
  return shell(
    'boss — analytics',
    '/boss/analytics/',
    `${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
${cards(summary)}
${renderFilterForm(filters, matched, total)}
<div id="table">${renderTable(rows, timeZone)}</div>
${renderPager(page, matched, query)}
${LIVE_FILTER_SCRIPT}`,
  );
}

/**
 * Progressive enhancement only. The form above is a plain GET form and works
 * with JavaScript disabled; this intercepts what already works.
 */
const LIVE_FILTER_SCRIPT = `<script>
(function(){
  var form=document.getElementById('filters'); if(!form||!window.fetch) return;
  var table=document.getElementById('table'), counter=document.getElementById('counter');
  var timer=null, controller=null;
  function run(){
    var params=new URLSearchParams(new FormData(form));
    var qs=params.toString();
    if(controller) controller.abort();
    controller=new AbortController();
    fetch('/boss/analytics/?'+qs+'&partial=1',{signal:controller.signal,credentials:'same-origin'})
      .then(function(r){ if(!r.ok) throw new Error('http '+r.status); return r.json(); })
      .then(function(d){
        table.innerHTML=d.table;
        if(counter) counter.textContent=d.matched+' / '+d.total+' rows';
        history.replaceState(null,'','/boss/analytics/?'+qs);
      })
      .catch(function(e){ if(e.name!=='AbortError') console.error(e); });
  }
  form.addEventListener('input',function(){ clearTimeout(timer); timer=setTimeout(run,220); });
  form.addEventListener('submit',function(e){ e.preventDefault(); run(); });
})();
</script>`;

export interface ModerationRow {
  id: number;
  article_slug: string;
  parent_id: number | null;
  display_name: string;
  body: string;
  status: string;
  created_at: string;
  country: string | null;
  user_agent: string | null;
}

export function renderComments(
  rows: ModerationRow[],
  status: string,
  counts: Record<string, number>,
  timeZone: string,
  error?: string,
): string {
  const tab = (value: string, label: string): string =>
    `<a href="/boss/comments/?status=${value}"${status === value ? ' class="on"' : ''}>${label} (${
      counts[value] ?? 0
    })</a>`;

  const action = (id: number, act: string, label: string): string =>
    `<form method="post" action="/boss/comments/${act}/">
<input type="hidden" name="id" value="${id}">
<input type="hidden" name="status" value="${escapeHtml(status)}">
<button type="submit" class="action-${act}">${label}</button></form>`;

  const list = rows.length
    ? rows
        .map(
          (r) => `<div class="cmt cmt-${escapeHtml(r.status)}">
<div class="meta">
<span>#${r.id}</span>
<span class="s-${escapeHtml(r.status)}">${escapeHtml(r.status)}</span>
<span>${escapeHtml(r.display_name)}</span>
<span>${escapeHtml(formatPanelTimestamp(r.created_at, timeZone))}</span>
<span>/${escapeHtml(r.article_slug)}/</span>
${r.parent_id ? `<span>reply to #${r.parent_id}</span>` : ''}
${r.country ? `<span>${escapeHtml(r.country)}</span>` : ''}
</div>
<div class="body">${escapeHtml(r.body)}</div>
<div class="acts">
${action(r.id, 'approve', 'approve')}${action(r.id, 'reject', 'reject')}
${action(r.id, 'spam', 'spam')}${action(r.id, 'delete', 'delete')}
</div></div>`,
        )
        .join('')
    : `<div class="empty"><span class="signal">queue clear</span>
<strong>Nothing here.</strong>
<small>No ${escapeHtml(status)} comments are waiting in this view.</small></div>`;

  return shell(
    'boss — comments',
    '/boss/comments/',
    `${error ? `<div class="err">${escapeHtml(error)}</div>` : ''}
<nav class="sub" style="margin-bottom:16px">
${tab('pending', 'pending')}${tab('approved', 'approved')}${tab('rejected', 'rejected')}${tab(
      'spam',
      'spam',
    )}</nav>
${list}`,
  );
}

/**
 * The retention panel.
 *
 * Shows what is actually in ANALYTICS_DB — oldest, newest, total, and how many
 * rows are past the window — then offers one manual delete.
 *
 * Three deliberate frictions, all of them load-bearing:
 *   - the button only appears when there is something to delete;
 *   - the count is stated in the button's own label, so an operator cannot
 *     press it without having read the number;
 *   - a confirmation phrase must be typed, which a stray click cannot produce.
 */
export function renderRetention(stats: RetentionStats, timeZone: string): string {
  const line = (k: string, v: string): string =>
    `<div><span>${escapeHtml(k)}</span><span class="n">${escapeHtml(v)}</span></div>`;

  const when = (value: string | null): string =>
    value ? formatPanelTimestamp(value, timeZone) : '—';

  const form =
    stats.older > 0
      ? `<form method="post" action="/boss/analytics/purge/">
<label class="chk" for="confirm">Onaylamak için <b>${RETENTION_CONFIRM_PHRASE}</b> yazın:</label>
<input id="confirm" name="confirm" autocomplete="off" required>
<button type="submit">${stats.older} kaydı sil (${RETENTION_DAYS} günden eski)</button>
</form>`
      : `<p class="none">${RETENTION_DAYS} günden eski kayıt yok. Silinecek bir şey bulunmuyor.</p>`;

  return `<h2>retention</h2>
<div class="top">
${line('total events', String(stats.total))}
${line('oldest', when(stats.oldest))}
${line('newest', when(stats.newest))}
${line(`older than ${RETENTION_DAYS}d`, String(stats.older))}
</div>
<div class="danger">
<h3>Eski ziyaret kayıtlarını sil</h3>
<p>Bu işlem yalnızca ANALYTICS_DB içindeki <code>visitor_events</code> tablosunu etkiler.
Yorumlar ve denetim kayıtları ayrı bir veritabanındadır ve bu işlemden etkilenmez.</p>
<p>Silme geri alınamaz ve otomatik olarak çalışmaz — yalnızca burada, elle yapılır.
/gizlilik/ sayfasındaki &ldquo;en fazla ${RETENTION_DAYS} gün&rdquo; taahhüdü bu işleme dayanır.</p>
${form}
</div>`;
}

export function renderSystem(
  info: Record<string, string>,
  audit: Array<{ occurred_at: string; actor: string; action: string; entity_id: string }>,
  timeZone: string,
  retention?: RetentionStats,
  notice?: { text: string; ok: boolean },
): string {
  const rows = Object.entries(info)
    .map(
      ([k, v]) => `<div><span>${escapeHtml(k)}</span><span class="n">${escapeHtml(v)}</span></div>`,
    )
    .join('');
  const auditRows = audit.length
    ? audit
        .map(
          (a) =>
            `<tr><td>${escapeHtml(formatPanelTimestamp(a.occurred_at, timeZone))}</td>
<td>${escapeHtml(a.actor)}</td><td>${escapeHtml(a.action)}</td><td>${escapeHtml(a.entity_id)}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="4">No audit events.</td></tr>';
  const noticeHtml = notice
    ? `<div class="notice${notice.ok ? '' : ' bad'}">${escapeHtml(notice.text)}</div>`
    : '';

  return shell(
    'boss — system',
    '/boss/system/',
    `${noticeHtml}<h2>environment</h2><div class="top">${rows}</div>
${retention ? renderRetention(retention, timeZone) : ''}
<h2>recent audit events</h2>
<div class="tablewrap"><table style="min-width:600px">
<thead><tr><th>WHEN</th><th>ACTOR</th><th>ACTION</th><th>ENTITY</th></tr></thead>
<tbody>${auditRows}</tbody></table></div>`,
  );
}
