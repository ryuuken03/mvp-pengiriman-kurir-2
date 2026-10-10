/**
 * Driver & Runner Logic
 * Menangani 3 Pilar Tugas (Minta Dibelikan, Servis & Bantuan, Antar/Kirim)
 * Menghitung otomatis talangan belanja, uang kas COD ditangan, dan pendapatan bersih.
 * Integrasi Leaflet Map, OpenStreetMap tiles, dan Rute Berkendara Nyata (OSRM).
 * Standar AGENTS.md: Bahasa Baku, Bebas Emoji, Operasional Riil.
 */

let activeDriverId = 'drv-01';

// Koordinat Pangkalan / Standby Default Mitra di Sidoarjo
const DRIVER_STANDBY_COORDS = {
  'drv-01': [-7.4478, 112.7183], // Sidoarjo Kota (Alun-Alun)
  'drv-02': [-7.3525, 112.7280], // Waru
  'drv-03': [-7.4305, 112.7295], // Buduran
  'drv-04': [-7.4815, 112.7220]  // Candi
};

// State Peta Leaflet Driver
let driverNavMap = null;
let navMarkerA = null;
let navMarkerStop = null;
let navMarkerB = null;
let navSelfMarker = null;
let navCoverageCircle = null;
let navRouteLine = null;
let previewOfferId = null;

document.addEventListener('DOMContentLoaded', () => {
  initDriverSwitcher();
  initOnlineToggle();
  initDriverNavMap();
  renderDriverApp();

  const ch = getSharedBroadcastChannel();
  if (ch) {
    ch.addEventListener('message', () => {
      renderDriverApp();
    });
  }
  window.addEventListener('storage', () => {
    renderDriverApp();
  });
});

function initDriverSwitcher() {
  const switcher = document.getElementById('driverSwitcher');
  if (switcher) {
    switcher.value = activeDriverId;
    switcher.addEventListener('change', (e) => {
      activeDriverId = e.target.value;
      previewOfferId = null;
      const s = loadSharedState();
      const drv = (s.drivers || []).find(d => d.id === activeDriverId);
      if (drv) s.driver = drv;
      saveSharedState(s, true, 'DRIVER_SWITCHED');
      renderDriverApp();
    });
  }
}

function initOnlineToggle() {
  const toggle = document.getElementById('toggleDriverStatus');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      const s = loadSharedState();
      const drv = (s.drivers || []).find(d => d.id === activeDriverId) || s.drivers[0];
      if (drv) {
        if (drv.accountStatus === 'SUSPENDED') {
          e.preventDefault();
          toggle.checked = false;
          alert('Akun Anda sedang ditangguhkan (SUSPEND) oleh Administrator. Silakan hubungi admin operasional untuk mengaktifkan kembali akun Anda.');
          return;
        }
        drv.isOnline = toggle.checked;
        s.driver = drv;
        saveSharedState(s, true, 'DRIVER_ONLINE_TOGGLED');
        renderDriverApp();
      }
    });
  }
}

function renderDriverApp() {
  const s = loadSharedState();
  const drv = (s.drivers || []).find(d => d.id === activeDriverId) || s.drivers[0] || LOKALKIRIM_V2_INITIAL_DATA.drivers[0];

  // Header info
  const nameEl = document.getElementById('driverNameText');
  const plateEl = document.getElementById('driverPlateText');
  const dutyCard = document.getElementById('dutySwitchCard');
  const toggleInput = document.getElementById('toggleDriverStatus');
  const onlineLabel = document.getElementById('onlineLabel');
  const bannerEl = document.getElementById('driverStatusBanner');

  if (nameEl) nameEl.textContent = drv.name;
  if (plateEl) plateEl.textContent = `${drv.vehicle} • ${drv.plateNumber} • ${drv.area || 'Sidoarjo'}`;

  // Handle status akun (Active vs Suspended) dan status kerja (Online vs Offline)
  if (drv.accountStatus === 'SUSPENDED') {
    drv.isOnline = false;
    if (toggleInput) {
      toggleInput.checked = false;
      toggleInput.disabled = true;
    }
    if (dutyCard) dutyCard.className = 'duty-switch-card is-suspended';
    if (onlineLabel) onlineLabel.textContent = 'Ditangguhkan (Suspend)';
    if (bannerEl) {
      bannerEl.innerHTML = `
        <div class="status-alert-banner suspended">
          <div>
            <strong>Pemberitahuan: Akun Anda Ditangguhkan (Suspend oleh Admin)</strong>
            <div style="font-size: 0.72rem; margin-top: 2px;">Akun Anda dinonaktifkan sementara dari sistem. Hubungi dispatcher/admin untuk bantuan reaktivasi.</div>
          </div>
        </div>
      `;
    }
  } else if (!drv.isOnline) {
    if (toggleInput) {
      toggleInput.checked = false;
      toggleInput.disabled = false;
    }
    if (dutyCard) dutyCard.className = 'duty-switch-card is-offline';
    if (onlineLabel) onlineLabel.textContent = 'Sedang Istirahat (Off)';
    if (bannerEl) {
      bannerEl.innerHTML = `
        <div class="status-alert-banner offduty">
          <div>
            <strong>Status Kerja: Sedang Istirahat (Off)</strong>
            <div style="font-size: 0.72rem; margin-top: 2px;">Anda tidak menerima tawaran tugas saat istirahat. Geser tombol switch di atas jika siap bekerja kembali.</div>
          </div>
        </div>
      `;
    }
  } else {
    if (toggleInput) {
      toggleInput.checked = true;
      toggleInput.disabled = false;
    }
    if (dutyCard) dutyCard.className = 'duty-switch-card is-online';
    if (onlineLabel) onlineLabel.textContent = 'Siap Kerja (On)';
    if (bannerEl) {
      bannerEl.innerHTML = '';
    }
  }

  // Wallet calculations
  const myCompleted = (s.orders || []).filter(o => o.driverId === drv.id && o.status === 'DONE');
  const calculatedEarnings = myCompleted.reduce((sum, o) => sum + (o.driverShare || 0), 0);
  const calculatedCashHeld = myCompleted.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const calculatedPlatformFee = myCompleted.reduce((sum, o) => sum + (o.platformFee || 0), 0);

  drv.earnings = calculatedEarnings;
  drv.cashHeld = calculatedCashHeld;

  const earnEl = document.getElementById('driverEarningsText');
  const cashEl = document.getElementById('driverCashHeldText');
  const feeEl = document.getElementById('platformFeeOwedText');

  if (earnEl) earnEl.textContent = formatRp(calculatedEarnings);
  if (cashEl) cashEl.textContent = formatRp(calculatedCashHeld);
  if (feeEl) feeEl.textContent = formatRp(calculatedPlatformFee);

  renderOffersQueue(s, drv);
  renderActiveTask(s, drv);
  renderCompletedHistory(s, drv);
  updateDriverMap(s, drv);
}

