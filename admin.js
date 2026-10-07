/**
 * Admin Console & Dispatcher Logic
 * Monitoring real-time 3 pilar layanan, pricing engine dinamis, dan buku kas armada.
 * Standar AGENTS.md: Bahasa Baku, Tanpa Emoji, Format Baku.
 */

document.addEventListener('DOMContentLoaded', () => {
  initPricingEngineForm();
  renderAdminApp();

  const ch = getSharedBroadcastChannel();
  if (ch) {
    ch.addEventListener('message', () => {
      renderAdminApp();
    });
  }
  window.addEventListener('storage', () => {
    renderAdminApp();
  });
});

function initPricingEngineForm() {
  const form = document.getElementById('formPricingEngine');
  if (!form) return;

  loadPricingToForm();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    savePricingFromForm();
  });
}

function loadPricingToForm() {
  const state = loadSharedState();
  const rules = state.pricingRules || LOKALKIRIM_V2_INITIAL_DATA.pricingRules;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('cfgDeliveryBase', rules.deliveryBaseFare || 8000);
  setVal('cfgDeliveryPerKm', rules.deliveryPerKm || 2500);
  setVal('cfgShopService', rules.shoppingServiceFee || 5000);
  setVal('cfgShopPerKm', rules.shoppingPerKm || 2500);
  setVal('cfgServiceHourly', rules.serviceHourlyRate || 17500);
  setVal('cfgPlatformFeePercent', rules.platformFeePercent || 15);
}

function savePricingFromForm() {
  const state = loadSharedState();
  if (!state.pricingRules) state.pricingRules = {};

  const getNum = (id, def) => {
    const el = document.getElementById(id);
    return el ? parseFloat(el.value) || def : def;
  };

  state.pricingRules.deliveryBaseFare = getNum('cfgDeliveryBase', 8000);
  state.pricingRules.deliveryPerKm = getNum('cfgDeliveryPerKm', 2500);
  state.pricingRules.shoppingServiceFee = getNum('cfgShopService', 5000);
  state.pricingRules.shoppingPerKm = getNum('cfgShopPerKm', 2500);
  state.pricingRules.serviceHourlyRate = getNum('cfgServiceHourly', 17500);
  state.pricingRules.platformFeePercent = getNum('cfgPlatformFeePercent', 15);

  saveSharedState(state, true, 'PRICING_UPDATED');
  alert('Konfigurasi Pricing Engine berhasil diperbarui dan disinkronkan ke seluruh aplikasi!');
  renderAdminApp();
}

function renderAdminApp() {
  const state = loadSharedState();
  const orders = state.orders || [];
  const drivers = state.drivers || [];

  // 1. Stats Metrics
  const totalGmv = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const shoppingOrders = orders.filter(o => o.type === 'SHOPPING');
  const serviceOrders = orders.filter(o => o.type === 'SERVICE');
  const deliveryOrders = orders.filter(o => o.type === 'DELIVERY');

  const gmvEl = document.getElementById('totalGmvText');
  const shopEl = document.getElementById('countShoppingOrders');
  const srvEl = document.getElementById('countServiceOrders');
  const delEl = document.getElementById('countDeliveryOrders');

  if (gmvEl) gmvEl.textContent = formatRp(totalGmv);
  if (shopEl) shopEl.textContent = `${shoppingOrders.length} Pesanan`;
  if (srvEl) srvEl.textContent = `${serviceOrders.length} Pesanan`;
  if (delEl) delEl.textContent = `${deliveryOrders.length} Pesanan`;

  // 2. Armada Fleet Table
  renderFleetTable(drivers, orders);

  // 3. Transactions Table
  renderTransactionsTable(orders);
}

