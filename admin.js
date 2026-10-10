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
  setVal('cfgServiceBaseFee', rules.serviceBaseInspectionFee || 15000);
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
  state.pricingRules.serviceBaseInspectionFee = getNum('cfgServiceBaseFee', 15000);
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
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">
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
    } else if (ord.status === 'CHECKING_SITE') {
      statusText = 'Pengecekan Lokasi';
      statusPillClass = 'status-process';
    } else if (ord.status === 'AWAITING_CUSTOMER_APPROVAL') {
      statusText = 'Menunggu Persetujuan';
      statusPillClass = 'status-assigned';
    } else if (ord.status === 'SERVICE_REJECTED') {
      statusText = 'Ditolak (Cek Saja)';
      statusPillClass = 'status-assigned';
    } else if (ord.status === 'IN_PROGRESS') {
      statusText = 'Dalam Pengerjaan';
      statusPillClass = 'status-process';
    } else if (ord.status === 'DONE') {
      statusText = 'Selesai';
      statusPillClass = 'status-done';
    }

    let routeDesc = '';
    if (ord.type === 'SHOPPING') {
      if (ord.stores && ord.stores.length > 1) {
        routeDesc = `<b>Beli (${ord.stores.length} Toko):</b> ${ord.stores.map(s => s.name).join(', ')} &rarr; <b>Antar:</b> ${ord.dropoffAddress}`;
      } else {
        routeDesc = `<b>Beli:</b> ${ord.storeName} &rarr; <b>Antar:</b> ${ord.dropoffAddress}`;
      }
    } else if (ord.type === 'SERVICE') {
      const laborInfo = ord.serviceLaborCost ? ` + Jasa ${formatRp(ord.serviceLaborCost)}` : '';
      routeDesc = `<b>Servis:</b> ${ord.serviceCategory} (Cek ${formatRp(ord.serviceBaseInspectionFee || 15000)}${laborInfo}) di ${ord.taskAddress}`;
    } else {
      if (ord.stops && ord.stops.length > 1) {
        routeDesc = `<b>Jemput:</b> ${ord.pickupAddress} &rarr; <b>Antar (${ord.stops.length} Titik):</b> ${ord.stops.map(st => st.recipientName || st.address).join(', ')}`;
      } else {
        routeDesc = `<b>Jemput:</b> ${ord.pickupAddress} &rarr; <b>Antar:</b> ${ord.dropoffAddress}`;
      }
    }

    return `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 800;">#${ord.id}</td>
        <td>
          <span class="status-pill ${typeClass}" style="font-size: 0.68rem;">${ord.orderTypeLabel || ord.type}</span>
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
        <td>
          <button type="button" class="btn-table-action" style="background: #EEF2FF; color: #3730A3; border-color: #C7D2FE; font-size: 0.7rem; padding: 4px 8px;" onclick="openAdminOrderModal('${ord.id}')">
            Detail
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Modal Detail Transaksi & Audit Platform (Admin)
function openAdminOrderModal(orderId) {
  const s = loadSharedState();
  const ord = (s.orders || []).find(o => o.id === orderId);
  if (!ord) return;

  const modal = document.getElementById('adminOrderDetailModal');
  const titleEl = document.getElementById('adminModalOrderTitle');
  const subEl = document.getElementById('adminModalOrderSub');
  const bodyEl = document.getElementById('adminModalOrderBody');
  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = `Audit Transaksi #${ord.id}`;

  let statusText = 'Menunggu Konfirmasi Mitra';
  if (ord.status === 'GOING_TO_PICKUP') statusText = 'Mitra Menuju Lokasi';
  else if (ord.status === 'CHECKING_SITE') statusText = 'Pemeriksaan Kerusakan di Lokasi';
  else if (ord.status === 'AWAITING_CUSTOMER_APPROVAL') statusText = 'Menunggu Persetujuan Biaya Servis';
  else if (ord.status === 'IN_PROGRESS') statusText = 'Sedang Dikerjakan / Dalam Pengantaran';
  else if (ord.status === 'DONE') statusText = 'Pesanan Selesai';
  else if (ord.status === 'SERVICE_REJECTED' || ord.status === 'CANCELLED') statusText = 'Dibatalkan (Hanya Biaya Cek)';

  if (subEl) subEl.textContent = `${ord.orderTypeLabel || ord.type} • Status: ${statusText}`;

  // 1. Rincian Rute & Identitas Pemesan
  let orderInfoHtml = '';
  if (ord.type === 'SHOPPING') {
    let storesHtml = '';
    if (ord.stores && ord.stores.length > 1) {
      storesHtml = ord.stores.map((st, i) => `
        <div style="margin-bottom: 6px; padding-left: 8px; border-left: 2px solid #CBD5E1;">
          <div style="font-weight: 700; font-size: 0.74rem;">Toko ${i + 1}: ${st.name}</div>
          <div style="font-size: 0.7rem; color: #475569;">Alamat: ${st.address || '-'}${st.detail ? ' (' + st.detail + ')' : ''}</div>
          <div style="font-size: 0.7rem; color: #334155; margin-top: 2px;">Daftar Belanja: <b>${st.items || '-'}</b></div>
        </div>
      `).join('');
    } else {
      storesHtml = `
        <div style="margin-bottom: 6px; padding-left: 8px; border-left: 2px solid #CBD5E1;">
          <div style="font-weight: 700; font-size: 0.74rem;">Toko Pembelian: ${ord.storeName || '-'}</div>
          <div style="font-size: 0.7rem; color: #475569;">Alamat: ${ord.storeAddress || '-'}${ord.storeDetail ? ' (' + ord.storeDetail + ')' : ''}</div>
          <div style="font-size: 0.7rem; color: #334155; margin-top: 2px;">Daftar Belanja: <b>${ord.shoppingList || '-'}</b></div>
        </div>
      `;
    }
    orderInfoHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Rincian Belanja & Pengantaran
        </div>
        ${storesHtml}
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #F1F5F9;">
          <div style="font-size: 0.72rem; color: #475569;"><b>Alamat Antar:</b> ${ord.dropoffAddress || '-'}${ord.dropoffDetail ? ' (' + ord.dropoffDetail + ')' : ''}</div>
          <div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Rute Jarak:</b> ${formatKm(ord.distanceKm)}</div>
          <div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Pelanggan:</b> ${ord.customerName} (${ord.customerPhone || '-'})</div>
          ${ord.customerNotes ? `<div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Catatan:</b> ${ord.customerNotes}</div>` : ''}
        </div>
      </div>
    `;
  } else if (ord.type === 'SERVICE') {
    orderInfoHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Rincian Bantuan Servis
        </div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Kategori:</b> ${ord.serviceCategory || '-'}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Keluhan/Tugas:</b> ${ord.workDescription || '-'}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Lokasi:</b> ${ord.taskAddress || '-'}${ord.taskDetail ? ' (' + ord.taskDetail + ')' : ''}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Pelanggan:</b> ${ord.customerName} (${ord.customerPhone || '-'})</div>
        ${ord.customerNotes ? `<div style="font-size: 0.72rem; color: #475569;"><b>Catatan:</b> ${ord.customerNotes}</div>` : ''}
      </div>
    `;
  } else {
    // DELIVERY
    let stopsHtml = '';
    if (ord.stops && ord.stops.length > 1) {
      stopsHtml = ord.stops.map((st, i) => `
        <div style="margin-bottom: 4px; padding-left: 8px; border-left: 2px solid #CBD5E1; font-size: 0.72rem;">
          <b>Antar Penerima ${i + 1}:</b> ${st.recipientName} (${st.recipientPhone || '-'})<br>
          <span style="color: #475569;">${st.address || '-'}${st.detail ? ' (' + st.detail + ')' : ''}</span>
        </div>
      `).join('');
    } else {
      stopsHtml = `
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;">
          <b>Penerima:</b> ${ord.recipientName || '-'} (${ord.recipientPhone || '-'})<br>
          <b>Alamat Antar:</b> ${ord.dropoffAddress || '-'}${ord.dropoffDetail ? ' (' + ord.dropoffDetail + ')' : ''}
        </div>
      `;
    }
    orderInfoHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Rincian Kurir & Pengantaran Paket
        </div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Kategori:</b> ${ord.deliveryCategory || 'Dokumen'} - ${ord.itemDescription || ''}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 6px;">
          <b>Titik Jemput:</b> ${ord.pickupAddress || '-'}${ord.pickupDetail ? ' (' + ord.pickupDetail + ')' : ''} (Pengirim: ${ord.customerName} - ${ord.customerPhone || '-'})
        </div>
        ${stopsHtml}
        <div style="font-size: 0.72rem; color: #475569; margin-top: 4px; padding-top: 4px; border-top: 1px solid #F1F5F9;">
          <b>Total Jarak:</b> ${formatKm(ord.distanceKm)}
        </div>
        ${ord.customerNotes ? `<div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Catatan:</b> ${ord.customerNotes}</div>` : ''}
      </div>
    `;
  }

  // 2. Info Mitra Bertugas
  let driverAssignedInfo = `
    <div style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; font-size: 0.74rem;">
      <b>Mitra Ditugaskan:</b> ${ord.driverName ? `${ord.driverName} (${ord.driverPhone || '-'})` : '<span style="color: #94A3B8;">Belum Ditugaskan</span>'}
    </div>
  `;

  // 3. Struk Terpadu Audit Finansial (Admin)
  const unifiedReceiptHtml = renderUnifiedBillingReceipt(ord, 'ADMIN');

  bodyEl.innerHTML = `
    ${orderInfoHtml}
    ${driverAssignedInfo}
    ${unifiedReceiptHtml}
  `;

  modal.style.display = 'flex';
}

function closeAdminOrderModal() {
  const modal = document.getElementById('adminOrderDetailModal');
  if (modal) modal.style.display = 'none';
}

// Global scope
window.renderAdminApp = renderAdminApp;
window.toggleDriverAccountStatus = toggleDriverAccountStatus;
window.handleAdminSwitchToggle = handleAdminSwitchToggle;
window.openAdminOrderModal = openAdminOrderModal;
window.closeAdminOrderModal = closeAdminOrderModal;