// =========================================================================
// 1. RENDER TAWARAN TUGAS MASUK (OFFERS QUEUE)
// =========================================================================
function renderOffersQueue(state, currentDriver) {
  const container = document.getElementById('offersQueueContainer');
  const badge = document.getElementById('offersCountBadge');
  if (!container) return;

  if (currentDriver.accountStatus === 'SUSPENDED') {
    container.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid #FCA5A5; border-radius: 8px; padding: 22px; text-align: center; color: #991B1B; font-size: 0.8rem;">
        <b>Akun Anda Ditangguhkan oleh Administrator</b><br>
        <span style="font-size: 0.73rem; color: #B91C1C;">Anda tidak diizinkan menerima atau mengambil tugas baru. Hubungi pusat admin operasional.</span>
      </div>
    `;
    if (badge) badge.textContent = 'Ditangguhkan';
    return;
  }

  if (!currentDriver.isOnline) {
    container.innerHTML = `
      <div style="background: var(--bg-card); border: 1px dashed var(--border); border-radius: 8px; padding: 22px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
        Status Anda saat ini sedang <b>Istirahat (Off)</b>.<br>
        <span style="font-size: 0.73rem;">Geser tombol switch di kanan atas untuk mengaktifkan status kerja dan menerima pesanan masuk.</span>
      </div>
    `;
    if (badge) badge.textContent = 'Istirahat (Off)';
    return;
  }

  // Cari tugas dengan status WAITING_DRIVER
  const offers = (state.orders || []).filter(o => o.status === 'WAITING_DRIVER');
  if (badge) badge.textContent = `${offers.length} Tawaran`;

  if (offers.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
        Belum ada tawaran tugas baru di sekitar wilayah tugas Anda.
      </div>
    `;
    return;
  }

  container.innerHTML = offers.map(order => {
    let typeClass = 'shopping';
    let typeTitle = 'Minta Dibelikan';

    if (order.type === 'SERVICE') {
      typeClass = 'service';
      typeTitle = 'Servis & Bantuan';
    } else if (order.type === 'DELIVERY') {
      typeClass = 'delivery';
      typeTitle = 'Antar / Kurir P2P';
    }

    let extraBanner = '';
    let routeInfo = '';

    if (order.type === 'SHOPPING') {
      let storeItemsSummary = '';
      if (order.stores && order.stores.length > 1) {
        storeItemsSummary = order.stores.map((s, idx) => `<div><b>Toko ${idx + 1} (${s.name}):</b> ${s.items || '-'}</div>`).join('');
      } else {
        storeItemsSummary = `<b>Item Belanja:</b> ${order.shoppingList}`;
      }

      extraBanner = `
        <div class="talangan-banner">
          <div>
            <div class="talangan-text">Wajib Bawa Dana Talangan:</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">Dibayarkan tunai saat beli di tempat</div>
          </div>
          <div class="talangan-nominal">${formatRp(order.shoppingEstimate)}</div>
        </div>
        <div style="font-size: 0.74rem; background: #F8FAFC; border: 1px solid var(--border); padding: 8px; border-radius: 6px; margin: 6px 0;">
          ${storeItemsSummary}
        </div>
      `;

      if (order.stores && order.stores.length > 1) {
        routeInfo = `
          <div class="route-block">
            <div class="route-point">
              <div class="route-pin pickup">1</div>
              <div>
                <div class="route-text-title">Beli 1: ${order.stores[0].name}</div>
                <div class="route-text-desc">${order.stores[0].address || '-'}${order.stores[0].detail ? ' • ' + order.stores[0].detail : ''}</div>
              </div>
            </div>
            <div class="route-point">
              <div class="route-pin" style="background: #7C3AED; color: white;">2</div>
              <div>
                <div class="route-text-title">Beli 2: ${order.stores[1].name}</div>
                <div class="route-text-desc">${order.stores[1].address || '-'}${order.stores[1].detail ? ' • ' + order.stores[1].detail : ''}</div>
              </div>
            </div>
            <div class="route-point">
              <div class="route-pin dropoff">B</div>
              <div>
                <div class="route-text-title">Antar ke: ${order.customerName}</div>
                <div class="route-text-desc">${order.dropoffAddress}${order.dropoffDetail ? ' (' + order.dropoffDetail + ')' : ''} (${formatKm(order.distanceKm)})</div>
              </div>
            </div>
          </div>
        `;
      } else {
        routeInfo = `
          <div class="route-block">
            <div class="route-point">
              <div class="route-pin pickup">1</div>
              <div>
                <div class="route-text-title">Beli di: ${order.storeName}</div>
                <div class="route-text-desc">${order.storeAddress || '-'}${order.storeDetail ? ' • ' + order.storeDetail : ''}</div>
              </div>
            </div>
            <div class="route-point">
              <div class="route-pin dropoff">2</div>
              <div>
                <div class="route-text-title">Antar ke: ${order.customerName}</div>
                <div class="route-text-desc">${order.dropoffAddress}${order.dropoffDetail ? ' (' + order.dropoffDetail + ')' : ''} (${formatKm(order.distanceKm)})</div>
              </div>
            </div>
          </div>
        `;
      }
    } else if (order.type === 'SERVICE') {
      extraBanner = `
        <div class="service-banner">
          <div>
            <div class="service-text">Kategori Servis:</div>
            <div style="font-size: 0.72rem; font-weight: 700; color: #1E293B;">${order.serviceCategory}</div>
          </div>
          <div class="service-nominal">Cek Lokasi: ${formatRp(order.serviceBaseInspectionFee || 15000)}</div>
        </div>
        <div style="font-size: 0.74rem; background: #F8FAFC; border: 1px solid var(--border); padding: 8px; border-radius: 6px; margin: 6px 0;">
          <b>Keluhan / Instruksi:</b> ${order.workDescription}
        </div>
        <div style="font-size: 0.7rem; color: #1D4ED8; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 4px 8px; border-radius: 4px; margin-bottom: 6px;">
          Biaya jasa perbaikan/servis riil diajukan di tempat setelah pemeriksaan fisik.
        </div>
      `;
      routeInfo = `
        <div class="route-block">
          <div class="route-point">
            <div class="route-pin pickup">&bull;</div>
            <div>
              <div class="route-text-title">Lokasi Tugas: ${order.taskAddress}</div>
              <div class="route-text-desc">Pemesan: ${order.customerName} (${order.customerPhone})</div>
            </div>
          </div>
        </div>
      `;
    } else {
      // DELIVERY
      if (order.stops && order.stops.length > 1) {
        const stopPoints = order.stops.map((st, idx) => `
          <div class="route-point">
            <div class="route-pin dropoff">${idx + 1}</div>
            <div>
              <div class="route-text-title">Antar ${idx + 1}: ${st.recipientName || 'Penerima'}</div>
              <div class="route-text-desc">${st.address || '-'}${st.detail ? ' • ' + st.detail : ''}</div>
            </div>
          </div>
        `).join('');

        routeInfo = `
          <div class="route-block">
            <div class="route-point">
              <div class="route-pin pickup">A</div>
              <div>
                <div class="route-text-title">Jemput: ${order.customerName}</div>
                <div class="route-text-desc">${order.pickupAddress}${order.pickupDetail ? ' • ' + order.pickupDetail : ''}</div>
              </div>
            </div>
            ${stopPoints}
          </div>
          <div style="font-size: 0.74rem; background: #F8FAFC; border: 1px solid var(--border); padding: 8px; border-radius: 6px; margin: 6px 0;">
            <b>Kategori:</b> ${order.deliveryCategory} - ${order.itemDescription || ''} (Total ${formatKm(order.distanceKm)})
          </div>
        `;
      } else {
        routeInfo = `
          <div class="route-block">
            <div class="route-point">
              <div class="route-pin pickup">A</div>
              <div>
                <div class="route-text-title">Jemput: ${order.customerName}</div>
                <div class="route-text-desc">${order.pickupAddress}${order.pickupDetail ? ' • ' + order.pickupDetail : ''}</div>
              </div>
            </div>
            <div class="route-point">
              <div class="route-pin dropoff">B</div>
              <div>
                <div class="route-text-title">Antar: ${order.recipientName || 'Penerima'}</div>
                <div class="route-text-desc">${order.dropoffAddress}${order.dropoffDetail ? ' • ' + order.dropoffDetail : ''} (${formatKm(order.distanceKm)})</div>
              </div>
            </div>
          </div>
          <div style="font-size: 0.74rem; background: #F8FAFC; border: 1px solid var(--border); padding: 8px; border-radius: 6px; margin: 6px 0;">
            <b>Kategori:</b> ${order.deliveryCategory} - ${order.itemDescription || ''}
          </div>
        `;
      }
    }

    return `
      <div class="offer-box">
        <div class="offer-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="type-pill ${typeClass}">${typeTitle}</span>
            <span style="font-family: var(--font-mono); font-size: 0.78rem; font-weight: 800;">#${order.id}</span>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 0.68rem; color: var(--text-muted);">Pendapatan Bersih:</span>
            <div style="font-size: 0.95rem; font-weight: 800; color: var(--accent-green); font-family: var(--font-mono);">
              ${formatRp(order.driverShare)}
            </div>
          </div>
        </div>

        ${extraBanner}
        ${routeInfo}

        ${order.customerNotes ? `
          <div style="font-size: 0.7rem; color: #64748B; margin-bottom: 8px;">
            <b>Catatan Pemesan:</b> "${order.customerNotes}"
          </div>
        ` : ''}

        <button type="button" class="btn-preview-route" onclick="previewOfferRoute('${order.id}')">Lihat Rute di Peta</button>

        <div class="btn-action-row">
          <button type="button" class="btn-reject" onclick="rejectOffer('${order.id}')">Lewati</button>
          <button type="button" class="btn-accept" onclick="acceptOffer('${order.id}')">Terima Tugas</button>
        </div>
      </div>
    `;
  }).join('');
}

