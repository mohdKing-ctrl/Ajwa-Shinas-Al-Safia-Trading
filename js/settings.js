/* settings.js - business details, VAT, printing, staff accounts, backup / restore. */
(function () {
  'use strict';

  var busy = false;
  function t(k, v) { return I18N.t(k, v); }
  var FIELDS = { name: 'stName', nameAr: 'stNameAr', addr: 'stAddr', addrAr: 'stAddrAr', phone: 'stPhone', email: 'stEmail', cr: 'stCr',
    vatNo: 'stVatNo', prefix: 'stPrefix', footer: 'stFooter', terms: 'stTerms', bank: 'stBank' };

  function fill() {
    var s = Store.s.settings;
    Object.keys(FIELDS).forEach(function (k) { $(FIELDS[k]).value = s[k] || ''; });
    $('stVatOn').checked = !!s.vatOn; $('stVatPct').value = s.vatPct; $('stPaper').value = s.paper || 'a4';
    var admin = Store.isAdmin(), server = Store.isServer();
    $('stBizCard').style.display = admin ? '' : 'none';
    $('stAccountCard').style.display = server ? '' : 'none';
    $('stUsersCard').style.display = server && admin ? '' : 'none';
    $('stDataCard').style.display = admin ? '' : 'none';
    $('stMode').innerHTML = server
      ? '<span class="chip c-ok">&#9679; ' + esc(t('mode_server')) + '</span> <span class="mini">' + esc(t('mode_server_s')) + '</span>'
      : '<span class="chip c-gold">&#9679; ' + esc(t('mode_demo')) + '</span> <span class="mini">' + esc(t('mode_demo_s')) + '</span>';
    if (server && admin) loadUsers();
  }

  function save() {
    if (busy) return;
    var d = {};
    Object.keys(FIELDS).forEach(function (k) { d[k] = $(FIELDS[k]).value.trim(); });
    d.vatOn = $('stVatOn').checked; d.vatPct = num($('stVatPct').value); d.paper = $('stPaper').value;
    d.prefix = (d.prefix || 'INV').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'INV';
    if (!d.name) { toast(t('err_name'), 'bad'); return; }
    if (d.vatOn && !d.vatNo) { toast(t('err_vat_no'), 'bad'); return; }
    busy = true;
    Store.saveSettings(d).then(function () { toast(t('saved')); App.applyBranding(); NewInvoice.refresh(); fill(); })
      .catch(function (e) { toast(App.errText(e), 'bad'); }).then(function () { busy = false; });
  }

  /* ------------------------------------------------ staff */
  function loadUsers() {
    Store.users().then(function (list) {
      $('usList').innerHTML = list.map(function (u) {
        return '<tr><td><b>' + esc(u.name) + '</b></td><td><span class="ltr">' + esc(u.username) + '</span></td>' +
          '<td><span class="chip ' + (u.role === 'admin' ? 'c-brand' : 'c-mut') + '">' + esc(t('role_' + u.role)) + '</span></td>' +
          '<td><div class="acts"><button class="iconbtn" data-pw="' + u.id + '" title="' + esc(t('reset_password')) + '">&#128273;</button>' +
          (u.id !== Store.s.user.id ? '<button class="iconbtn d" data-del="' + u.id + '" title="' + esc(t('delete')) + '">&#128465;</button>' : '') + '</div></td></tr>';
      }).join('');
    }).catch(function () { /* settings page still usable */ });
  }
  function addUser() {
    var body = { name: $('usName').value.trim(), username: $('usUser').value.trim(), password: $('usPass').value, role: $('usRole').value };
    $('usErr').textContent = '';
    Store.addUser(body).then(function () {
      $('usName').value = $('usUser').value = $('usPass').value = ''; toast(t('saved')); loadUsers();
    }).catch(function (e) { $('usErr').textContent = App.errText(e); });
  }
  function changeMyPassword() {
    $('pwErr').textContent = '';
    if ($('pwNew').value !== $('pwNew2').value) { $('pwErr').textContent = t('err_pw_match'); return; }
    Store.setPassword({ old: $('pwOld').value, password: $('pwNew').value }).then(function () {
      $('pwOld').value = $('pwNew').value = $('pwNew2').value = ''; toast(t('password_changed'));
    }).catch(function (e) { $('pwErr').textContent = App.errText(e); });
  }
  function resetUserPassword(id) {
    var p = prompt(t('prompt_new_password'));
    if (!p) return;
    Store.setPassword({ id: Number(id), password: p }).then(function () { toast(t('password_changed')); })
      .catch(function (e) { toast(App.errText(e), 'bad'); });
  }

  /* ------------------------------------------------ data */
  function backup() {
    download('Ajwa-Shinas_Backup_' + stamp() + '.json', JSON.stringify(Store.exportAll(), null, 2), 'application/json');
    toast(t('backup_saved'));
  }
  function restoreFile(ev) {
    var f = ev.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(String(r.result).replace(/^﻿/, ''));
        if (!Array.isArray(d.invoices)) throw new Error('bad');
        if (!confirm(t('confirm_restore', { n: d.invoices.length }))) return;
        Store.restore(d).then(function () { toast(t('restored')); App.start(); })
          .catch(function (e) { toast(App.errText(e), 'bad'); });
      } catch (e) { toast(t('err_bad_backup'), 'bad'); }
    };
    r.readAsText(f); ev.target.value = '';
  }
  function samples() {
    if (!confirm(t('confirm_samples'))) return;
    Store.loadSamples().then(function () { toast(t('samples_loaded')); App.start(); })
      .catch(function (e) { toast(App.errText(e), 'bad'); });
  }
  function wipe() {
    if (!confirm(t('confirm_wipe'))) return;
    if (!confirm(t('confirm_wipe2'))) return;
    var resetNo = confirm(t('confirm_wipe_counter'));
    Store.wipe(resetNo).then(function () { toast(t('wiped')); App.start(); })
      .catch(function (e) { toast(App.errText(e), 'bad'); });
  }

  function init() {
    $('stSave').addEventListener('click', save);
    $('usAdd').addEventListener('click', addUser);
    $('pwSave').addEventListener('click', changeMyPassword);
    $('usList').addEventListener('click', function (e) {
      var d = e.target.closest('[data-del]'), p = e.target.closest('[data-pw]');
      if (d && confirm(t('confirm_del_user'))) Store.delUser(Number(d.dataset.del)).then(loadUsers).catch(function (x) { toast(App.errText(x), 'bad'); });
      if (p) resetUserPassword(p.dataset.pw);
    });
    $('dbBackup').addEventListener('click', backup);
    $('dbRestore').addEventListener('click', function () { $('dbFile').click(); });
    $('dbFile').addEventListener('change', restoreFile);
    $('dbSamples').addEventListener('click', samples);
    $('dbWipe').addEventListener('click', wipe);
  }
  window.Settings = { init: init, refresh: fill };
})();