function renderFleetTable(drivers, orders) {
  const tbody = document.getElementById('driverFleetTableBody');
  const counter = document.getElementById('activeFleetCounter');
  if (!tbody) return;

  const activeDrivers = drivers.filter(d => d.isOnline && d.accountStatus !== 'SUSPENDED');
  if (counter) counter.textContent = `${activeDrivers.length} dari ${drivers.length} Siaga`;

  tbody.innerHTML = drivers.map(d => {
    const myOrders = orders.filter(o => o.driverId === d.id && o.status === 'DONE');
    const earnings = myOrders.reduce((sum, o) => sum + (o.driverShare || 0), 0);
    const cash = myOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const isSuspended = d.accountStatus === 'SUSPENDED';

    // 1 Kolom Gabungan Status Akun & Status Kerja
    const accountTag = isSuspended
      ? '<span class="status-tag-account suspended">Ditangguhkan</span>'
      : '<span class="status-tag-account active">Akun Aktif</span>';

    let dutyTag = '';
    if (isSuspended) {
      dutyTag = '<span class="status-tag-duty suspended">Kerja: Nonaktif</span>';
    } else if (d.isOnline) {
      dutyTag = '<span class="status-tag-duty on">Kerja: Siaga (On)</span>';
    } else {
      dutyTag = '<span class="status-tag-duty off">Kerja: Istirahat (Off)</span>';
    }

    const statusCombinedHtml = `
      <div class="status-combo-box">
        <div>${accountTag}</div>
        <div>${dutyTag}</div>
      </div>
    `;

    // Komponen Switch Aktif / Suspend
    const switchActionHtml = `
      <div class="admin-switch-wrap">
        <label class="admin-switch-toggle" for="switch-drv-${d.id}" title="${isSuspended ? 'Klik untuk mengaktifkan akun mitra' : 'Klik untuk menangguhkan (suspend) akun mitra'}">
          <input type="checkbox" id="switch-drv-${d.id}" ${isSuspended ? '' : 'checked'} onchange="handleAdminSwitchToggle('${d.id}', this.checked)">
          <span class="admin-switch-slider"></span>
        </label>
        <span class="admin-switch-label ${isSuspended ? 'is-suspended' : 'is-active'}">
          ${isSuspended ? 'Suspend' : 'Aktif'}
        </span>
      </div>
    `;

    // <td style="font-family: var(--font-mono); font-weight: 700;">${d.id}</td>s
    return `
      <tr>
        <td>
          <b>${d.name}</b><br>
          <span style="font-size: 0.7rem; color: var(--text-muted);">${d.vehicle} (${d.plateNumber})</span>
        </td>
        <td>${d.area || 'Sidoarjo'}</td>
        <td>${statusCombinedHtml}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-green);">${formatRp(earnings)}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--accent-amber);">${formatRp(cash)}</td>
        <td>${switchActionHtml}</td>
      </tr>
    `;
  }).join('');
}

function handleAdminSwitchToggle(driverId, isChecked) {
  const newStatus = isChecked ? 'ACTIVE' : 'SUSPENDED';
  toggleDriverAccountStatus(driverId, newStatus);
}

function toggleDriverAccountStatus(driverId, newStatus) {
  const s = loadSharedState();
  const drv = (s.drivers || []).find(d => d.id === driverId);
  if (!drv) return;

  drv.accountStatus = newStatus;
  if (newStatus === 'SUSPENDED') {
    drv.isOnline = false; // Langsung matikan status online
  }
  if (s.driver && s.driver.id === drv.id) {
    s.driver = drv;
  }

  saveSharedState(s, true, 'DRIVER_STATUS_UPDATED');
  renderAdminApp();
}

function renderTransactionsTable(orders) {
  const tbody = document.getElementById('allOrdersTableBody');
  const badge = document.getElementById('totalTransactionsBadge');
  if (!tbody) return;

  if (badge) badge.textContent = `${orders.length} Transaksi`;

  if (orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
          Belum ada transaksi di dalam sistem.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(ord => {
    let typeClass = 'status-assigned';
    if (ord.type === 'SHOPPING') typeClass = 'status-process';
    if (ord.type === 'SERVICE') typeClass = 'status-assigned';

    let statusText = 'Menunggu Mitra';
    let statusPillClass = 'status-assigned';

    if (ord.status === 'GOING_TO_PICKUP') {
      statusText = 'Mitra Menuju Lokasi';
      statusPillClass = 'status-process';
    } else if (ord.status === 'IN_PROGRESS') {
      statusText = 'Dalam Pengerjaan';
      statusPillClass = 'status-process';
    } else if (ord.status === 'DONE') {
      statusText = 'Selesai';
      statusPillClass = 'status-done';
    }

    let routeDesc = '';
    if (ord.type === 'SHOPPING') {
      routeDesc = `<b>Beli:</b> ${ord.storeName} &rarr; <b>Antar:</b> ${ord.dropoffAddress}`;
    } else if (ord.type === 'SERVICE') {
      routeDesc = `<b>Tugas:</b> ${ord.serviceCategory} (${ord.durationHours} Jam) di ${ord.taskAddress}`;
    } else {
      routeDesc = `<b>Jemput:</b> ${ord.pickupAddress} &rarr; <b>Antar:</b> ${ord.dropoffAddress}`;
    }

    return `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 800;">#${ord.id}</td>
        <td>
          <span class="status-pill ${typeClass}" style="font-size: 0.68rem;">${ord.orderTypeLabel}</span>
        </td>
        <td style="font-size: 0.72rem; line-height: 1.3;">
          ${routeDesc}
        </td>
        <td style="font-size: 0.72rem;">
          ${ord.driverName ? `<b>${ord.driverName}</b>` : '<span style="color: var(--text-muted);">-</span>'}
        </td>
        <td style="font-family: var(--font-mono); font-weight: 800; color: var(--text-main);">
          ${formatRp(ord.totalAmount)}
        </td>
        <td>
          <span class="status-pill ${statusPillClass}">${statusText}</span>
        </td>
      </tr>
    `;
  }).join('');
}

// Global scope
window.renderAdminApp = renderAdminApp;
window.toggleDriverAccountStatus = toggleDriverAccountStatus;
window.handleAdminSwitchToggle = handleAdminSwitchToggle;