function previewOfferRoute(orderId) {
  previewOfferId = orderId;
  const s = loadSharedState();
  const drv = (s.drivers || []).find(d => d.id === activeDriverId) || s.drivers[0];
  updateDriverMap(s, drv);
  const mapEl = document.getElementById('driverNavMapCanvas');
  if (mapEl) {
    mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function acceptOffer(orderId) {
  const s = loadSharedState();
  const ord = s.orders.find(o => o.id === orderId);
  const drv = (s.drivers || []).find(d => d.id === activeDriverId) || s.drivers[0];

  if (!ord || !drv) return;

  previewOfferId = null;
  ord.status = 'GOING_TO_PICKUP';
  ord.driverId = drv.id;
  ord.driverName = drv.name;
  ord.driverPhone = drv.phone;
  ord.driverVehicle = drv.vehicle;
  ord.driverPlate = drv.plateNumber;
  ord.acceptedAt = new Date().toISOString();

  s.activeOrderId = ord.id;
  saveSharedState(s, true, 'DRIVER_ACCEPTED_TASK');
  renderDriverApp();
}

function rejectOffer(orderId) {
  if (previewOfferId === orderId) {
    previewOfferId = null;
  }
  renderDriverApp();
}

// =========================================================================
// 2. RENDER TUGAS SEDANG BERJALAN (ACTIVE TASK)
// =========================================================================
function renderActiveTask(state, currentDriver) {
  const container = document.getElementById('activeTaskContainer');
  if (!container) return;

  const activeTask = (state.orders || []).find(o =>
    o.driverId === currentDriver.id && ['GOING_TO_PICKUP', 'CHECKING_SITE', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'SERVICE_REJECTED'].includes(o.status)
  );

  if (!activeTask) {
    container.innerHTML = `
      <div style="background: var(--bg-card); border: 1px dashed var(--border); border-radius: 8px; padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
        Tidak ada tugas aktif yang sedang Anda jalankan saat ini.
      </div>
    `;
    return;
  }

  let workflowButton = '';
  let statusBadgeText = '';

  if (activeTask.type === 'SHOPPING') {
    const isMultiStore = activeTask.stores && activeTask.stores.length > 1;
    if (activeTask.status === 'GOING_TO_PICKUP') {
      statusBadgeText = isMultiStore ? 'Menuju Toko Pertama' : 'Menuju Lokasi Pembelian';
      workflowButton = `
        <button type="button" class="btn-workflow" onclick="advanceTaskStatus('${activeTask.id}', 'IN_PROGRESS')">
          1. Tiba di Lokasi & Selesaikan Belanja (${formatRp(activeTask.shoppingEstimate)})
        </button>
      `;
    } else {
      statusBadgeText = 'Barang Siap & Sedang Diantar';
      workflowButton = `
        <button type="button" class="btn-workflow" style="background: var(--accent-green);" onclick="advanceTaskStatus('${activeTask.id}', 'DONE')">
          2. Pesanan Tiba & Terima COD Total (${formatRp(activeTask.totalAmount)})
        </button>
      `;
    }
  } else if (activeTask.type === 'SERVICE') {
    if (activeTask.status === 'GOING_TO_PICKUP') {
      statusBadgeText = 'Menuju Lokasi Pelanggan';
      workflowButton = `
        <button type="button" class="btn-workflow" onclick="advanceTaskStatus('${activeTask.id}', 'CHECKING_SITE')">
          1. Tiba di Lokasi & Mulai Pengecekan
        </button>
      `;
    } else if (activeTask.status === 'CHECKING_SITE') {
      window.activeTaskBaseFee = activeTask.serviceBaseInspectionFee || 15000;
      statusBadgeText = 'Pengecekan Kerusakan di Lokasi';
      workflowButton = `
        <div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 6px; padding: 10px; margin-top: 8px; text-align: left;">
          <div style="font-weight: 800; font-size: 0.76rem; color: #1E293B; margin-bottom: 6px;">
            Rincian Biaya Jasa Servis & Suku Cadang:
          </div>
          <div id="quoteItemsList">
            <div class="quote-item-row" style="display: flex; gap: 6px; margin-bottom: 6px; align-items: center;">
              <input type="text" class="field-input quote-item-name" placeholder="Pekerjaan / Suku Cadang" value="Jasa Perbaikan ${activeTask.serviceCategory}" style="flex: 2; font-size: 0.74rem; padding: 6px 8px;">
              <input type="number" class="field-input quote-item-cost" placeholder="Rp" min="0" step="5000" value="60000" oninput="recalcDriverQuoteTotal()" style="flex: 1; font-size: 0.78rem; font-weight: 700; font-family: var(--font-mono); padding: 6px 8px;">
              <button type="button" onclick="removeDriverQuoteItemRow(this)" style="background: #FEE2E2; color: #DC2626; border: none; border-radius: 4px; padding: 6px 8px; font-size: 0.7rem; font-weight: 700; cursor: pointer;">Hapus</button>
            </div>
          </div>
          <button type="button" onclick="addDriverQuoteItemRow()" style="background: white; border: 1px dashed #94A3B8; color: var(--primary); padding: 6px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; width: 100%; cursor: pointer; margin-bottom: 8px;">
            + Tambah Komponen / Suku Cadang
          </button>
          <div style="background: #F1F5F9; border-radius: 4px; padding: 6px 8px; font-size: 0.72rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="color: #475569;">Subtotal Jasa & Part:</span>
            <span id="quoteTotalPreview" style="font-weight: 800; font-family: var(--font-mono); color: #1E293B;">Rp 60.000</span>
          </div>
          <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 4px; padding: 6px 8px; font-size: 0.72rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="color: #1E40AF;">Total Tagihan COD (+ Cek ${formatRp(activeTask.serviceBaseInspectionFee || 15000)}):</span>
            <span id="quoteGrandTotalPreview" style="font-weight: 800; font-family: var(--font-mono); color: #1D4ED8;">${formatRp(60000 + (activeTask.serviceBaseInspectionFee || 15000))}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-workflow" style="flex: 1;" onclick="submitServiceLaborQuote('${activeTask.id}')">
              2. Ajukan Rincian ke Pelanggan
            </button>
          </div>
          <div style="text-align: center; margin-top: 6px;">
            <button type="button" style="background: transparent; border: none; color: #64748B; font-size: 0.68rem; cursor: pointer; text-decoration: underline;" onclick="advanceTaskStatus('${activeTask.id}', 'DONE')">
              Hanya Biaya Cek ${formatRp(activeTask.serviceBaseInspectionFee || 15000)} (Selesaikan Tanpa Servis)
            </button>
          </div>
        </div>
      `;
    } else if (activeTask.status === 'AWAITING_CUSTOMER_APPROVAL') {
      statusBadgeText = 'Menunggu Persetujuan Pelanggan';
      let itemsSummaryHtml = '';
      if (activeTask.serviceQuoteItems && activeTask.serviceQuoteItems.length > 0) {
        itemsSummaryHtml = `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 4px; padding: 6px; margin: 6px 0; font-size: 0.72rem;">
            <b>Rincian Penawaran Diajukan:</b>
            ${activeTask.serviceQuoteItems.map(it => `
              <div style="display: flex; justify-content: space-between; color: #78350F; padding: 2px 0;">
                <span>&bull; ${it.name}</span>
                <span style="font-weight: 700; font-family: var(--font-mono);">${formatRp(it.cost)}</span>
              </div>
            `).join('')}
            <div style="display: flex; justify-content: space-between; border-top: 1px dashed #FDE68A; margin-top: 4px; padding-top: 4px; font-weight: 800;">
              <span>Subtotal Jasa & Part:</span>
              <span style="font-family: var(--font-mono);">${formatRp(activeTask.serviceLaborCost)}</span>
            </div>
          </div>
        `;
      } else {
        itemsSummaryHtml = `
          <div style="color: #78350F; margin-bottom: 8px; line-height: 1.35;">
            Tawaran Diajukan: <b>${activeTask.serviceQuoteNote || '-'}</b> (${formatRp(activeTask.serviceLaborCost)})
          </div>
        `;
      }

      workflowButton = `
        <div style="background: #FEF3C7; border: 1px solid #FDE68A; border-radius: 6px; padding: 10px; margin-top: 8px; font-size: 0.74rem; text-align: left;">
          <div style="font-weight: 800; color: #92400E; margin-bottom: 2px;">Menunggu Konfirmasi Pelanggan...</div>
          ${itemsSummaryHtml}
          <div style="font-weight: 700; margin-bottom: 8px; color: #92400E;">
            Total Tagihan COD: <span style="font-family: var(--font-mono); font-size: 0.85rem;">${formatRp(activeTask.totalAmount)}</span>
          </div>
          <button type="button" class="btn-workflow" style="background: #059669;" onclick="advanceTaskStatus('${activeTask.id}', 'IN_PROGRESS')">
            Pelanggan Sudah Setuju Lisan (Lanjutkan Pengerjaan)
          </button>
        </div>
      `;
    } else if (activeTask.status === 'SERVICE_REJECTED') {
      statusBadgeText = 'Penawaran Ditolak Pelanggan';
      workflowButton = `
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 10px; margin-top: 8px; font-size: 0.74rem; text-align: left;">
          <div style="font-weight: 800; color: #991B1B; margin-bottom: 2px;">Pelanggan Membatalkan Servis</div>
          <div style="color: #7F1D1D; margin-bottom: 8px; line-height: 1.35;">
            Pelanggan tidak menyetujui nominal estimasi jasa servis. Anda berhak menerima <b>Biaya Pengecekan Dasar ${formatRp(activeTask.serviceBaseInspectionFee || 15000)}</b> secara tunai (COD).
          </div>
          <button type="button" class="btn-workflow" style="background: var(--primary);" onclick="advanceTaskStatus('${activeTask.id}', 'DONE')">
            Terima Biaya Cek ${formatRp(activeTask.serviceBaseInspectionFee || 15000)} & Selesaikan Tugas
          </button>
        </div>
      `;
    } else {
      statusBadgeText = 'Pengerjaan Servis Sedang Berlangsung';
      workflowButton = `
        <button type="button" class="btn-workflow" style="background: var(--accent-green);" onclick="advanceTaskStatus('${activeTask.id}', 'DONE')">
          3. Pekerjaan Selesai & Terima Pembayaran COD (${formatRp(activeTask.totalAmount)})
        </button>
      `;
    }
  } else {
    // DELIVERY
    const isMultiStop = activeTask.stops && activeTask.stops.length > 1;
    if (activeTask.status === 'GOING_TO_PICKUP') {
      statusBadgeText = 'Menuju Titik Penjemputan';
      workflowButton = `
        <button type="button" class="btn-workflow" onclick="advanceTaskStatus('${activeTask.id}', 'IN_PROGRESS')">
          1. Paket Diambil & Antar ke Penerima
        </button>
      `;
    } else {
      statusBadgeText = isMultiStop ? 'Mengantar ke Seluruh Titik Tujuan' : 'Dalam Perjalanan ke Penerima';
      workflowButton = `
        <button type="button" class="btn-workflow" style="background: var(--accent-green);" onclick="advanceTaskStatus('${activeTask.id}', 'DONE')">
          2. Seluruh Paket Tiba & Selesaikan Pengantaran (${formatRp(activeTask.totalAmount)})
        </button>
      `;
    }
  }

  container.innerHTML = `
    <div class="active-task-box">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 0.72rem; font-weight: 800; background: #DBEAFE; color: #1E40AF; padding: 2px 8px; border-radius: 4px;">
          ${statusBadgeText}
        </span>
        <span style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 800;">#${activeTask.id}</span>
      </div>

      <div style="font-size: 0.82rem; font-weight: 700; margin-bottom: 4px;">
        ${activeTask.orderTypeLabel}
      </div>

      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 8px;">
        Pemesan: <b>${activeTask.customerName}</b> (${activeTask.customerPhone})
      </div>

      ${activeTask.type === 'SHOPPING' ? (
        activeTask.stores && activeTask.stores.length > 1 ? `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px;">
            <b>Rute Belanja (${activeTask.stores.length} Toko):</b><br>
            ${activeTask.stores.map((st, i) => `&bull; <b>Toko ${i + 1} (${st.name}):</b> ${st.address || '-'}${st.detail ? ' (' + st.detail + ')' : ''} &mdash; <i>${st.items || '-'}</i><br>`).join('')}
            <b>Antar ke:</b> ${activeTask.dropoffAddress}${activeTask.dropoffDetail ? ' (' + activeTask.dropoffDetail + ')' : ''}<br>
            <b>Talangan Belanja:</b> ${formatRp(activeTask.shoppingEstimate)}
          </div>
        ` : `
          <div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px;">
            <b>Tempat Beli:</b> ${activeTask.storeName} (${activeTask.storeAddress || ''}${activeTask.storeDetail ? ' • ' + activeTask.storeDetail : ''})<br>
            <b>Talangan Belanja:</b> ${formatRp(activeTask.shoppingEstimate)}<br>
            <b>Item:</b> ${activeTask.shoppingList}
          </div>
        `
      ) : ''}

      ${activeTask.type === 'SERVICE' ? `
        <div style="background: #F5F3FF; border: 1px solid #DDD6FE; padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px;">
          <b>Tugas:</b> ${activeTask.serviceCategory}<br>
          <b>Lokasi:</b> ${activeTask.taskAddress}${activeTask.taskDetail ? ' (' + activeTask.taskDetail + ')' : ''}<br>
          <b>Keluhan:</b> ${activeTask.workDescription}<br>
          <b>Biaya Cek Lokasi:</b> ${formatRp(activeTask.serviceBaseInspectionFee || 15000)}
          ${activeTask.serviceQuoteItems && activeTask.serviceQuoteItems.length > 0 ? `
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #DDD6FE;">
              <b>Rincian Penawaran (${activeTask.serviceQuoteItems.length} Item):</b>
              ${activeTask.serviceQuoteItems.map(it => `
                <div style="display: flex; justify-content: space-between; color: #5B21B6; padding: 1px 0;">
                  <span>&bull; ${it.name}</span>
                  <span style="font-weight: 700; font-family: var(--font-mono);">${formatRp(it.cost)}</span>
                </div>
              `).join('')}
              <div style="display: flex; justify-content: space-between; font-weight: 700; margin-top: 2px;">
                <span>Subtotal Jasa & Part:</span>
                <span style="font-family: var(--font-mono);">${formatRp(activeTask.serviceLaborCost)}</span>
              </div>
            </div>
          ` : (activeTask.serviceLaborCost ? `<br><b>Jasa Servis Disetujui:</b> ${formatRp(activeTask.serviceLaborCost)} (${activeTask.serviceQuoteNote || '-'})` : '')}
        </div>
      ` : ''}

      ${activeTask.type === 'DELIVERY' ? (
        activeTask.stops && activeTask.stops.length > 1 ? `
          <div style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px;">
            <b>Jemput:</b> ${activeTask.pickupAddress}${activeTask.pickupDetail ? ' (' + activeTask.pickupDetail + ')' : ''}<br>
            <b>Daftar Tujuan (${activeTask.stops.length} Titik):</b><br>
            ${activeTask.stops.map((st, i) => `&bull; <b>Tujuan ${i + 1} (${st.recipientName || 'Penerima'}):</b> ${st.address || '-'}${st.detail ? ' (' + st.detail + ')' : ''}<br>`).join('')}
            <b>Barang:</b> ${activeTask.deliveryCategory} - ${activeTask.itemDescription} (${formatKm(activeTask.distanceKm)})
          </div>
        ` : `
          <div style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px;">
            <b>Jemput:</b> ${activeTask.pickupAddress}${activeTask.pickupDetail ? ' (' + activeTask.pickupDetail + ')' : ''}<br>
            <b>Antar:</b> ${activeTask.dropoffAddress}${activeTask.dropoffDetail ? ' (' + activeTask.dropoffDetail + ')' : ''} (${formatKm(activeTask.distanceKm)})<br>
            <b>Barang:</b> ${activeTask.deliveryCategory} - ${activeTask.itemDescription}
          </div>
        `
      ) : ''}

      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 700; padding: 8px 0; border-top: 1px solid var(--border);">
        <span>Tagihan Tunai ke Konsumen:</span>
        <span style="font-family: var(--font-mono); color: var(--primary);">${formatRp(activeTask.totalAmount)}</span>
      </div>

      <button type="button" class="btn-view-detail" style="margin-bottom: 6px;" onclick="openDriverOrderModal('${activeTask.id}')">
        Lihat Detail Transaksi & Rincian Struk
      </button>

      ${workflowButton}
    </div>
  `;
}

function advanceTaskStatus(orderId, nextStatus) {
  const s = loadSharedState();
  const ord = s.orders.find(o => o.id === orderId);
  const drv = (s.drivers || []).find(d => d.id === activeDriverId) || s.drivers[0];

  if (!ord) return;

  const prevStatus = ord.status;
  ord.status = nextStatus;

  if (nextStatus === 'IN_PROGRESS' && ord.quoteStatus === 'QUOTED') {
    ord.quoteStatus = 'APPROVED';
  }

  if (nextStatus === 'DONE') {
    if (ord.type === 'SERVICE' && (prevStatus === 'CHECKING_SITE' || prevStatus === 'SERVICE_REJECTED')) {
      ord.serviceLaborCost = 0;
      ord.totalAmount = ord.serviceBaseInspectionFee || 15000;
      const calc = calculateServiceFee(ord.serviceBaseInspectionFee || 15000, 0);
      ord.platformFee = calc.platformFee;
      ord.driverShare = calc.driverNetEarnings;
    }
    previewOfferId = null;
    ord.completedAt = new Date().toISOString();
    // Update uang kas dan komisi
    drv.cashHeld = (drv.cashHeld || 0) + (ord.totalAmount || 0);
    drv.earnings = (drv.earnings || 0) + (ord.driverShare || 0);
    s.driver = drv;
  }

  saveSharedState(s, true, 'TASK_STATUS_UPDATED');
  renderDriverApp();
}

function addDriverQuoteItemRow(defaultName = '', defaultCost = '') {
  const container = document.getElementById('quoteItemsList');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'quote-item-row';
  row.style.cssText = 'display: flex; gap: 6px; margin-bottom: 6px; align-items: center;';
  row.innerHTML = `
    <input type="text" class="field-input quote-item-name" placeholder="Pekerjaan / Suku Cadang" value="${defaultName}" style="flex: 2; font-size: 0.74rem; padding: 6px 8px;">
    <input type="number" class="field-input quote-item-cost" placeholder="Rp" min="0" step="5000" value="${defaultCost}" oninput="recalcDriverQuoteTotal()" style="flex: 1; font-size: 0.78rem; font-weight: 700; font-family: var(--font-mono); padding: 6px 8px;">
    <button type="button" onclick="removeDriverQuoteItemRow(this)" style="background: #FEE2E2; color: #DC2626; border: none; border-radius: 4px; padding: 6px 8px; font-size: 0.7rem; font-weight: 700; cursor: pointer;">Hapus</button>
  `;
  container.appendChild(row);
  recalcDriverQuoteTotal();
}

function removeDriverQuoteItemRow(btn) {
  const container = document.getElementById('quoteItemsList');
  if (!container) return;
  const rows = container.querySelectorAll('.quote-item-row');
  if (rows.length <= 1) {
    alert('Minimal harus ada 1 rincian pekerjaan atau suku cadang.');
    return;
  }
  btn.closest('.quote-item-row')?.remove();
  recalcDriverQuoteTotal();
}

function recalcDriverQuoteTotal() {
  const costs = document.querySelectorAll('.quote-item-cost');
  let sum = 0;
  costs.forEach(inp => {
    const val = parseInt(inp.value, 10);
    if (!isNaN(val) && val > 0) sum += val;
  });

  const totalEl = document.getElementById('quoteTotalPreview');
  const grandEl = document.getElementById('quoteGrandTotalPreview');
  const baseFee = window.activeTaskBaseFee || 15000;

  if (totalEl) totalEl.textContent = formatRp(sum);
  if (grandEl) grandEl.textContent = formatRp(sum + baseFee);
}

function submitServiceLaborQuote(orderId) {
  const s = loadSharedState();
  const ord = (s.orders || []).find(o => o.id === orderId);
  if (!ord) return;

  const rows = document.querySelectorAll('.quote-item-row');
  const items = [];
  let totalCost = 0;

  rows.forEach(r => {
    const name = r.querySelector('.quote-item-name')?.value.trim();
    const cost = parseInt(r.querySelector('.quote-item-cost')?.value, 10);
    if (name && !isNaN(cost) && cost > 0) {
      items.push({ name, cost });
      totalCost += cost;
    }
  });

  if (items.length === 0) {
    alert('Masukkan minimal 1 rincian pekerjaan atau suku cadang beserta nominal biayanya.');
    return;
  }

  const baseInspectionFee = ord.serviceBaseInspectionFee || 15000;
  const calc = calculateServiceFee(baseInspectionFee, totalCost);

  ord.serviceQuoteItems = items;
  ord.serviceLaborCost = totalCost;
  ord.serviceQuoteNote = items.map(it => `${it.name} (${formatRp(it.cost)})`).join(', ');
  ord.totalAmount = calc.totalCustomerPay;
  ord.platformFee = calc.platformFee;
  ord.driverShare = calc.driverNetEarnings;
  ord.status = 'AWAITING_CUSTOMER_APPROVAL';
  ord.quoteStatus = 'QUOTED';

  saveSharedState(s, true, 'SERVICE_QUOTE_SUBMITTED');
  alert(`Penawaran ${items.length} item servis sebesar ${formatRp(totalCost)} (Total COD ${formatRp(ord.totalAmount)}) berhasil diajukan ke aplikasi pelanggan.`);
  renderDriverApp();
}

// =========================================================================
// 3. RENDER RIWAYAT TUGAS SELESAI (COMPLETED HISTORY)
// =========================================================================
function renderCompletedHistory(state, currentDriver) {
  const container = document.getElementById('completedHistoryContainer');
  if (!container) return;

  const history = (state.orders || []).filter(o => o.driverId === currentDriver.id && o.status === 'DONE');

  if (history.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 14px; text-align: center; color: var(--text-muted); font-size: 0.78rem;">
        Belum ada riwayat tugas yang diselesaikan hari ini.
      </div>
    `;
    return;
  }

  container.innerHTML = history.map(ord => `
    <div class="history-card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="font-family: var(--font-mono); font-weight: 800;">#${ord.id} - ${ord.orderTypeLabel}</span>
        <span style="font-size: 0.72rem; color: var(--accent-green); font-weight: 800; font-family: var(--font-mono);">
          +${formatRp(ord.driverShare)}
        </span>
      </div>
      <div style="font-size: 0.72rem; color: var(--text-muted);">
        Konsumen: ${ord.customerName} &bull; Total COD Diterima: ${formatRp(ord.totalAmount)}
      </div>
      <button type="button" class="btn-view-detail" style="margin-top: 6px; padding: 6px 10px; min-height: 34px; font-size: 0.72rem;" onclick="openDriverOrderModal('${ord.id}')">
        Lihat Detail Struk & Bagi Hasil
      </button>
    </div>
  `).join('');
}

// =========================================================================
// 4. INTEGRASI LEAFLET MAP & RUTE BERKENDARA NYATA (OSRM)
// =========================================================================
function createDriverMapPin(label, colorBg) {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="background: ${colorBg}; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); border: 2px solid #ffffff;">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchDriverDrivingRoute(coordsList) {
  let points = [];
  if (Array.isArray(coordsList) && Array.isArray(coordsList[0])) {
    points = coordsList;
  } else {
    points = Array.from(arguments).filter(p => Array.isArray(p) && p.length === 2);
  }

  if (points.length < 2) {
    return {
      success: false,
      distanceKm: 1,
      durationMin: 5,
      coordinates: points,
      isRealRoad: false
    };
  }

  const coordStr = points.map(pt => `${pt[1]},${pt[0]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && data.routes && data.routes[0]) {
        const route = data.routes[0];
        const distKm = Math.round((route.distance / 1000) * 10) / 10;
        const durMin = Math.max(2, Math.round(route.duration / 60));
        const latLngs = route.geometry.coordinates.map(pt => [pt[1], pt[0]]);

        return {
          success: true,
          distanceKm: Math.max(1, distKm),
          durationMin: durMin,
          coordinates: latLngs,
          isRealRoad: true
        };
      }
    }
  } catch (e) {
    console.warn('Gagal menghubungi OSRM online (driver):', e);
  }

  // Fallback realistis perkotaan: hitung akumulasi segmen jalan Haversine x 1.35x
  let totalAirDist = 0;
  for (let i = 0; i < points.length - 1; i++) {
    totalAirDist += calculateHaversineKm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  }
  const roadDist = Math.max(1, Math.round(totalAirDist * 1.35 * 10) / 10);
  const durMin = Math.max(3, Math.round(roadDist * 2.5));

  return {
    success: false,
    distanceKm: roadDist,
    durationMin: durMin,
    coordinates: points,
    isRealRoad: false
  };
}

function resolveOrderRouteDetails(order, currentDriver) {
  const driverBasePos = DRIVER_STANDBY_COORDS[currentDriver.id] || [-7.4478, 112.7183];

  if (order.type === 'SHOPPING') {
    const isMultiStore = order.stores && order.stores.length > 1;
    const coordA = (isMultiStore ? order.stores[0].coords : order.storeCoords) || order.pickupCoords || [-7.4439, 112.7058];
    const coordB = order.dropoffCoords || [-7.4485, 112.7160];
    const coordStop = isMultiStore ? order.stores[1].coords : null;
    const allCoords = coordStop ? [coordA, coordStop, coordB] : [coordA, coordB];

    return {
      coordA,
      coordB,
      coordStop,
      allCoords,
      labelA: '1',
      colorA: '#2563EB',
      nameA: `Toko 1: ${isMultiStore ? order.stores[0].name : (order.storeName || 'Tempat Belanja')}`,
      addrA: (isMultiStore ? order.stores[0].address : order.storeAddress) || 'Sidoarjo',
      labelStop: '2',
      colorStop: '#7C3AED',
      nameStop: isMultiStore ? `Toko 2: ${order.stores[1].name}` : '',
      addrStop: isMultiStore ? (order.stores[1].address || 'Sidoarjo') : '',
      labelB: isMultiStore ? '3' : '2',
      colorB: '#059669',
      nameB: `Antar: ${order.customerName || 'Pemesan'}`,
      addrB: order.dropoffAddress || 'Sidoarjo',
      summary: isMultiStore
        ? `${order.stores[0].name} &rarr; ${order.stores[1].name} &rarr; ${order.customerName || 'Pemesan'}`
        : `${order.storeName || 'Toko'} &rarr; ${order.customerName || 'Pemesan'}`
    };
  } else if (order.type === 'SERVICE') {
    const coordA = driverBasePos;
    const coordB = order.taskCoords || order.dropoffCoords || [-7.4439, 112.7058];
    return {
      coordA,
      coordB,
      coordStop: null,
      allCoords: [coordA, coordB],
      labelA: 'P',
      colorA: '#0284C7',
      nameA: `Pos Mitra: ${currentDriver.name}`,
      addrA: currentDriver.area || 'Pangkalan Mitra',
      labelB: 'S',
      colorB: '#7C3AED',
      nameB: `Lokasi Tugas: ${order.customerName || 'Pemesan'}`,
      addrB: order.taskAddress || 'Sidoarjo',
      summary: `Pos Mitra &rarr; ${order.customerName || 'Lokasi Tugas'}`
    };
  } else {
    // DELIVERY
    const isMultiStop = order.stops && order.stops.length > 1;
    const coordA = order.pickupCoords || [-7.4485, 112.7160];
    const coordStop = isMultiStop ? order.stops[0].coords : null;
    const coordB = isMultiStop ? order.stops[1].coords : (order.dropoffCoords || [-7.4305, 112.7295]);
    const allCoords = coordStop ? [coordA, coordStop, coordB] : [coordA, coordB];

    return {
      coordA,
      coordB,
      coordStop,
      allCoords,
      labelA: 'A',
      colorA: '#2563EB',
      nameA: `Jemput: ${order.customerName || 'Pengirim'}`,
      addrA: order.pickupAddress || 'Sidoarjo',
      labelStop: '1',
      colorStop: '#7C3AED',
      nameStop: isMultiStop ? `Antar 1: ${order.stops[0].recipientName || 'Penerima 1'}` : '',
      addrStop: isMultiStop ? (order.stops[0].address || 'Sidoarjo') : '',
      labelB: isMultiStop ? '2' : 'B',
      colorB: '#059669',
      nameB: isMultiStop ? `Antar 2: ${order.stops[1].recipientName || 'Penerima 2'}` : `Antar: ${order.recipientName || 'Penerima'}`,
      addrB: isMultiStop ? (order.stops[1].address || 'Sidoarjo') : (order.dropoffAddress || 'Sidoarjo'),
      summary: isMultiStop
        ? `${order.customerName || 'Jemput'} &rarr; ${order.stops[0].recipientName || 'Antar 1'} &rarr; ${order.stops[1].recipientName || 'Antar 2'}`
        : `${order.customerName || 'Jemput'} &rarr; ${order.recipientName || 'Antar'}`
    };
  }
}

function initDriverNavMap() {
  const container = document.getElementById('driverNavMapCanvas');
  if (!container || typeof L === 'undefined' || driverNavMap) return;

  const defaultCenter = DRIVER_STANDBY_COORDS[activeDriverId] || [-7.4478, 112.7183];

  driverNavMap = L.map('driverNavMapCanvas', {
    center: defaultCenter,
    zoom: 13,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(driverNavMap);
}

async function updateDriverMap(state, currentDriver) {
  if (typeof L === 'undefined') return;
  if (!driverNavMap) {
    initDriverNavMap();
  }
  if (!driverNavMap) return;

  setTimeout(() => {
    if (driverNavMap) driverNavMap.invalidateSize();
  }, 100);

  const activeTask = (state.orders || []).find(o =>
    o.driverId === currentDriver.id && ['GOING_TO_PICKUP', 'CHECKING_SITE', 'AWAITING_CUSTOMER_APPROVAL', 'IN_PROGRESS', 'SERVICE_REJECTED'].includes(o.status)
  );

  let targetOrder = activeTask;
  let isPreview = false;

  if (!targetOrder && previewOfferId) {
    targetOrder = (state.orders || []).find(o => o.id === previewOfferId && o.status === 'WAITING_DRIVER');
    if (targetOrder) isPreview = true;
  }

  // Jika belum ada pilihan rute, namun ada tawaran order yang menunggu kurir:
  if (!targetOrder && currentDriver.isOnline && currentDriver.accountStatus !== 'SUSPENDED') {
    const firstOffer = (state.orders || []).find(o => o.status === 'WAITING_DRIVER');
    if (firstOffer) {
      targetOrder = firstOffer;
      isPreview = true;
    }
  }

  const badgeEl = document.getElementById('driverMapStatusBadge');
  const titleEl = document.getElementById('driverMapRouteTitle');
  const roadBadge = document.getElementById('driverMapRoadBadge');
  const distEl = document.getElementById('driverRouteDist');
  const durEl = document.getElementById('driverRouteDur');
  const summaryEl = document.getElementById('driverRouteSummary');

  if (targetOrder) {
    // Bersihkan standby self marker & circle jika ada
    if (navSelfMarker) { driverNavMap.removeLayer(navSelfMarker); navSelfMarker = null; }
    if (navCoverageCircle) { driverNavMap.removeLayer(navCoverageCircle); navCoverageCircle = null; }

    const routeInfo = resolveOrderRouteDetails(targetOrder, currentDriver);

    if (badgeEl) {
      badgeEl.textContent = isPreview ? `Pratinjau #${targetOrder.id}` : `Tugas Aktif #${targetOrder.id}`;
      badgeEl.style.background = isPreview ? '#FEF3C7' : '#DCFCE7';
      badgeEl.style.color = isPreview ? '#92400E' : '#166534';
    }
    if (titleEl) {
      titleEl.textContent = isPreview
        ? `Pratinjau Rute: #${targetOrder.id} - ${targetOrder.orderTypeLabel}`
        : `Navigasi Tugas: #${targetOrder.id} - ${targetOrder.orderTypeLabel}`;
    }
    if (roadBadge) {
      roadBadge.textContent = 'Menghitung Rute Nyata...';
    }

    // Set Marker A
    if (!navMarkerA) {
      navMarkerA = L.marker(routeInfo.coordA, {
        icon: createDriverMapPin(routeInfo.labelA, routeInfo.colorA)
      }).addTo(driverNavMap);
    } else {
      navMarkerA.setLatLng(routeInfo.coordA);
      navMarkerA.setIcon(createDriverMapPin(routeInfo.labelA, routeInfo.colorA));
    }
    navMarkerA.bindPopup(`<b>${routeInfo.nameA}</b><br><span style="font-size:11px;">${routeInfo.addrA}</span>`);

    // Set Marker Stop jika ada titik singgah
    if (routeInfo.coordStop) {
      if (!navMarkerStop) {
        navMarkerStop = L.marker(routeInfo.coordStop, {
          icon: createDriverMapPin(routeInfo.labelStop, routeInfo.colorStop)
        }).addTo(driverNavMap);
      } else {
        navMarkerStop.setLatLng(routeInfo.coordStop);
        navMarkerStop.setIcon(createDriverMapPin(routeInfo.labelStop, routeInfo.colorStop));
      }
      navMarkerStop.bindPopup(`<b>${routeInfo.nameStop}</b><br><span style="font-size:11px;">${routeInfo.addrStop}</span>`);
    } else if (navMarkerStop) {
      driverNavMap.removeLayer(navMarkerStop);
      navMarkerStop = null;
    }

    // Set Marker B
    if (!navMarkerB) {
      navMarkerB = L.marker(routeInfo.coordB, {
        icon: createDriverMapPin(routeInfo.labelB, routeInfo.colorB)
      }).addTo(driverNavMap);
    } else {
      navMarkerB.setLatLng(routeInfo.coordB);
      navMarkerB.setIcon(createDriverMapPin(routeInfo.labelB, routeInfo.colorB));
    }
    navMarkerB.bindPopup(`<b>${routeInfo.nameB}</b><br><span style="font-size:11px;">${routeInfo.addrB}</span>`);

    // Ambil rute OSRM
    const routeResult = await fetchDriverDrivingRoute(routeInfo.allCoords || [routeInfo.coordA, routeInfo.coordB]);

    if (navRouteLine) {
      driverNavMap.removeLayer(navRouteLine);
    }

    navRouteLine = L.polyline(routeResult.coordinates, {
      color: isPreview ? '#D97706' : '#2563EB',
      weight: 5,
      opacity: 0.88,
      lineJoin: 'round'
    }).addTo(driverNavMap);

    driverNavMap.fitBounds(navRouteLine.getBounds(), { padding: [35, 35] });

    if (distEl) distEl.textContent = formatKm(routeResult.distanceKm);
    if (durEl) durEl.textContent = `~${routeResult.durationMin} Menit`;
    if (summaryEl) summaryEl.innerHTML = routeInfo.summary;
    if (roadBadge) {
      roadBadge.textContent = routeResult.isRealRoad ? 'Rute Jalan Raya Nyata' : 'Estimasi Jalur Jalan';
    }
  } else {
    // Standby Mode: Tampilkan posisi pangkalan kurir di Sidoarjo
    if (navMarkerA) { driverNavMap.removeLayer(navMarkerA); navMarkerA = null; }
    if (navMarkerStop) { driverNavMap.removeLayer(navMarkerStop); navMarkerStop = null; }
    if (navMarkerB) { driverNavMap.removeLayer(navMarkerB); navMarkerB = null; }
    if (navRouteLine) { driverNavMap.removeLayer(navRouteLine); navRouteLine = null; }

    const standbyPos = DRIVER_STANDBY_COORDS[currentDriver.id] || [-7.4478, 112.7183];

    if (!navSelfMarker) {
      navSelfMarker = L.marker(standbyPos, {
        icon: createDriverMapPin('M', '#059669')
      }).addTo(driverNavMap);
    } else {
      navSelfMarker.setLatLng(standbyPos);
    }
    navSelfMarker.bindPopup(`<b>Pangkalan Mitra: ${currentDriver.name}</b><br><span style="font-size:11px;">${currentDriver.vehicle} • ${currentDriver.plateNumber}</span>`);

    if (!navCoverageCircle) {
      navCoverageCircle = L.circle(standbyPos, {
        radius: 2500,
        color: '#10B981',
        fillColor: '#A7F3D0',
        fillOpacity: 0.2,
        weight: 1.5,
        dashArray: '4, 4'
      }).addTo(driverNavMap);
    } else {
      navCoverageCircle.setLatLng(standbyPos);
    }

    driverNavMap.setView(standbyPos, 13);

    if (badgeEl) {
      badgeEl.textContent = currentDriver.isOnline ? 'Siaga Patroli' : 'Istirahat (Off)';
      badgeEl.style.background = currentDriver.isOnline ? '#DCFCE7' : '#F1F5F9';
      badgeEl.style.color = currentDriver.isOnline ? '#166534' : '#64748B';
    }
    if (titleEl) {
      titleEl.textContent = `Pangkalan Standby: ${currentDriver.name} (${currentDriver.area || 'Sidoarjo'})`;
    }
    if (roadBadge) {
      roadBadge.textContent = currentDriver.isOnline ? 'Siap Terima Order' : 'Off / Tidak Terima Order';
    }
    if (distEl) distEl.textContent = 'Pangkalan';
    if (durEl) durEl.textContent = 'Radius 2,5 km';
    if (summaryEl) summaryEl.textContent = `${currentDriver.vehicle} • ${currentDriver.plateNumber}`;
  }
}

// Modal Detail Transaksi & Struk Bagi Hasil Mitra (Driver)
function openDriverOrderModal(orderId) {
  const s = loadSharedState();
  const ord = (s.orders || []).find(o => o.id === orderId);
  if (!ord) return;

  const modal = document.getElementById('driverOrderDetailModal');
  const titleEl = document.getElementById('driverModalOrderTitle');
  const subEl = document.getElementById('driverModalOrderSub');
  const bodyEl = document.getElementById('driverModalOrderBody');
  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = `Detail Transaksi Tugas #${ord.id}`;

  let statusText = 'Menunggu Konfirmasi Mitra';
  if (ord.status === 'GOING_TO_PICKUP') statusText = 'Mitra Menuju Lokasi';
  else if (ord.status === 'CHECKING_SITE') statusText = 'Pemeriksaan Kerusakan di Lokasi';
  else if (ord.status === 'AWAITING_CUSTOMER_APPROVAL') statusText = 'Menunggu Persetujuan Biaya Servis';
  else if (ord.status === 'IN_PROGRESS') statusText = 'Sedang Dikerjakan / Dalam Pengantaran';
  else if (ord.status === 'DONE') statusText = 'Pesanan Selesai';
  else if (ord.status === 'SERVICE_REJECTED' || ord.status === 'CANCELLED') statusText = 'Dibatalkan (Hanya Biaya Cek)';

  if (subEl) subEl.textContent = `${ord.orderTypeLabel || ord.type} • Status: ${statusText}`;

  // 1. Rincian Informasi Rute & Spesifik Layanan
  let taskRouteHtml = '';
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
    taskRouteHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Lokasi Pembelian & Pengantaran
        </div>
        ${storesHtml}
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #F1F5F9;">
          <div style="font-size: 0.72rem; color: #475569;"><b>Alamat Antar:</b> ${ord.dropoffAddress || '-'}${ord.dropoffDetail ? ' (' + ord.dropoffDetail + ')' : ''}</div>
          <div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Rute Perjalanan:</b> ${formatKm(ord.distanceKm)}</div>
          <div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Pemesan:</b> ${ord.customerName} (${ord.customerPhone || '-'})</div>
          ${ord.customerNotes ? `<div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Catatan:</b> ${ord.customerNotes}</div>` : ''}
        </div>
      </div>
    `;
  } else if (ord.type === 'SERVICE') {
    taskRouteHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Lokasi Pelaksanaan Servis & Bantuan
        </div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Kategori:</b> ${ord.serviceCategory || '-'}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Keluhan/Kerusakan:</b> ${ord.workDescription || '-'}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Lokasi:</b> ${ord.taskAddress || '-'}${ord.taskDetail ? ' (' + ord.taskDetail + ')' : ''}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Pemesan:</b> ${ord.customerName} (${ord.customerPhone || '-'})</div>
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
    taskRouteHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Rute Pengantaran Paket
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

  // 2. Unified Billing Receipt untuk Driver (Mencakup rincian item, COD, komisi platform 15%, hak driver)
  const unifiedReceiptHtml = renderUnifiedBillingReceipt(ord, 'DRIVER');

  bodyEl.innerHTML = `
    ${taskRouteHtml}
    ${unifiedReceiptHtml}
  `;

  modal.style.display = 'flex';
}

function closeDriverOrderModal() {
  const modal = document.getElementById('driverOrderDetailModal');
  if (modal) modal.style.display = 'none';
}

// Global scope bindings
window.acceptOffer = acceptOffer;
window.rejectOffer = rejectOffer;
window.previewOfferRoute = previewOfferRoute;
window.advanceTaskStatus = advanceTaskStatus;
window.submitServiceLaborQuote = submitServiceLaborQuote;
window.addDriverQuoteItemRow = addDriverQuoteItemRow;
window.removeDriverQuoteItemRow = removeDriverQuoteItemRow;
window.recalcDriverQuoteTotal = recalcDriverQuoteTotal;
window.renderDriverApp = renderDriverApp;
window.openDriverOrderModal = openDriverOrderModal;
window.closeDriverOrderModal = closeDriverOrderModal;


