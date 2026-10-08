/* app.js - shell: login gate, navigation, language / theme, modals, start-up. */
(function () {
  'use strict';

  var current = 'new';
  var inited = false;
  var PREF_KEY = 'ajwa_pos_pref';
  var VIEWS = ['new', 'invoices', 'customers', 'services', 'reports', 'settings'];
  var ADMIN_ONLY = { services: 1, reports: 1 };

  function t(k, v) { return I18N.t(k, v); }

  /* ------------------------------------------------ per-device preferences */
  function pref() { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } }
  function setPref(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(Object.assign(pref(), p))); } catch (e) { /* ignore */ } }

  function setTheme(th) {
    document.documentElement.dataset.theme = th;
    $('thIc').innerHTML = th === 'dark' ? '&#9728;' : '&#127769;';
    $('thTxt').textContent = t(th === 'dark' ? 'light_mode' : 'dark_mode');
  }
  function setLanguage(lang) {
    I18N.setLang(lang);
    setPref({ lang: lang });
    document.querySelectorAll('.lang button, .gatelang button').forEach(function (b) { b.classList.toggle('active', b.dataset.lang === lang); });
    setTheme(document.documentElement.dataset.theme || 'light');
    applyBranding(); updateTitle();
    if (inited) refreshAll();
    gateTexts();
    tick();
  }

  /* ------------------------------------------------ errors */
  function errText(e) {
    var code = e && (e.code || e.message) || 'server_error';
    var key = 'e_' + code;
    var txt = t(key);
    return txt === key ? t('e_server_error') : txt;
  }

  /* ------------------------------------------------ modals */
  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  /* ------------------------------------------------ navigation */
  function show(view) {
    if (ADMIN_ONLY[view] && !Store.isAdmin()) view = 'new';
    current = view;
    VIEWS.forEach(function (v) { $('view-' + v).classList.toggle('active', v === view); });
    document.querySelectorAll('.navi button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    updateTitle();
    var map = { new: NewInvoice, invoices: Invoices, customers: Customers, services: Services, reports: Reports, settings: Settings };
    map[view].refresh();
    window.scrollTo(0, 0);
    // Another device may have added bills: pick up the newest data when these screens are opened.
    if (Store.isServer() && (view === 'invoices' || view === 'customers' || view === 'reports')) {
      Store.reload().then(function () { if (current === view) { map[view].refresh(); updateBadge(); } }).catch(function () { /* keep showing what we have */ });
    }
  }
  function updateTitle() {
    $('pgTitle').innerHTML = esc(t('pg_' + current)) + '<small>' + esc(t('pg_' + current + '_s')) + '</small>';
  }
  function updateBadge() {
    var n = Store.s.invoices.filter(function (i) { return !i.void && i.job !== 'done'; }).length;
    $('navCount').textContent = n; $('navCount').style.display = n ? '' : 'none';
  }
  function applyBranding() {
    var s = Store.s.settings;
    $('brandName').textContent = I18N.pick(s.name, s.nameAr);
    $('brandSub').textContent = t('brand_sub');
    document.title = I18N.pick(s.name, s.nameAr) + ' - ' + t('app_title');
  }
  function refreshAll() {
    NewInvoice.refresh(); applyBranding(); updateBadge(); updateWho();
    if (current === 'invoices') Invoices.refresh();
    if (current === 'customers') Customers.refresh();
    if (current === 'services') Services.refresh();
    if (current === 'reports') Reports.refresh();
    if (current === 'settings') Settings.refresh();
    updateTitle();
  }
  function updateWho() {
    var u = Store.s.user, server = Store.isServer();
    $('who').innerHTML = u ? t('signed_in_as') + '<br><b>' + esc(u.name) + '</b>' + (server ? ' &middot; ' + esc(t('role_' + u.role)) : '') : '';
    $('btnLogout').style.display = server ? '' : 'none';
    $('modebar').style.display = server ? 'none' : '';
    document.querySelectorAll('.navi button').forEach(function (b) { b.style.display = ADMIN_ONLY[b.dataset.view] && !Store.isAdmin() ? 'none' : ''; });
  }

  /* ------------------------------------------------ clock */
  function tick() {
    var d = new Date(), p = function (n) { return n < 10 ? '0' + n : '' + n; };
    $('clock').innerHTML = esc(d.toLocaleDateString(I18N.isRTL() ? 'ar-OM-u-nu-latn' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })) +
      '<br><b>' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '</b>';
  }

  /* ------------------------------------------------ gate (login / first-run) */
  var gateMode = 'login';
  function showGate(mode, msg) {
    gateMode = mode;
    $('gLoading').style.display = 'none';
    $('gate').hidden = false;
    $('gSetup').style.display = mode === 'setup' ? '' : 'none';
    $('gLogin').style.display = mode === 'login' ? '' : 'none';
    $('gateErr').textContent = msg || '';
    gateTexts();
    setTimeout(function () { (mode === 'setup' ? $('suName') : $('lgUser')).focus(); }, 60);
  }
  function gateTexts() {
    $('gateTitle').textContent = t(gateMode === 'setup' ? 'gate_setup_title' : 'gate_login_title');
    $('gateSub').textContent = t(gateMode === 'setup' ? 'gate_setup_sub' : 'gate_login_sub');
  }
  function gateBusy(b) { document.querySelectorAll('#gate .btn').forEach(function (x) { x.disabled = b; }); }
  function submitLogin(e) {
    e.preventDefault(); $('gateErr').textContent = ''; gateBusy(true);
    Store.login($('lgUser').value.trim(), $('lgPass').value).then(function () { $('lgPass').value = ''; start(); })
      .catch(function (x) { $('gateErr').textContent = errText(x); }).then(function () { gateBusy(false); });
  }
  function submitSetup(e) {
    e.preventDefault(); $('gateErr').textContent = '';
    if ($('suPass').value !== $('suPass2').value) { $('gateErr').textContent = t('err_pw_match'); return; }
    gateBusy(true);
    Store.setup($('suUser').value.trim(), $('suName').value.trim(), $('suPass').value).then(function () { start(); })
      .catch(function (x) { $('gateErr').textContent = errText(x); }).then(function () { gateBusy(false); });
  }
  function logout() {
    Store.logout().then(function () { location.reload(); }).catch(function () { location.reload(); });
  }

  /* ------------------------------------------------ start */
  function start() {
    $('gate').hidden = true;
    if (!inited) {
      NewInvoice.init(); Invoices.init(); Customers.init(); Services.init(); Reports.init(); Settings.init();
      inited = true;
    }
    NewInvoice.refresh(); applyBranding(); updateBadge(); updateWho();
    show('new');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var p = pref();
    document.documentElement.dataset.theme = p.theme === 'dark' ? 'dark' : 'light';
    setLanguage(p.lang === 'en' ? 'en' : 'ar');

    document.querySelectorAll('.lang, .gatelang').forEach(function (box) {
      box.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setLanguage(b.dataset.lang); });
    });
    $('btnTheme').addEventListener('click', function () {
      var th = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      setPref({ theme: th }); setTheme(th);
    });
    $('btnLogout').addEventListener('click', logout);
    $('nav').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) show(b.dataset.view); });
    $('gLogin').addEventListener('submit', submitLogin);
    $('gSetup').addEventListener('submit', submitSetup);

    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) m.hidden = true; });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var open = document.querySelectorAll('.modal:not([hidden])');
        if (open.length) { open.forEach(function (m) { m.hidden = true; }); }
        return;
      }
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      if (e.key === '/' && $('gate').hidden) { e.preventDefault(); show('new'); NewInvoice.focusSearch(); }
    });

    tick(); setInterval(tick, 1000);

    // Login expired (left open overnight, etc.): back to the login page instead of a confusing error.
    Store.hooks.authLost = function () {
      if (!$('gate').hidden) return;
      document.querySelectorAll('.modal').forEach(function (m) { m.hidden = true; });
      showGate('login', t('e_not_logged_in'));
    };
    // Coming back to this tab (e.g. on the phone): refresh the numbers.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && inited && $('gate').hidden && Store.isServer()) {
        Store.reload().then(function () { refreshAll(); }).catch(function () { /* ignore */ });
      }
    });
    // Safety net: any failure that slipped through is shown as a message, never silently ignored.
    window.addEventListener('unhandledrejection', function (e) {
      if (e && e.reason && e.reason.code === 'not_logged_in') return;
      toast(errText(e && e.reason), 'bad');
    });

    Store.boot().then(function (state) {
      if (state === 'ready') start();
      else showGate(state);
    }).catch(function (e) { showGate('login', errText(e)); });
  });

  window.App = { show: show, openModal: openModal, closeModal: closeModal, errText: errText, updateBadge: updateBadge,
    applyBranding: applyBranding, start: start };
})();
