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
      extraBanner = `
        <div class="talangan-banner">
          <div>
            <div class="talangan-text">Wajib Bawa Dana Talangan:</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">Dibayarkan tunai saat beli di tempat</div>
          </div>
          <div class="talangan-nominal">${formatRp(order.shoppingEstimate)}</div>
        </div>
        <div style="font-size: 0.74rem; background: #F8FAFC; border: 1px solid var(--border); padding: 8px; border-radius: 6px; margin: 6px 0;">
          <b>Item Belanja:</b> ${order.shoppingList}
        </div>
      `;
      routeInfo = `
        <div class="route-block">
          <div class="route-point">
            <div class="route-pin pickup">1</div>
            <div>
              <div class="route-text-title">Beli di: ${order.storeName}</div>
              <div class="route-text-desc">${order.storeAddress || '-'}</div>
            </div>
          </div>
          <div class="route-point">
            <div class="route-pin dropoff">2</div>
            <div>
              <div class="route-text-title">Antar ke: ${order.customerName}</div>
              <div class="route-text-desc">${order.dropoffAddress} (${formatKm(order.distanceKm)})</div>
            </div>
          </div>
        </div>
      `;
    } else if (order.type === 'SERVICE') {
      extraBanner = `
        <div class="service-banner">
          <div>
            <div class="service-text">Kategori & Durasi Kerja:</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${order.serviceCategory}</div>
          </div>
          <div class="service-nominal">${order.durationHours} Jam Kerja</div>
        </div>
        <div style="font-size: 0.74rem; background: #F8FAFC; border: 1px solid var(--border); padding: 8px; border-radius: 6px; margin: 6px 0;">
          <b>Instruksi:</b> ${order.workDescription}
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
      routeInfo = `
        <div class="route-block">
          <div class="route-point">
            <div class="route-pin pickup">A</div>
            <div>
              <div class="route-text-title">Jemput: ${order.customerName}</div>
              <div class="route-text-desc">${order.pickupAddress}</div>
            </div>
          </div>
          <div class="route-point">
            <div class="route-pin dropoff">B</div>
            <div>
              <div class="route-text-title">Antar: ${order.recipientName || 'Penerima'}</div>
              <div class="route-text-desc">${order.dropoffAddress} (${formatKm(order.distanceKm)})</div>
            </div>
          </div>
        </div>
        <div style="font-size: 0.74rem; background: #F8FAFC; border: 1px solid var(--border); padding: 8px; border-radius: 6px; margin: 6px 0;">
          <b>Kategori:</b> ${order.deliveryCategory} - ${order.itemDescription || ''}
        </div>
      `;
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
    o.driverId === currentDriver.id && (o.status === 'GOING_TO_PICKUP' || o.status === 'IN_PROGRESS')
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
    if (activeTask.status === 'GOING_TO_PICKUP') {
      statusBadgeText = 'Menuju Lokasi Pembelian';
      workflowButton = `
        <button type="button" class="btn-workflow" onclick="advanceTaskStatus('${activeTask.id}', 'IN_PROGRESS')">
          1. Tiba di Lokasi & Beli Barang (${formatRp(activeTask.shoppingEstimate)})
        </button>
      `;
    } else {
      statusBadgeText = 'Barang Dibeli & Sedang Diantar';
      workflowButton = `
        <button type="button" class="btn-workflow" style="background: var(--accent-green);" onclick="advanceTaskStatus('${activeTask.id}', 'DONE')">
          2. Pesanan Tiba & Terima COD Total (${formatRp(activeTask.totalAmount)})
        </button>
      `;
    }
  } else if (activeTask.type === 'SERVICE') {
    if (activeTask.status === 'GOING_TO_PICKUP') {
      statusBadgeText = 'Menuju Lokasi Tugas';
      workflowButton = `
        <button type="button" class="btn-workflow" onclick="advanceTaskStatus('${activeTask.id}', 'IN_PROGRESS')">
          1. Tiba di Lokasi & Mulai Bekerja (${activeTask.durationHours} Jam)
        </button>
      `;
    } else {
      statusBadgeText = 'Sedang Mengerjakan Tugas';
      workflowButton = `
        <button type="button" class="btn-workflow" style="background: var(--accent-green);" onclick="advanceTaskStatus('${activeTask.id}', 'DONE')">
          2. Tugas Selesai & Terima Pembayaran (${formatRp(activeTask.totalAmount)})
        </button>
      `;
    }
  } else {
    // DELIVERY
    if (activeTask.status === 'GOING_TO_PICKUP') {
      statusBadgeText = 'Menuju Titik Penjemputan';
      workflowButton = `
        <button type="button" class="btn-workflow" onclick="advanceTaskStatus('${activeTask.id}', 'IN_PROGRESS')">
          1. Paket Diambil & Antar ke Penerima
        </button>
      `;
    } else {
      statusBadgeText = 'Dalam Perjalanan ke Penerima';
      workflowButton = `
        <button type="button" class="btn-workflow" style="background: var(--accent-green);" onclick="advanceTaskStatus('${activeTask.id}', 'DONE')">
          2. Paket Tiba di Tujuan & Selesaikan Pengantaran (${formatRp(activeTask.totalAmount)})
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

      ${activeTask.type === 'SHOPPING' ? `
        <div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px;">
          <b>Tempat Beli:</b> ${activeTask.storeName} (${activeTask.storeAddress || ''})<br>
          <b>Talangan Belanja:</b> ${formatRp(activeTask.shoppingEstimate)}<br>
          <b>Item:</b> ${activeTask.shoppingList}
        </div>
      ` : ''}

      ${activeTask.type === 'SERVICE' ? `
        <div style="background: #F5F3FF; border: 1px solid #DDD6FE; padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px;">
          <b>Tugas:</b> ${activeTask.serviceCategory} (${activeTask.durationHours} Jam)<br>
          <b>Lokasi:</b> ${activeTask.taskAddress}<br>
          <b>Instruksi:</b> ${activeTask.workDescription}
        </div>
      ` : ''}

      ${activeTask.type === 'DELIVERY' ? `
        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 8px; border-radius: 6px; font-size: 0.72rem; margin-bottom: 8px;">
          <b>Jemput:</b> ${activeTask.pickupAddress}<br>
          <b>Antar:</b> ${activeTask.dropoffAddress} (${formatKm(activeTask.distanceKm)})<br>
          <b>Barang:</b> ${activeTask.deliveryCategory} - ${activeTask.itemDescription}
        </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 700; padding: 8px 0; border-top: 1px solid var(--border);">
        <span>Tagihan Tunai ke Konsumen:</span>
        <span style="font-family: var(--font-mono); color: var(--primary);">${formatRp(activeTask.totalAmount)}</span>
      </div>

      ${workflowButton}
    </div>
  `;
}

function advanceTaskStatus(orderId, nextStatus) {
  const s = loadSharedState();
  const ord = s.orders.find(o => o.id === orderId);
  const drv = (s.drivers || []).find(d => d.id === activeDriverId) || s.drivers[0];

  if (!ord) return;

  ord.status = nextStatus;

  if (nextStatus === 'DONE') {
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

async function fetchDriverDrivingRoute(coordA, coordB) {
  const url = `https://router.project-osrm.org/route/v1/driving/${coordA[1]},${coordA[0]};${coordB[1]},${coordB[0]}?overview=full&geometries=geojson`;

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

  // Fallback realistis perkotaan: Haversine x 1.35x
  const airDist = calculateHaversineKm(coordA[0], coordA[1], coordB[0], coordB[1]);
  const roadDist = Math.max(1, Math.round(airDist * 1.35 * 10) / 10);
  const durMin = Math.max(3, Math.round(roadDist * 2.5));

  return {
    success: false,
    distanceKm: roadDist,
    durationMin: durMin,
    coordinates: [coordA, coordB],
    isRealRoad: false
  };
}

function resolveOrderRouteDetails(order, currentDriver) {
  const driverBasePos = DRIVER_STANDBY_COORDS[currentDriver.id] || [-7.4478, 112.7183];

  if (order.type === 'SHOPPING') {
    const coordA = order.storeCoords || order.pickupCoords || [-7.4439, 112.7058]; // Taman Pinang
    const coordB = order.dropoffCoords || [-7.4485, 112.7160]; // Pahlawan
    return {
      coordA,
      coordB,
      labelA: '1',
      colorA: '#2563EB',
      nameA: `Toko: ${order.storeName || 'Tempat Belanja'}`,
      addrA: order.storeAddress || 'Sidoarjo',
      labelB: '2',
      colorB: '#059669',
      nameB: `Antar: ${order.customerName || 'Pemesan'}`,
      addrB: order.dropoffAddress || 'Sidoarjo',
      summary: `${order.storeName || 'Toko'} &rarr; ${order.customerName || 'Pemesan'}`
    };
  } else if (order.type === 'SERVICE') {
    const coordA = driverBasePos;
    const coordB = order.taskCoords || order.dropoffCoords || [-7.4439, 112.7058];
    return {
      coordA,
      coordB,
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
    const coordA = order.pickupCoords || [-7.4485, 112.7160];
    const coordB = order.dropoffCoords || [-7.4305, 112.7295];
    return {
      coordA,
      coordB,
      labelA: 'A',
      colorA: '#2563EB',
      nameA: `Jemput: ${order.customerName || 'Pengirim'}`,
      addrA: order.pickupAddress || 'Sidoarjo',
      labelB: 'B',
      colorB: '#059669',
      nameB: `Antar: ${order.recipientName || 'Penerima'}`,
      addrB: order.dropoffAddress || 'Sidoarjo',
      summary: `${order.customerName || 'Jemput'} &rarr; ${order.recipientName || 'Antar'}`
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
    o.driverId === currentDriver.id && (o.status === 'GOING_TO_PICKUP' || o.status === 'IN_PROGRESS')
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
    const routeResult = await fetchDriverDrivingRoute(routeInfo.coordA, routeInfo.coordB);

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

// Global scope bindings
window.acceptOffer = acceptOffer;
window.rejectOffer = rejectOffer;
window.previewOfferRoute = previewOfferRoute;
window.advanceTaskStatus = advanceTaskStatus;
window.renderDriverApp = renderDriverApp;
