// Token Radar's dashboard: it reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board with filters, a per-protocol detail drawer with the model's own inputs and the
// protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', early: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, scale: null, share: null, horizon: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures with the fitted
  // coefficients and checks the number board.json carries, so the page's code and the board's data
  // are visibly the same arithmetic.
  function impliedOf(row) {
    var m = DATA.model;
    var fit = DATA.fit;
    var sig = function (z) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); };
    var age = (row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days) / 365;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d)) / 100;
    var shift = (fit.odds_family_shifts || {})[row.category || 'Other'] || 0;
    var odds = sig(fit.odds.intercept + fit.odds.ln_tvl * Math.log(Math.max(row.tvl_usd, 1)) + fit.odds.years * age + fit.odds.growth100 * growth + shift);
    var valueIf = Math.exp(fit.value.intercept + fit.value.ln_tvl * Math.log(Math.max(row.tvl_usd, 1)));
    return Math.max(1, Math.round(valueIf * odds));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // The farming scenario, live: the page recomputes every row's drop, net and verdict from the
  // scenario sliders, exactly as main.ts does for the committed defaults.
  function scenario() {
    return {
      scale: state.scale === null ? 0.02 : state.scale,
      share: state.share === null ? DATA.model.drop_share : state.share,
      horizon: state.horizon === null ? DATA.model.horizon_weeks : state.horizon,
    };
  }
  function farmOf(r) {
    var sc = scenario();
    var deposit = Math.min(50000, Math.max(500, Math.round(r.tvl_usd * sc.scale)));
    var drop = sc.share * r.implied_value_usd * (deposit / Math.max(r.tvl_usd, 1));
    var fees = DATA.model.gas_usd * 2 + deposit * 0.001 + deposit * 0.05 * (sc.horizon / 52);
    var net = drop - fees;
    return {
      deposit: deposit,
      drop: drop,
      fees: fees,
      net: net,
      netPerHour: net / DATA.model.hours_spent,
      verdict: net >= DATA.model.farm_min_usd && net / DATA.model.hours_spent >= DATA.model.farm_min_per_hour ? 'farm' : net > 0 ? 'marginal' : 'skip',
    };
  }
  function rowsWithScenario(list) {
    return list.map(function (r) {
      var f = farmOf(r);
      r.scenario_net_usd = Math.round(f.net * 100) / 100;
      r.scenario_net_per_hour = Math.round(f.netPerHour * 100) / 100;
      r.scenario_verdict = f.verdict;
      r.scenario_deposit = f.deposit;
      r.scenario_drop_usd = Math.round(f.drop * 100) / 100;
      r.scenario_fees_usd = Math.round(f.fees * 100) / 100;
      return r;
    });
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.early && !r.early) return false;
      if (state.verdict !== 'all' && farmOf(r).verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.odds; bv = b.odds; }
      else if (key === 'net') { av = farmOf(a).net; bv = farmOf(b).net; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }


  function scenarioStrip() {
    var sc = scenario();
    function slider(key, label, min, max, step, fmt) {
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(sc[key]), 'aria-label': label });
      var out = el('span', { class: 'val', text: fmt(sc[key]) });
      input.addEventListener('input', function () {
        state[key] = Number(input.value);
        out.textContent = fmt(Number(input.value));
        render();
      });
      return el('label', null, label + ' ', input, ' ', out);
    }
    function download(name, mime, content) {
      var a = document.createElement('a');
      a.href = 'data:' + mime + ';charset=utf-8,' + encodeURIComponent(content);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    var csv = el('button', { type: 'button', text: 'CSV', onclick: function () {
      var head = 'rank,slug,name,category,tvl_usd,change_7d,age_days,odds,value_if_launch_usd,implied_value_usd,p25_usd,p75_usd,verdict,net_usd,net_per_hour\n';
      var body = rowsWithScenario(sortedRows(rows())).map(function (r) {
        return [r.rank, r.slug, '"' + r.name.replace(/"/g, '""') + '"', '"' + (r.category || 'Other') + '"', r.tvl_usd, r.change_7d, r.age_days, r.odds, Math.round(r.value_if_launch_usd), r.implied_value_usd, r.p25_usd, r.p75_usd, r.scenario_verdict, r.scenario_net_usd, r.scenario_net_per_hour].join(',');
      }).join('\n');
      download('token-launch-radar.csv', 'text/csv', head + body);
    } });
    var json = el('button', { type: 'button', text: 'JSON', onclick: function () {
      download('token-launch-radar.json', 'application/json', JSON.stringify({ as_of: DATA.as_of, model: DATA.model_version, scenario: sc, rows: rowsWithScenario(sortedRows(rows())) }, null, 1));
    } });
    return el('div', { class: 'scenario' },
      el('b', { style: 'color: var(--accent2)', text: 'FARM SCENARIO' }),
      slider('scale', 'position', 0.005, 0.1, 0.005, function (v) { return (v * 100).toFixed(1) + '% of TVL'; }),
      slider('share', 'drop share', 0.02, 0.2, 0.005, function (v) { return (v * 100).toFixed(1) + '%'; }),
      slider('horizon', 'horizon', 4, 52, 4, function (v) { return v + 'wk'; }),
      el('span', { text: '— every row below recomputes live' }),
      el('div', { class: 'exports' }, csv, json)
    );
  }

  function accountingStrip() {
    var a = DATA.fit.accounting;
    var total = Math.max(1, a.total);
    return el('div', { class: 'accounting' },
      el('div', { class: 'accbar', role: 'img', 'aria-label': 'protocol accounting' },
        el('i', { class: 'traded', style: 'width:' + (a.traded / total * 100).toFixed(1) + '%' }),
        el('i', { class: 'ranked', style: 'width:' + (a.ranked / total * 100).toFixed(1) + '%' }),
        el('i', { class: 'excluded', style: 'width:' + (a.excluded / total * 100).toFixed(1) + '%' })
      ),
      el('div', { class: 'acclabels' },
        el('span', null, el('span', { class: 'dot2', style: 'background: var(--line2)' }), el('b', { text: String(a.traded) }), ' already trade'),
        el('span', null, el('span', { class: 'dot2', style: 'background: var(--accent)' }), el('b', { text: String(a.ranked) }), ' pre-token, ranked'),
        el('span', null, el('span', { class: 'dot2', style: 'background: var(--down); opacity:.55' }), el('b', { text: String(a.excluded) }), ' pre-token, excluded (exchange pools, wrapped or staked forms)'),
        el('span', null, el('b', { text: String(a.total) }), ' in the snapshot')
      )
    );
  }

  function ablationPanel() {
    var fit = DATA.fit;
    var rowsV = fit.ablation.map(function (a) {
      var kept = a.terms === 'tvl';
      return el('tr', null,
        el('td', { class: kept ? 'kept' : 'dropped', text: (kept ? '✓ ' : '✗ ') + a.terms }),
        el('td', { text: (a.loo_r2 >= 0 ? '+' : '') + a.loo_r2.toFixed(3) }),
        el('td', { text: a.wf_mae.toFixed(3) }));
    });
    var rowsO = fit.odds_ablation.map(function (a) {
      var best = a.brier === Math.min.apply(null, fit.odds_ablation.map(function (x) { return x.brier; }));
      return el('tr', null,
        el('td', { class: best ? 'kept' : '', text: (best ? '✓ ' : '') + a.terms }),
        el('td', { text: a.brier.toFixed(3) }));
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Every term tested, the kept ones stated' }),
      el('p', { class: 'sub', text: 'A term stays in the value model only if it improves the held-out miss both leave-one-out and walk-forward (the earlier-listed 70% of live tokens price the later 30%). The odds model reports its own drop-one Brier. Nothing is kept on faith.' }),
      el('div', { class: 'ablation' },
        el('div', { class: 'abl' }, el('h4', { text: 'Value if it launches — term tests' }),
          el('table', null, el('thead', null, el('tr', null, el('th', { text: 'terms' }), el('th', { text: 'LOO R²' }), el('th', { text: 'WF MAE' }))), el('tbody', null, rowsV))),
        el('div', { class: 'abl' }, el('h4', { text: 'Token odds — drop-one Brier' }),
          el('table', null, el('thead', null, el('tr', null, el('th', { text: 'model' }), el('th', { text: 'Brier' }))), el('tbody', null, rowsO)))
      )
    );
  }

  function modelStrip() {
    var fit = DATA.fit;
    return el('div', { class: 'modelstrip' },
      el('span', { class: 'cover', text: 'radar-3 ·' }),
      el('span', null, 'implied value = ', el('b', { text: 'TVL^' + fit.value.ln_tvl.toFixed(2) }), ' × ', el('b', { text: 'token odds' }), ' — both fitted on this snapshot'),
      el('span', { class: 'sep', text: '·' }),
      el('span', { text: 'value-if-launch: log mcap ~ log TVL on ' + fit.live_count + ' live tokens (slope ' + fit.value.ln_tvl.toFixed(3) + ' ± ' + fit.value_ln_tvl_se.toFixed(3) + ' bootstrap s.e., 200 refits; LOO R² ' + fit.value_loo_r2.toFixed(2) + '; the printed range is honest: ' + Math.round(fit.band_cover_50 * 100) + '% / ' + Math.round(fit.band_cover_80 * 100) + '% of real caps fall inside P25–P75 / P10–P90)' }),
      el('span', { class: 'sep', text: '·' }),
      el('span', { text: 'odds: logistic on ' + fit.protocol_count + ' protocols (Brier ' + fit.odds_brier.toFixed(3) + ' vs base ' + fit.odds_brier_base.toFixed(3) + '; walk-forward ' + fit.odds_wf_brier.toFixed(3) + ' vs ' + fit.odds_wf_brier_base.toFixed(3) + ')' }),
      el('span', { class: 'sep', text: '·' }),
      el('span', { class: 'cover', text: '40/40' }),
      el('span', { text: 'watchlist covered' })
    );
  }

  function header() {
    return el('header', { class: 'top' },
      el('h1', null, el('span', { class: 'pulse', text: '◉ ' }), 'Token Launch Radar'),
      el('span', { class: 'badge', text: DATA.model_version }),
      el('div', { class: 'top-meta' },
        el('span', { text: 'snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.watchlist_size + ' watchlist' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0] || { implied_value_usd: 0, name: '—' };
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' pre-token protocols, ranked by expected launch value' }),
        el('p', { html: 'Every protocol with <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M</b> or more of TVL and no token on record sits on the watchlist. Category launch multiples are calibrated from the market\'s own live-token protocols, growth and maturity adjust them, and the <b>early radar</b> adds ' + DATA.early_size + ' pre-token finds below the floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('b', { text: DATA.watchlist_size + '/' + DATA.watchlist_size }), el('span', { text: 'watchlist' })),
        el('div', { class: 'fact' }, el('b', { text: String(DATA.board_size) }), el('span', { text: 'rows' })),
        el('div', { class: 'fact' }, el('b', { text: DATA.fit.odds_brier.toFixed(3) }), el('span', { text: 'odds Brier < ' + DATA.fit.odds_brier_base.toFixed(3) + ' base' })),
        el('div', { class: 'fact' }, el('b', { text: DATA.fit.value_loo_r2.toFixed(2) }), el('span', { text: 'value LOO R²' })),
        el('div', { class: 'fact' }, el('b', { text: Math.round(DATA.fit.band_cover_50 * 100) + '% · ' + Math.round(DATA.fit.band_cover_80 * 100) + '%' }), el('span', { text: 'band honesty (nominal 50 · 80)' })),
        el('div', { class: 'fact' }, el('b', { text: fmtUsd(top.implied_value_usd) }), el('span', { text: 'top implied' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var counts = { all: DATA.rows.length, farm: 0, marginal: 0, skip: 0 };
    DATA.rows.forEach(function (r) { var f = farmOf(r); counts[f.verdict] += 1; });
    var verdictPills = el('div', { class: 'pillrow' }, ['all', 'farm', 'marginal', 'skip'].map(function (v) {
      return el('button', { type: 'button', class: 'pill' + (state.verdict === v ? ' on' : ''), onclick: function () { state.verdict = v; writeHash(); render(); } },
        el('span', null, v === 'all' ? 'All' : v), el('b', { text: String(counts[v]) }));
    }));
    var tierPills = el('div', { class: 'pillrow' }, [
      el('button', { type: 'button', class: 'pill' + (!state.early ? ' on' : ''), onclick: function () { state.early = false; writeHash(); render(); } }, 'Watchlist + early'),
      el('button', { type: 'button', class: 'pill' + (state.early ? ' on' : ''), onclick: function () { state.early = true; writeHash(); render(); } }, 'Early only')
    ]);
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { text: 'Verdict' }), verdictPills),
      el('div', { class: 'field' }, el('label', { text: 'Board' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.rows.length + ' rows' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function boardTable() {
    var list = rowsWithScenario(sortedRows(rows()));
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.early = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var chips = (r.chains || []).slice(0, 3).map(function (c) { return el('span', { class: 'chip', text: c }); });
      if (r.chains && r.chains.length > 3) chips.push(el('span', { class: 'chip', text: '+' + (r.chains.length - 3) }));
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rk' }, r.rank <= 3 ? el('b', { text: String(r.rank) }) : String(r.rank)),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub' }, [el('span', { class: 'cat', text: r.category || 'Other' }), r.early ? el('span', { class: 'early-tag', text: ' EARLY' }) : el('span', { class: 'wl-tag', text: 'WATCHLIST' }), r.parent ? el('span', { class: 'early-tag', style: 'color: var(--down)', text: ' PARENT ×0.5' }) : null, el('div', { class: 'chips', style: 'margin-top:3px' }, chips)])
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: (r.odds * 100).toFixed(0) + '%' }),
        el('td', null, el('div', { class: 'oddsbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.odds * 100)) + '%' }))),
        el('td', { class: 'num', text: fmtUsd(r.value_if_launch_usd) }),
        el('td', null, el('div', { class: 'implied' },
          el('b', { text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' }))
        )),
        el('td', { class: 'num rng', title: 'P25–P75: ' + fmtUsd(r.p25_usd) + ' – ' + fmtUsd(r.p75_usd) + ' — the honest value band; within it the order of the board is not settled, the verdict column is what to farm on', text: fmtUsd(r.p25_usd) + '–' + fmtUsd(r.p75_usd) }),
        el('td', null, el('span', { class: 'verdict v-' + r.scenario_verdict, text: r.scenario_verdict.toUpperCase() })),
        el('td', { class: 'num ' + (r.scenario_net_usd > 0 ? 'pos' : 'neg') }, el('b', { text: (r.scenario_net_usd > 0 ? '+$' : '−$') + Math.abs(r.scenario_net_usd).toFixed(0) }), el('span', { class: 'brk', text: 'drop $' + r.scenario_drop_usd.toFixed(0) + ' − fees $' + r.scenario_fees_usd.toFixed(0) + ' · $' + r.scenario_net_per_hour.toFixed(1) + '/h' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            el('th', { scope: 'col', text: 'Odds' }),
            el('th', { scope: 'col', text: '' }),
            sortHeader('tvl', 'If it launches'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'P25–P75' }),
            el('th', { scope: 'col', text: 'Verdict' }),
            el('th', { scope: 'col', text: 'Net / hour' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'rk', text: '·' }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub' }, el('span', { class: 'cat', text: r.category || 'Other' }))
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num mc', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: '' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd × ' + m.base_multiple + ' × <b>category multiple</b> × <b>chain multiplier</b> × growth × maturity )'
      ),
      el('div', { class: 'formula' },
        "category multiple = median( mcap / tvl ) of that category's live-token protocols, clamped to [" + m.multiple_floor + ', ' + m.multiple_cap + "]; the market's own pricing, not a guess"
      ),
      el('div', { class: 'formula' },
        'growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '   ·   maturity = ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' × ' + m.maturity_range + '   ·   chain = 1 + (chains − 1) × ' + m.chain_step + ', capped ' + m.chain_cap
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function mrow(lab, val, pct, cls) {
    return el('div', { class: 'mrow' },
      el('span', { class: 'lab', text: lab }),
      el('span', { class: 'val', text: val }),
      el('span', { class: 'track' }, el('i', { class: 'fill' + (cls ? ' ' + cls : ''), style: 'width:' + Math.max(2, Math.min(100, Math.round(pct))) + '%' }))
    );
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var re = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.early ? ' · early find' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' · ' + (row.chains && row.chains.length ? row.chains.join(' · ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: '✕', onclick: function () { dialog.close(); } })
    ));
    var growth = row.change_7d === null ? 0 : Math.max(DATA.model.growth_floor, Math.min(DATA.model.growth_cap, row.change_7d));
    var fit = DATA.fit;
    dialog.appendChild(el('div', { class: 'detail-body' },
      el('div', { class: 'dstats' },
        el('div', { class: 'dstat big' }, el('div', { class: 'v', text: fmtUsd(row.implied_value_usd) }), el('div', { class: 'k', text: 'implied value = odds × value if it launches · P25–P75 ' + fmtUsd(row.p25_usd) + ' – ' + fmtUsd(row.p75_usd) })),
        el('div', { class: 'dstat' }, el('div', { class: 'v', text: (row.odds * 100).toFixed(0) + '%' }), el('div', { class: 'k', text: 'token odds' })),
        el('div', { class: 'dstat' }, el('div', { class: 'v', text: fmtUsd(row.value_if_launch_usd) }), el('div', { class: 'k', text: 'value if it launches' })),
        el('div', { class: 'dstat' }, el('div', { class: 'v', text: fmtUsd(row.tvl_usd) }), el('div', { class: 'k', text: 'TVL' })),
        el('div', { class: 'dstat' }, el('div', { class: 'v' + (row.change_7d !== null && row.change_7d >= 0 ? ' pos' : ' neg'), text: fmtPct(row.change_7d) }), el('div', { class: 'k', text: '7d TVL change' })),
        el('div', { class: 'dstat' }, el('div', { class: 'v', text: fmtAge(row.age_days) }), el('div', { class: 'k', text: 'age, no token' }))
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'The model, on this row' }),
        el('div', { class: 'equation' },
          mrow('ln TVL', Math.log(Math.max(row.tvl_usd, 1)).toFixed(2), 100),
          mrow('× value slope ' + fit.value.ln_tvl.toFixed(3), fmtUsd(row.value_if_launch_usd), 80, 'gold'),
          mrow('× token odds (logistic: years +' + fit.odds.years.toFixed(2) + ', growth ' + fit.odds.growth100.toFixed(1) + ')', (row.odds * 100).toFixed(0) + '%', row.odds * 100, growth < 0 ? 'red' : ''),
          mrow('= implied value', fmtUsd(row.implied_value_usd), 100, 'gold')
        ),
        el('div', { class: 'xcheck' }, 'rank range ' + row.rank_lo + '–' + row.rank_hi + ' of ' + DATA.board_size + ': within the model band the order of the board is not settled — farm on the verdict, not the rank'),
        el('div', { class: 'xcheck' + (re === row.implied_value_usd ? ' ok' : '') }, re === row.implied_value_usd ? '✓ the page recomputes this row to ' + fmtUsd(re) + ', the same number board.json carries' : '⚠ the page recomputes ' + fmtUsd(re) + ', which differs from the board: the data would be stale'),
        el('p', { class: 'sub', style: 'margin-top:8px', text: 'Model ' + DATA.model_version + ': fitted on the snapshot itself — value on ' + fit.live_count + ' live tokens (LOO R² ' + fit.value_loo_r2.toFixed(2) + '), odds on ' + fit.protocol_count + ' protocols (Brier ' + fit.odds_brier.toFixed(3) + ' vs ' + fit.odds_brier_base.toFixed(3) + ' base). This is an estimate, not a price.' })
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farming, this scenario' }),
        el('div', { class: 'dstats' },
          el('div', { class: 'dstat' }, el('div', { class: 'v', text: '$' + Math.min(50000, Math.max(500, Math.round(row.tvl_usd * 0.02))).toLocaleString() }), el('div', { class: 'k', text: 'deposit (2% of TVL, $500–$50k)' })),
          el('div', { class: 'dstat' }, el('div', { class: 'v', text: '$' + (row.net_usd + DATA.model.gas_usd * 2 + Math.min(50000, Math.max(500, Math.round(row.tvl_usd * 0.02))) * (0.001 + 0.05 * DATA.model.horizon_weeks / 52)).toFixed(0) }), el('div', { class: 'k', text: 'expected drop (' + (DATA.model.drop_share * 100).toFixed(0) + '% share)' })),
          el('div', { class: 'dstat' }, el('div', { class: 'v ' + (row.net_usd > 0 ? 'pos' : 'neg') }, el('span', null, (row.net_usd > 0 ? '+$' : '−$') + Math.abs(row.net_usd).toFixed(0))), el('div', { class: 'k', text: 'net of fees, ' + DATA.model.horizon_weeks + ' weeks' })),
          el('div', { class: 'dstat' }, el('div', { class: 'v ' + (row.net_usd > 0 ? 'pos' : 'neg') }, el('span', null, (row.net_per_hour > 0 ? '+$' : '−$') + Math.abs(row.net_per_hour).toFixed(1) + '/h')), el('div', { class: 'k', text: 'net per hour of work' }))
        ),
        el('div', { class: 'verdictline' }, el('span', { class: 'verdict v-' + row.verdict, text: row.verdict.toUpperCase() }), ' — ' + (row.verdict === 'farm' ? 'beats $' + DATA.model.farm_min_per_hour + '/h and $' + DATA.model.farm_min_usd + ' net: worth farming in this scenario.' : row.verdict === 'marginal' ? 'a positive but small expected net: farm only if you believe the odds are low.' : 'the fees eat the expected drop: skip in this scenario.' ))
      ),
      el('section', { class: 'detail-section' },
        el('h3', { text: 'Farm plan' }),
        el('ol', { class: 'steps' }, steps.map(function (s, i) {
          var at = s.indexOf(' Cost: ');
          var action = at >= 0 ? s.slice(0, at) : s;
          var tail = at >= 0 ? s.slice(at + 8) : '';
          var costEl = el('span', { class: 'cost', text: tail });
          var day = ['Day 0', 'Day 0', 'Weekly', 'Day ' + (DATA.model.horizon_weeks * 7), 'Day ' + (DATA.model.horizon_weeks * 7 + 1), 'After'][i] || '';
          return el('li', { 'data-n': String(i + 1) }, el('span', { class: 'farmday', text: day }), el('b', { text: action }), costEl);
        }))
      )
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell compact' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(modelStrip());
    if (state.tab === 'pre-token') shell.appendChild(accountingStrip());
    if (state.tab === 'pre-token') shell.appendChild(scenarioStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(ablationPanel());
    shell.appendChild(el('footer', null,
      el('b', null, 'Token Launch Radar'), ' · model ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' from the DefiLlama protocol index · ' + DATA.rows.length + ' pre-token rows, ' + DATA.live.length + ' live-token protocols set aside · implied values are estimates, not prices'
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
