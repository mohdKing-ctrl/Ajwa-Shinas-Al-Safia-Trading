/* catalog.js - categories, units, starter price list and the demo data.
   Prices below are EXAMPLES. The owner edits them on the Services page, and
   can still change any price on each invoice because every customer differs. */
(function () {
  'use strict';

  var CATS = [
    { id: 'commission',  en: 'Office Commission',    ar: 'عمولة المكتب',                 ic: '💼', ob: false },
    { id: 'customs',     en: 'Customs Fees',         ar: 'رسوم جمركية',                  ic: '🏛️', ob: true  },
    { id: 'food',        en: 'Food Control',         ar: 'رقابة الأغذية',                ic: '🥫', ob: true  },
    { id: 'logistics',   en: 'Logistics',            ar: 'الخدمات اللوجستية',            ic: '🚚', ob: false },
    { id: 'weighbridge', en: 'Weighbridge Services', ar: 'خدمات الميزان في اللوجستية',   ic: '⚖️', ob: false },
    { id: 'permits',     en: 'Permit Services',      ar: 'خدمات التصاريح',               ic: '📜', ob: true  },
    { id: 'other',       en: 'Other Services',       ar: 'خدمات أخرى',                   ic: '🧾', ob: false }
  ];

  var UNITS = [
    { id: 'service',     en: 'service',     ar: 'خدمة' },
    { id: 'declaration', en: 'declaration', ar: 'بيان' },
    { id: 'container',   en: 'container',   ar: 'حاوية' },
    { id: 'truck',       en: 'truck',       ar: 'شاحنة' },
    { id: 'trip',        en: 'trip',        ar: 'رحلة' },
    { id: 'ton',         en: 'ton',         ar: 'طن' },
    { id: 'day',         en: 'day',         ar: 'يوم' },
    { id: 'permit',      en: 'permit',      ar: 'تصريح' },
    { id: 'document',    en: 'document',    ar: 'مستند' }
  ];

  /* The owner's own sections and units live in the settings (customCats / customUnits).
     setCustom() rebuilds the two shared lists in place, so every screen that reads
     Catalog.CATS / Catalog.UNITS / Catalog.cat() / Catalog.unit() sees them automatically. */
  var BASE_CATS = CATS.length, BASE_UNITS = UNITS.length;
  function setCustom(settings) {
    CATS.length = BASE_CATS; UNITS.length = BASE_UNITS;
    ((settings && settings.customCats) || []).forEach(function (x) {
      if (x && x.id) CATS.push({ id: x.id, en: x.en || x.ar, ar: x.ar || x.en, ic: x.ic || '\uD83D\uDDC2\uFE0F', ob: !!x.ob, custom: true });
    });
    ((settings && settings.customUnits) || []).forEach(function (x) {
      if (x && x.id) UNITS.push({ id: x.id, en: x.en || x.ar, ar: x.ar || x.en, custom: true });
    });
  }

  var DIRECTIONS = [
    { id: 'import',  en: 'Import',  ar: 'استيراد' },
    { id: 'export',  en: 'Export',  ar: 'تصدير' },
    { id: 'transit', en: 'Transit', ar: 'ترانزيت' },
    { id: 'local',   en: 'Local',   ar: 'محلي' }
  ];

  var PORTS = [
    { en: 'Shinas Border', ar: 'منفذ شناص الحدودي' },
    { en: 'Khatmat Malaha Border', ar: 'منفذ خطمة ملاحة' },
    { en: 'Sohar Port', ar: 'ميناء صحار' },
    { en: 'Sohar Free Zone', ar: 'المنطقة الحرة بصحار' },
    { en: 'Sultan Qaboos Port', ar: 'ميناء السلطان قابوس' },
    { en: 'Salalah Port', ar: 'ميناء صلالة' },
    { en: 'Duqm Port', ar: 'ميناء الدقم' },
    { en: 'Muscat Airport', ar: 'مطار مسقط' }
  ];

  function defaultSettings() {
    return {
      name: 'Ajwa Shinas Al Safia Trading', nameAr: 'أجواء شناص الصافية للتجارة',
      addr: 'Shinas, North Al Batinah Governorate, Sultanate of Oman',
      addrAr: 'ولاية شناص، محافظة شمال الباطنة، سلطنة عمان',
      phone: '92372038', email: 'alshamsedx500@gmail.com',
      cr: '1105021', vatNo: '', vatOn: false, vatPct: 5,
      prefix: 'INV', paper: 'a4',
      lang: 'ar', theme: 'light',
      footer: 'Thank you for your business  |  شكراً لتعاملكم معنا',
      customCats: [], customUnits: [],
      terms: 'Government fees paid on behalf of the customer are charged at actual cost and are not subject to VAT.',
      bank: ''
    };
  }

  /* [category, English, Arabic, example price (0 = decided on each invoice), unit] */
  var SERVICE_ROWS = [
    ['commission', 'Clearance commission - per declaration', 'عمولة تخليص - لكل بيان جمركي', 15, 'declaration'],
    ['commission', 'Clearance commission - per container',   'عمولة تخليص - لكل حاوية',      25, 'container'],
    ['commission', 'Transit file follow-up',                 'متابعة معاملة ترانزيت',        10, 'service'],
    ['commission', 'Document preparation & typing',          'تجهيز وطباعة المستندات',        3, 'document'],
    ['commission', 'Office commission (agreed amount)',      'عمولة المكتب (مبلغ متفق عليه)',  0, 'service'],

    ['customs', 'Customs duty (as per declaration)',         'الرسوم الجمركية (حسب البيان)',   0, 'declaration'],
    ['customs', 'Customs declaration fee',                   'رسوم البيان الجمركي',            2, 'declaration'],
    ['customs', 'Customs inspection fee',                    'رسوم الكشف الجمركي',             5, 'service'],
    ['customs', 'Customs guarantee / deposit',               'ضمان / تأمين جمركي',             0, 'service'],
    ['customs', 'Transit customs fee',                       'رسوم الترانزيت الجمركي',         3, 'truck'],

    ['food', 'Food inspection fee',                          'رسوم فحص الأغذية',                8, 'service'],
    ['food', 'Laboratory test',                              'فحص مخبري',                      15, 'service'],
    ['food', 'Food clearance certificate',                   'شهادة إفراج غذائي',               5, 'document'],
    ['food', 'Food control permit',                          'تصريح رقابة الأغذية',             0, 'permit'],

    ['logistics', 'Truck transport - per trip',              'نقل بالشاحنة - لكل رحلة',        0, 'trip'],
    ['logistics', 'Loading / unloading',                     'تحميل وتنزيل',                   20, 'truck'],
    ['logistics', 'Container handling',                      'مناولة حاويات',                  18, 'container'],
    ['logistics', 'Storage',                                 'تخزين',                           5, 'day'],
    ['logistics', 'Border escort / follow-up',               'مرافقة ومتابعة على الحدود',      10, 'truck'],

    ['weighbridge', 'Weighbridge - truck weighing',          'وزن شاحنة على الميزان',           2, 'truck'],
    ['weighbridge', 'Weighbridge - per ton',                 'وزن بالطن',                     0.5, 'ton'],
    ['weighbridge', 'Weight certificate',                    'شهادة وزن',                       1, 'document'],
    ['weighbridge', 'Re-weighing',                           'إعادة وزن',                       2, 'truck'],

    ['permits', 'Import permit',                             'تصريح استيراد',                   0, 'permit'],
    ['permits', 'Export permit',                             'تصريح تصدير',                     0, 'permit'],
    ['permits', 'Vehicle entry permit',                      'تصريح دخول مركبة',                3, 'permit'],
    ['permits', 'Municipality permit',                       'تصريح البلدية',                   5, 'permit'],
    ['permits', 'Agriculture permit',                        'تصريح الزراعة',                   0, 'permit'],

    ['other', 'Translation',                                 'ترجمة',                           5, 'document'],
    ['other', 'Document attestation',                        'تصديق مستندات',                   3, 'document'],
    ['other', 'Courier / delivery of documents',             'توصيل مستندات',                   2, 'service'],
    ['other', 'Other service',                               'خدمة أخرى',                       0, 'service']
  ];

  function defaultServices() {
    var catOb = {};
    CATS.forEach(function (c) { catOb[c.id] = c.ob; });
    return SERVICE_ROWS.map(function (r, i) {
      return { id: 's' + (i + 1), cat: r[0], n: r[1], a: r[2], price: r[3], unit: r[4], ob: catOb[r[0]] };
    });
  }

  /* ---------------- demo data (fictional companies) ---------------- */
  function sampleCustomers() {
    return [
      { id: 'c1', name: 'Al Bahja Trading LLC',        phone: '9100 0101', vatNo: 'OM1100012345', addr: 'Sohar, North Al Batinah', company: true,  notes: '' },
      { id: 'c2', name: 'Gulf Fresh Foods',            phone: '9100 0202', vatNo: 'OM1100023456', addr: 'Shinas Industrial Area',  company: true,  notes: 'Chilled goods - priority' },
      { id: 'c3', name: 'Al Noor Building Materials',  phone: '9100 0303', vatNo: 'OM1100034567', addr: 'Liwa, North Al Batinah',  company: true,  notes: '' },
      { id: 'c4', name: 'Sohar Auto Spare Parts',      phone: '9100 0404', vatNo: '',             addr: 'Sohar',                   company: true,  notes: '' },
      { id: 'c5', name: 'Salim Al Hinai',              phone: '9100 0505', vatNo: '',             addr: 'Shinas',                  company: false, notes: 'Individual' }
    ];
  }

  /* A simple repeatable pseudo-random generator, so the demo is always the same. */
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

  var TEMPLATES = [
    { cust: 'c2', dir: 'import', goods: 'Frozen chicken - 1 container', port: 'Shinas Border', veh: 'CNT: MSKU 482910-3',
      lines: [['s1', 15, 1], ['s6', 142.5, 1], ['s11', 8, 1], ['s12', 15, 1], ['s16', 20, 1], ['s20', 2, 1]] },
    { cust: 'c1', dir: 'import', goods: 'Ceramic tiles - 24 tons', port: 'Shinas Border', veh: 'Truck: 4521 Q (UAE)',
      lines: [['s1', 15, 1], ['s6', 96, 1], ['s20', 2, 1], ['s21', 0.5, 24], ['s22', 1, 1], ['s16', 20, 1]] },
    { cust: 'c3', dir: 'import', goods: 'Steel bars - 2 trucks', port: 'Khatmat Malaha Border', veh: 'Trucks: 7731 A, 7732 A',
      lines: [['s1', 15, 2], ['s6', 210, 1], ['s20', 2, 2], ['s21', 0.5, 48], ['s15', 120, 2], ['s31', 2, 1]] },
    { cust: 'c4', dir: 'import', goods: 'Used auto spare parts', port: 'Shinas Border', veh: 'Truck: 9004 K (UAE)',
      lines: [['s1', 15, 1], ['s6', 64.25, 1], ['s8', 5, 1], ['s4', 3, 1]] },
    { cust: 'c2', dir: 'import', goods: 'Dairy products - 1 truck', port: 'Shinas Border', veh: 'Truck: 1188 B (UAE)',
      lines: [['s1', 15, 1], ['s6', 78, 1], ['s11', 8, 1], ['s13', 5, 1], ['s20', 2, 1], ['s22', 1, 1]] },
    { cust: 'c5', dir: 'export', goods: 'Used vehicle to UAE', port: 'Shinas Border', veh: 'Toyota Land Cruiser',
      lines: [['s1', 15, 1], ['s26', 3, 1], ['s4', 3, 1]] },
    { cust: 'c1', dir: 'transit', goods: 'Electrical cables - transit to Saudi', port: 'Khatmat Malaha Border', veh: 'Truck: 6620 D',
      lines: [['s3', 10, 1], ['s10', 3, 1], ['s9', 100, 1], ['s19', 10, 1], ['s20', 2, 1]] },
    { cust: 'c3', dir: 'import', goods: 'Cement - 30 tons', port: 'Shinas Border', veh: 'Truck: 3310 Q',
      lines: [['s1', 15, 1], ['s6', 88, 1], ['s20', 2, 1], ['s21', 0.5, 30], ['s16', 20, 1], ['s18', 5, 3]] }
  ];

  /* Builds ~16 invoices over the last 12 days: some paid, some part-paid, some unpaid. */
  function sampleInvoices(services, customers, settings, startNo) {
    var rand = rng(20260101), out = [], now = new Date();
    var byId = {}; services.forEach(function (s) { byId[s.id] = s; });
    var cById = {}; customers.forEach(function (c) { cById[c.id] = c; });
    var n = startNo || 1;
    var vatOn = !!settings.vatOn, vatPct = settings.vatPct || 5;
    var pays = ['cash', 'transfer', 'card', 'cheque'];

    for (var day = 12; day >= 0; day--) {
      var count = day === 0 ? 3 : (rand() < 0.4 ? 1 : 2);
      for (var k = 0; k < count; k++) {
        var tpl = TEMPLATES[Math.floor(rand() * TEMPLATES.length)];
        var items = tpl.lines.map(function (l) {
          var s = byId[l[0]]; if (!s) return null;
          return { sid: s.id, cat: s.cat, n: s.n, a: s.a, unit: s.unit, ob: !!s.ob, price: l[1], q: l[2] };
        }).filter(Boolean);
        var d = addDays(-day, now);
        var disc = rand() < 0.15 ? 5 : 0;
        var t = Calc.totals(items, disc, vatOn, vatPct);
        var c = cById[tpl.cust];
        var r = rand(), paid;
        if (day > 6 || r < 0.5) paid = t.total;           // most are settled
        else if (r < 0.75) paid = r3(t.total * 0.5);      // part payment
        else paid = 0;                                    // on credit
        var method = pays[Math.floor(rand() * pays.length)];
        var no = n++;
        var hh = 8 + Math.floor(rand() * 9), mm = Math.floor(rand() * 60);
        var dateStr = ymd(d);
        var job = day > 5 ? 'done' : (day > 2 ? 'cleared' : 'progress');
        out.push({
          id: String(no), no: no, number: (settings.prefix || 'INV') + '-' + String(no).padStart(5, '0'),
          date: dateStr, time: (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm,
          customerId: c.id, customerName: c.name, customerPhone: c.phone,
          customerVat: c.company ? c.vatNo : '', customerAddr: c.company ? c.addr : '', company: !!c.company,
          direction: tpl.dir, declNo: '2' + String(1000000 + Math.floor(rand() * 8999999)),
          ref: 'BL-' + String(40000 + Math.floor(rand() * 59999)), vehicle: tpl.veh, goods: tpl.goods, port: tpl.port,
          items: items, discount: t.disc, vatPct: t.vatPct, vat: t.vat, office: t.office, behalf: t.behalf, total: t.total,
          payments: paid > 0 ? [{ date: dateStr, amount: paid, method: method }] : [],
          job: job, note: '', void: false, created: Math.floor(d.getTime() / 1000), createdBy: 'Demo'
        });
      }
    }
    return out;
  }

  window.Catalog = {
    CATS: CATS, UNITS: UNITS, DIRECTIONS: DIRECTIONS, PORTS: PORTS,
    defaultSettings: defaultSettings, defaultServices: defaultServices,
    sampleCustomers: sampleCustomers, sampleInvoices: sampleInvoices,
    setCustom: setCustom,
    cat: function (id) { return CATS.filter(function (c) { return c.id === id; })[0] || CATS.filter(function (c) { return c.id === 'other'; })[0]; },
    unit: function (id) { return UNITS.filter(function (u) { return u.id === id; })[0] || UNITS[0]; },
    dir: function (id) { return DIRECTIONS.filter(function (d) { return d.id === id; })[0] || DIRECTIONS[0]; }
  };
})();
