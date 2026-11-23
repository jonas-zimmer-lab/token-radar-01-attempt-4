// COPY RADAR dashboard: renders window.RADAR (written by main.ts as
// data.js), filters/sorts the board, and opens a detail view per row.
// Hash routing: #detail=<slug> opens a protocol, #signal=<TIER> and
// #cat=<category> pre-apply filters, so each view is linkable.
(function () {
  var D = window.RADAR;
  if (!D) { document.body.textContent = 'No radar data (data.js missing).'; return; }
  var $ = function (id) { return document.getElementById(id); };
  var fmt$ = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  };
  var pct = function (v) { return v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };
  var age = function (d) { return d === null || d === undefined ? '—' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd'; };
  var pill = function (s) {
    return '<span class="pill ' + (s === 'STRONG COPY' ? 'strong' : s === 'COPY' ? 'copy' : s === 'WATCH' ? 'watch' : 'queue') + '">' + s + '</span>';
  };

  // Stats strip.
  var strong = D.rows.filter(function (r) { return r.signal === 'STRONG COPY'; }).length;
  $('stats').innerHTML =
    '<div class="stat"><b>' + D.board_size + '</b><span>ranked rows</span></div>' +
    '<div class="stat"><b>' + D.watchlist_size + '</b><span>watchlist</span></div>' +
    '<div class="stat"><b>' + strong + '</b><span>strong copy</span></div>' +
    '<div class="stat"><b>' + D.leaders.length + '</b><span>leaders</span></div>';
  $('asof').textContent = D.as_of;
  $('model').textContent = D.model_version;
  $('foot-count').textContent = D.board_size;

  // Filter options.
  D.categories.forEach(function (c) { var o = document.createElement('option'); o.textContent = c; $('cat').appendChild(o); });
  D.chains.forEach(function (c) { var o = document.createElement('option'); o.textContent = c; $('chain').appendChild(o); });

  function params() {
    var h = new URLSearchParams(location.hash.slice(1));
    return { detail: h.get('detail') || '', signal: h.get('signal') || '', cat: h.get('cat') || '' };
  }
  function filtered() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value, chain = $('chain').value, sig = $('signal').value;
    var rows = D.rows.filter(function (r) {
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (sig && r.signal !== sig) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + r.leader_name).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var s = $('sort').value;
    var by = { rank: function (a, b) { return a.rank - b.rank; }, implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || -9) - (a.change_7d || -9); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); } };
    return rows.sort(by[s] || by.rank);
  }
  function render() {
    var rows = filtered();
    $('count').textContent = rows.length + ' of ' + D.board_size + ' protocols';
    $('empty').hidden = rows.length > 0;
    $('rows').innerHTML = rows.map(function (r) {
      var g = r.change_7d === null ? '<span>—</span>' : '<span class="' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + r.slug + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><span class="name">' + r.name + '</span><br><span class="slug">' + r.slug + '</span></td>' +
        '<td>' + (r.category || '—') + '</td><td>' + r.chains.join(', ') + '</td>' +
        '<td class="num">' + fmt$(r.tvl_usd) + '</td><td class="num">' + g + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num"><b>' + fmt$(r.implied_value_usd) + '</b></td>' +
        '<td><span class="leader">' + r.leader_name + '</span><br><span class="slug">×' + r.leader_multiple + ' TVL</span></td>' +
        '<td>' + pill(r.signal) + '</td></tr>';
    }).join('');
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      if (params().detail === tr.getAttribute('data-slug')) tr.classList.add('sel');
    });
  }
  function openDetail(slug, viaHash) {
    var r = D.rows.find(function (x) { return x.slug === slug; });
    var box = $('detail');
    if (!r) { box.hidden = true; return; }
    if (viaHash) document.body.classList.add('detail-mode');
    var steps = (r.farm_steps || []).map(function (s) { return '<li>' + s + '</li>'; }).join('');
    box.innerHTML = '<button class="close" id="close-detail">Close ✕</button>' +
      '<h2>#' + r.rank + ' ' + r.name + ' ' + pill(r.signal) + '</h2>' +
      '<p class="meta">' + (r.category || 'Uncategorised') + ' · ' + r.chains.join(', ') + ' · TVL ' + fmt$(r.tvl_usd) +
      ' · 7d ' + pct(r.change_7d) + ' · listed ' + (r.listed_at || 'unknown') + ' (' + age(r.age_days) + ') · records no token</p>' +
      '<p><strong>Copy signal:</strong> price this protocol the way the market priced <span class="leader">' + r.leader_name + '</span> — ' +
      'its leader trades at ×' + r.leader_multiple + ' its TVL, so ' + r.name + ' at the same multiple is worth ' + fmt$(r.implied_value_usd) + '.</p>' +
      '<h3>Farm plan — copy the leader, step by step</h3><ol>' + steps + '</ol>' +
      '<div class="nums"><span>Momentum ×' + r.model.momentum + '</span><span>Persistence ×' + r.model.persistence + '</span>' +
      '<span>Chain breadth ×' + r.model.breadth + '</span><span>Score ' + r.score + '</span></div>';
    box.hidden = false;
    $('close-detail').addEventListener('click', function () { box.hidden = true; document.body.classList.remove('detail-mode'); location.hash = ''; });
    box.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  ['q', 'cat', 'chain', 'signal', 'sort'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });
  window.addEventListener('hashchange', function () { applyHash(); render(); });
  function applyHash() {
    var p = params();
    if (p.signal) $('signal').value = p.signal;
    if (p.cat) $('cat').value = p.cat;
    render();
    if (p.detail) openDetail(p.detail, true);
  }
  // Leaders panel.
  $('leaders').innerHTML = D.leaders.map(function (l) {
    return '<div class="leader-card"><b>' + l.name + '</b> <span class="slug">' + (l.category || '') + '</span>' +
      '<div class="m">Market cap ' + fmt$(l.mcap_usd) + ' on TVL ' + fmt$(l.tvl_usd) + ' — trades at <span class="mult">×' + l.multiple.toFixed(2) + ' TVL</span></div></div>';
  }).join('');
  applyHash();
})();
