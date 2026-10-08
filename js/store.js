/* store.js - all saving and loading goes through here.

   Two back ends behind one interface:
     server  -> the PHP API on Hostinger (real login, SQLite database, shared by every device)
     local   -> this browser's localStorage. Used only when there is no PHP (opening the files
                from a folder, or a plain static host). It is the "demo mode".
   The rest of the app never needs to know which one is active.            */
(function () {
  'use strict';

  var API = 'api/index.php';
  var LS_KEY = 'ajwa_pos_ajwa-shinas_db';

  var S = {
    mode: 'local',            // 'server' | 'local'
    user: null,               // {id, username, name, role}
    settings: Catalog.defaultSettings(),
    services: [], customers: [], invoices: [],
    counter: 0
  };

  function err(code, status) { var e = new Error(code); e.code = code; e.status = status || 0; return e; }

  /* ------------------------------------------------ server calls */
  function call(action, body) {
    var post = body !== undefined;
    var opt = { method: post ? 'POST' : 'GET', credentials: 'same-origin', headers: { 'X-Requested-With': 'ajwa-pos' } };
    if (post) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(API + '?action=' + action, opt).then(function (res) {
      return res.text().then(function (txt) {
        var j = null;
        try { j = JSON.parse(txt); } catch (e) { /* not our API */ }
        if (!j || typeof j !== 'object') throw err('no_api', res.status);
        if (!j.ok) throw err(j.error || 'server_error', res.status);
        return j;
      });
    }, function () { throw err('network'); });
  }

  /* ------------------------------------------------ local storage */
  function localSave() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        settings: S.settings, services: S.services, customers: S.customers, invoices: S.invoices, counter: S.counter
      }));
    } catch (e) { throw err('storage_full'); }
  }
  function localLoad() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* private mode */ }
    var d = null;
    if (raw) { try { d = JSON.parse(raw); } catch (e) { d = null; } }
    if (d && d.settings) { adopt(d); return; }
    seedDemo();
  }
  function seedDemo() {
    S.settings = Catalog.defaultSettings(); Catalog.setCustom(S.settings);
    S.services = Catalog.defaultServices();
    S.customers = Catalog.sampleCustomers();
    S.invoices = Catalog.sampleInvoices(S.services, S.customers, S.settings, 1);
    S.counter = S.invoices.length;
  }
  function adopt(d) {
    S.settings = Object.assign(Catalog.defaultSettings(), d.settings || {}); Catalog.setCustom(S.settings);
    S.services = d.services || [];
    S.customers = d.customers || [];
    S.invoices = d.invoices || [];
    S.counter = d.counter || 0;
  }
  function pad(n) { return (S.settings.prefix || 'INV') + '-' + String(n).padStart(5, '0'); }
  function upsert(list, doc) {
    var i = -1; list.forEach(function (x, k) { if (x.id === doc.id) i = k; });
    if (i >= 0) list[i] = doc; else list.push(doc);
  }
  function isServer() { return S.mode === 'server'; }

  /* ------------------------------------------------ boot / auth */
  /* Resolves to 'ready' | 'login' | 'setup'.  Falls back to demo mode when the API is not there. */
  function boot() {
    return call('status').then(function (st) {
      S.mode = 'server';
      if (st.setup_needed) return 'setup';
      if (!st.user) return 'login';
      S.user = st.user;
      return loadServer().then(function () { return 'ready'; });
    }, function (e) {
      if (e.code === 'no_api' || e.code === 'network') {
        S.mode = 'local';
        S.user = { id: 0, username: 'demo', name: 'Demo', role: 'admin' };
        localLoad();
        return 'ready';
      }
      throw e;
    });
  }
  function loadServer() {
    return call('load').then(function (d) {
      S.user = d.user;
      S.settings = Object.assign(Catalog.defaultSettings(), d.settings || {}); Catalog.setCustom(S.settings);
      S.services = d.services || [];
      S.customers = d.customers || [];
      S.invoices = d.invoices || [];
      S.counter = d.counter || 0;
      // A brand-new server install starts with the standard price list.
      if (!d.settings) {
        S.services = Catalog.defaultServices();
        return call('restore', { data: { settings: S.settings, services: S.services, customers: [], invoices: [], counter: 0 } });
      }
    });
  }
  function login(username, password) {
    return call('login', { username: username, password: password }).then(function () { return loadServer(); });
  }
  function setup(username, name, password) {
    return call('setup', { username: username, name: name, password: password }).then(function () { return loadServer(); });
  }
  function logout() {
    if (!isServer()) return Promise.resolve();
    return call('logout', {}).then(function () { S.user = null; });
  }

  /* ------------------------------------------------ writes */
  function saveSettings(doc) {
    S.settings = Object.assign({}, S.settings, doc); Catalog.setCustom(S.settings);
    if (isServer()) return call('put', { col: 'settings', doc: S.settings });
    localSave(); return Promise.resolve();
  }
  function saveService(doc) {
    if (isServer()) return call('put', { col: 'services', doc: doc }).then(function () { upsert(S.services, doc); });
    upsert(S.services, doc); localSave(); return Promise.resolve();
  }
  function removeService(id) {
    var drop = function () { S.services = S.services.filter(function (x) { return x.id !== id; }); };
    if (isServer()) return call('del', { col: 'services', id: id }).then(drop);
    drop(); localSave(); return Promise.resolve();
  }
  function replaceServices(list) {
    if (isServer()) return call('replace', { col: 'services', docs: list }).then(function () { S.services = list; });
    S.services = list; localSave(); return Promise.resolve();
  }
  function saveCustomer(doc) {
    if (isServer()) return call('put', { col: 'customers', doc: doc }).then(function () { upsert(S.customers, doc); });
    upsert(S.customers, doc); localSave(); return Promise.resolve();
  }
  function removeCustomer(id) {
    var drop = function () { S.customers = S.customers.filter(function (x) { return x.id !== id; }); };
    if (isServer()) return call('del', { col: 'customers', id: id }).then(drop);
    drop(); localSave(); return Promise.resolve();
  }
  function createInvoice(inv) {
    if (isServer()) {
      return call('create_invoice', { doc: inv }).then(function (r) {
        S.invoices.push(r.doc); S.counter = r.counter; return r.doc;
      });
    }
    S.counter += 1;
    inv.no = S.counter; inv.id = String(S.counter); inv.number = pad(S.counter);
    inv.created = Math.floor(Date.now() / 1000); inv.createdBy = S.user ? S.user.name : '';
    S.invoices.push(inv); localSave();
    return Promise.resolve(inv);
  }
  function updateInvoice(inv) {
    if (isServer()) return call('put', { col: 'invoices', doc: inv }).then(function (r) { upsert(S.invoices, r.doc); return r.doc; });
    upsert(S.invoices, inv); localSave(); return Promise.resolve(inv);
  }

  /* Permanently delete bills. Numbers are never re-used: the counter is left as it is. */
  function removeInvoices(ids) {
    var gone = {}; ids.forEach(function (id) { gone[id] = 1; });
    var drop = function () { S.invoices = S.invoices.filter(function (i) { return !gone[i.id]; }); };
    if (isServer()) return call('del_many', { col: 'invoices', ids: ids }).then(drop);
    drop(); localSave(); return Promise.resolve();
  }

  /* ------------------------------------------------ whole database */
  function exportAll() {
    return { app: 'ajwa-shinas-pos', version: 1, exported: new Date().toISOString(),
      settings: S.settings, services: S.services, customers: S.customers, invoices: S.invoices, counter: S.counter };
  }
  function restore(data) {
    if (!data || !Array.isArray(data.invoices)) return Promise.reject(err('bad_backup'));
    var payload = {
      settings: Object.assign(Catalog.defaultSettings(), data.settings || {}),
      services: data.services || [], customers: data.customers || [], invoices: data.invoices || [],
      counter: Math.max(data.counter || 0, data.invoices.reduce(function (m, i) { return Math.max(m, i.no || 0); }, 0))
    };
    if (isServer()) return call('restore', { data: payload }).then(function () { adopt(payload); });
    adopt(payload); localSave(); return Promise.resolve();
  }
  function loadSamples() {
    var settings = Object.assign({}, S.settings);
    var services = Catalog.defaultServices(), customers = Catalog.sampleCustomers();
    var invoices = Catalog.sampleInvoices(services, customers, settings, 1);
    return restore({ settings: settings, services: services, customers: customers, invoices: invoices, counter: invoices.length });
  }
  function wipe(resetCounter) {
    var settings = S.settings;
    if (isServer()) {
      return call('reset', { resetCounter: !!resetCounter }).then(function () {
        return call('restore', { data: { settings: settings, services: S.services, customers: [], invoices: [], counter: resetCounter ? 0 : S.counter } });
      }).then(function () { S.customers = []; S.invoices = []; if (resetCounter) S.counter = 0; });
    }
    S.customers = []; S.invoices = []; if (resetCounter) S.counter = 0;
    localSave(); return Promise.resolve();
  }

  /* ------------------------------------------------ staff accounts (server only) */
  function users() { return call('users').then(function (r) { return r.users; }); }
  function addUser(u) { return call('user_add', u); }
  function delUser(id) { return call('user_del', { id: id }); }
  function setPassword(body) { return call('user_password', body); }

  window.Store = {
    s: S, isServer: isServer, isAdmin: function () { return !!S.user && S.user.role === 'admin'; },
    boot: boot, login: login, setup: setup, logout: logout,
    saveSettings: saveSettings, saveService: saveService, removeService: removeService, replaceServices: replaceServices,
    saveCustomer: saveCustomer, removeCustomer: removeCustomer,
    createInvoice: createInvoice, updateInvoice: updateInvoice, removeInvoices: removeInvoices,
    exportAll: exportAll, restore: restore, loadSamples: loadSamples, wipe: wipe,
    users: users, addUser: addUser, delUser: delUser, setPassword: setPassword,
    invoiceById: function (id) { return S.invoices.filter(function (i) { return i.id === id; })[0]; },
    serviceById: function (id) { return S.services.filter(function (i) { return i.id === id; })[0]; },
    customerById: function (id) { return S.customers.filter(function (i) { return i.id === id; })[0]; }
  };
})();
