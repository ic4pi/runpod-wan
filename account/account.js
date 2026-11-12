(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var mode = 'login';
  var NAMES = { pastry: 'Pastry', beet: 'Beet', sprouts: 'Sprouts' };

  function el(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n[k] = attrs[k]; });
    for (var i = 2; i < arguments.length; i++) n.append(arguments[i]);
    return n;
  }
  function banner(text, isError) {
    var b = $('banner');
    b.textContent = text; b.className = isError ? 'error' : ''; b.hidden = !text;
  }
  function show(which) {
    ['loading', 'signed-out', 'signed-in'].forEach(function (id) { $(id).hidden = id !== which; });
    $('signout').hidden = which !== 'signed-in';
  }
  function money(c) { return '$' + (c / 100).toFixed(2); }
  function api(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  }

  function intro() {
    var need = params.get('need'), err = params.get('error'), cancelled = params.get('cancelled');
    if (err === 'config') banner('Accounts are not switched on yet, so paid modules are locked.', true);
    else if (err === 'unavailable') banner('We could not check your account just now. Try again in a minute.', true);
    else if (need && NAMES[need]) banner('Sign in with an account that owns ' + NAMES[need] + ' to open it.');
    else if (cancelled) banner('Checkout cancelled. You were not charged.');
  }

  function renderModules(me) {
    var list = $('modules'); list.textContent = '';
    me.catalog.forEach(function (m) {
      var owned = me.owned.indexOf(m.id) >= 0;
      var head = el('h2', {}, el('span', {}, m.name, owned ? el('span', { className: 'owned' }, 'Owned') : ''),
        m.priceCents ? el('span', { className: 'price' }, money(m.priceCents)) : '');
      var action;
      if (owned) action = el('a', { className: 'open', href: '/' + m.id + '/' }, 'Open ' + m.name);
      else if (m.status !== 'live') action = el('span', { className: 'soon' }, 'Coming soon');
      else {
        action = el('button', { className: 'buy', type: 'button' }, 'Buy for ' + money(m.priceCents));
        if (!me.payments) { action.disabled = true; action.textContent = 'Payments open soon'; }
        action.addEventListener('click', function () { buy(m.id, action); });
      }
      list.append(el('li', {}, head, el('div', { className: 'tag' }, m.tagline), el('p', {}, m.why), action));
    });
  }

  function buy(id, btn) {
    btn.disabled = true; var label = btn.textContent; btn.textContent = 'Opening checkout…';
    api('/api/checkout', { module: id }).then(function (r) { return r.json().then(function (b) { return { r: r, b: b }; }); })
      .then(function (x) {
        if (x.r.ok && x.b.url) { location.href = x.b.url; return; }
        banner(x.b.message || 'Could not start checkout.', true); btn.disabled = false; btn.textContent = label;
      }).catch(function () { banner('Could not start checkout.', true); btn.disabled = false; btn.textContent = label; });
  }

  function load(retry) {
    return api('/api/me').then(function (r) { return r.json().then(function (b) { return { r: r, b: b }; }); }).then(function (x) {
      if (x.r.ok) {
        $('who').textContent = 'Signed in as ' + x.b.email;
        renderModules(x.b); show('signed-in');
        var paid = params.get('paid');
        if (paid && NAMES[paid] && x.b.owned.indexOf(paid) < 0) waitForPurchase(paid, 0);
        else if (paid && x.b.owned.indexOf(paid) >= 0) banner('Thank you. ' + NAMES[paid] + ' is unlocked.');
        return;
      }
      if (x.b.error === 'expired' && !retry) {
        return api('/api/refresh', {}).then(function (r) { return r.ok ? load(true) : (show('signed-out'), null); });
      }
      if (x.b.error === 'not_configured') banner('Accounts are not switched on yet, so paid modules are locked.', true);
      show('signed-out');
    }).catch(function () { banner('Could not reach the server. Check your connection.', true); show('signed-out'); });
  }

  // Stripe tells us about the payment a moment after you return; check a few times.
  function waitForPurchase(id, n) {
    banner('Payment received. Unlocking ' + NAMES[id] + '…');
    setTimeout(function () {
      api('/api/me').then(function (r) { return r.json(); }).then(function (b) {
        if (b.owned && b.owned.indexOf(id) >= 0) { renderModules(b); banner('Thank you. ' + NAMES[id] + ' is unlocked.'); }
        else if (n < 15) waitForPurchase(id, n + 1);
        else banner('Your payment is processing. Refresh this page in a minute. If it stays locked, contact support with your receipt.');
      }).catch(function () { if (n < 15) waitForPurchase(id, n + 1); });
    }, 2000);
  }

  function setMode(m) {
    mode = m;
    $('tab-login').setAttribute('aria-selected', String(m === 'login'));
    $('tab-signup').setAttribute('aria-selected', String(m === 'signup'));
    $('submit').textContent = m === 'login' ? 'Sign in' : 'Create account';
    $('pw-hint').hidden = m !== 'signup';
    $('password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  }
  $('tab-login').addEventListener('click', function () { setMode('login'); });
  $('tab-signup').addEventListener('click', function () { setMode('signup'); });

  $('auth-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('submit'); btn.disabled = true; banner('');
    api('/api/auth', { action: mode, email: $('email').value, password: $('password').value })
      .then(function (r) { return r.json().then(function (b) { return { r: r, b: b }; }); })
      .then(function (x) {
        if (x.r.ok && x.b.confirm) { banner('Check your email to confirm your account, then sign in.'); setMode('login'); }
        else if (x.r.ok) { $('password').value = ''; return load(false); }
        else banner(x.b.message || 'Something went wrong. Try again.', true);
      }).catch(function () { banner('Could not reach the server. Check your connection.', true); })
      .then(function () { btn.disabled = false; });
  });

  $('signout').addEventListener('click', function () {
    api('/api/auth', { action: 'logout' }).then(function () { banner('Signed out.'); show('signed-out'); });
  });

  intro();
  load(false);
})();
