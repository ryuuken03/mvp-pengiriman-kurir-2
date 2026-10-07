/**
 * MTM Sidoarjo Customer App Logic
 * Integrasi Leaflet Map & OpenStreetMap dengan Real Driving Routing (OSRM)
 * Menentukan jarak berkendara jalan raya nyata bukan garis lurus.
 * Standar AGENTS.md: Bebas Emoji, Bahasa Baku, Sinkronisasi Real-time.
 */

// Koordinat Referensi Wilayah Sidoarjo
const SIDOARJO_COORDS = {
  alun_alun: [-7.4478, 112.7183],
  pahlawan: [-7.4485, 112.7160],
  taman_pinang: [-7.4439, 112.7058],
  pasar_larangan: [-7.4602, 112.7145],
  puri_indah: [-7.4580, 112.6980],
  buduran: [-7.4305, 112.7295],
  waru: [-7.3525, 112.7280],
  candi: [-7.4815, 112.7220]
};

// Map State Instances
let shopMap = null;
let shopMarkerA = null;
let shopMarkerB = null;
let shopRouteLine = null;
let currentShopDistanceKm = 2.6;

let serviceMap = null;
let serviceMarker = null;
let currentServiceCoord = SIDOARJO_COORDS.taman_pinang;

let delMap = null;
let delMarkerA = null;
let delMarkerB = null;
let delRouteLine = null;
let currentDelDistanceKm = 4.5;

document.addEventListener('DOMContentLoaded', () => {
  initTabSwitchers();
  initShoppingPillar();
  initServicePillar();
  initDeliveryPillar();

  // Inisialisasi Peta Leaflet untuk 3 Pilar
  initShoppingMap();
  initServiceMap();
  initDeliveryMap();

  renderRadarFleet();
  renderCustomerOrders();

  // Listen to broadcast changes
  const ch = getSharedBroadcastChannel();
  if (ch) {
    ch.addEventListener('message', () => {
      renderRadarFleet();
      renderCustomerOrders();
    });
  }

  window.addEventListener('storage', () => {
    renderRadarFleet();
    renderCustomerOrders();
  });
});

// =========================================================================
// 1. TAB SWITCHER DENGAN INVALIDATE SIZE LEAFLET
// =========================================================================
function initTabSwitchers() {
  const cards = document.querySelectorAll('.service-card');
  const btnOrders = document.getElementById('btnOrdersTab');
  const sectionTitle = document.getElementById('activeSectionTitle');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const targetTab = card.getAttribute('data-tab');
      activateTab(targetTab);

      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      if (targetTab === 'tab-shopping') {
        sectionTitle.textContent = 'Formulir Layanan: Minta Dibelikan';
        setTimeout(() => { if (shopMap) shopMap.invalidateSize(); }, 120);
      }
      if (targetTab === 'tab-service') {
        sectionTitle.textContent = 'Formulir Layanan: Servis & Bantuan';
        setTimeout(() => { if (serviceMap) serviceMap.invalidateSize(); }, 120);
      }
      if (targetTab === 'tab-delivery') {
        sectionTitle.textContent = 'Formulir Layanan: Antar / Kirim';
        setTimeout(() => { if (delMap) delMap.invalidateSize(); }, 120);
      }
    });
  });

  if (btnOrders) {
    btnOrders.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      activateTab('tab-orders');
      sectionTitle.textContent = 'Status & Riwayat Pesanan Saya';
    });
  }

  // Buka tab awal jika ada hash di URL (misal #tab-service)
  if (window.location.hash) {
    const hashTab = window.location.hash.replace('#', '');
    const matchingCard = document.querySelector(`.service-card[data-tab="${hashTab}"]`);
    if (matchingCard) {
      matchingCard.click();
    }
  }
}

function activateTab(tabId) {
  const panes = document.querySelectorAll('.tab-pane');
  panes.forEach(p => p.classList.remove('active'));
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
}

// =========================================================================
// 2. HELPER RUTE BERKENDARA NYATA (OSRM + OPENSTREETMAP)
// =========================================================================
function createCustomPin(label, colorBg) {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="background: ${colorBg}; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11px; box-shadow: 0 2px 6px rgba(0,0,0,0.35); border: 2px solid #ffffff;">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius bumi dalam km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchRealDrivingRoute(coordA, coordB) {
  // lon,lat format untuk OSRM
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
        // Konversi geojson [lon, lat] menjadi leaflet [lat, lon]
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
    console.warn('Gagal menghubungi OSRM online, menggunakan rute jalan realistis (fallback):', e);
  }

  // Fallback realistis: Haversine dikalikan koefisien kelokan jalan perkotaan 1.35x
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

// =========================================================================
// 3. PILAR 1: MINTA DIBELIKAN DENGAN PETA JALAN RAYA
// =========================================================================
function initShoppingMap() {
  const container = document.getElementById('shopMapCanvas');
  if (!container || typeof L === 'undefined') return;

  const startA = SIDOARJO_COORDS.taman_pinang; // Warung Titik A
  const startB = SIDOARJO_COORDS.pahlawan;      // Pemesan Titik B

  shopMap = L.map('shopMapCanvas', {
    center: startA,
    zoom: 14,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(shopMap);

  shopMarkerA = L.marker(startA, {
    draggable: true,
    icon: createCustomPin('A', '#2563EB')
  }).addTo(shopMap).bindPopup('<b>Titik A:</b> Warung / Toko Pembelian');

  shopMarkerB = L.marker(startB, {
    draggable: true,
    icon: createCustomPin('B', '#059669')
  }).addTo(shopMap).bindPopup('<b>Titik B:</b> Alamat Pengantaran');

  shopMarkerA.on('dragend', updateShoppingDrivingRoute);
  shopMarkerB.on('dragend', updateShoppingDrivingRoute);

  updateShoppingDrivingRoute();
}

async function updateShoppingDrivingRoute() {
  if (!shopMarkerA || !shopMarkerB) return;

  const posA = [shopMarkerA.getLatLng().lat, shopMarkerA.getLatLng().lng];
  const posB = [shopMarkerB.getLatLng().lat, shopMarkerB.getLatLng().lng];

  const statusBadge = document.getElementById('shopRouteStatus');
  if (statusBadge) statusBadge.textContent = 'Menghitung Rute...';

  const routeResult = await fetchRealDrivingRoute(posA, posB);

  currentShopDistanceKm = routeResult.distanceKm;

  // Gambar ulang garis rute jalan raya
  if (shopRouteLine) {
    shopMap.removeLayer(shopRouteLine);
  }

  shopRouteLine = L.polyline(routeResult.coordinates, {
    color: '#2563EB',
    weight: 5,
    opacity: 0.85,
    lineJoin: 'round'
  }).addTo(shopMap);

  shopMap.fitBounds(shopRouteLine.getBounds(), { padding: [25, 25] });

  // Update indikator teks
  const distEl = document.getElementById('shopDistanceText');
  const durEl = document.getElementById('shopDurationText');

  if (distEl) distEl.textContent = formatKm(currentShopDistanceKm);
  if (durEl) durEl.textContent = `~${routeResult.durationMin} Menit`;
  if (statusBadge) {
    statusBadge.textContent = routeResult.isRealRoad ? 'Rute Berkendara Nyata' : 'Estimasi Jalur Jalan';
  }

  updateShoppingCalculations();
}

function applyShopPreset(presetKey) {
  if (!shopMarkerA || !shopMarkerB) return;

  let posA = SIDOARJO_COORDS.taman_pinang;
  let posB = SIDOARJO_COORDS.pahlawan;
  let nameA = 'Bebek Goreng H. Slamet';
  let addrA = 'Jl. Taman Pinang Indah No. 8, Sidoarjo';
  let addrB = 'Jl. Pahlawan No. 15, Sidoarjo Kota';

  if (presetKey === 'larangan_alun2') {
    posA = SIDOARJO_COORDS.pasar_larangan;
    posB = SIDOARJO_COORDS.alun_alun;
    nameA = 'Pasar Tradisional Larangan';
    addrA = 'Jl. Sunandar Priyo Sudarmo, Larangan';
    addrB = 'Alun-Alun Sidoarjo Kota';
  } else if (presetKey === 'waru_sidoarjo') {
    posA = SIDOARJO_COORDS.waru;
    posB = SIDOARJO_COORDS.pahlawan;
    nameA = 'Apotek K-24 Ruko Waru';
    addrA = 'Jl. Raya Waru No. 10, Waru';
    addrB = 'Jl. Pahlawan No. 15, Sidoarjo Kota';
  }

  document.getElementById('shopStoreName').value = nameA;
  document.getElementById('shopStoreAddress').value = addrA;
  document.getElementById('shopDropoff').value = addrB;

  shopMarkerA.setLatLng(posA);
  shopMarkerB.setLatLng(posB);
  updateShoppingDrivingRoute();
}

function initShoppingPillar() {
  const estimateInput = document.getElementById('shopEstimate');
  const form = document.getElementById('formShopping');

  if (estimateInput) {
    estimateInput.addEventListener('input', updateShoppingCalculations);
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitShoppingOrder();
    });
  }
}

function updateShoppingCalculations() {
  const dist = currentShopDistanceKm;
  const estimate = parseInt(document.getElementById('shopEstimate')?.value || 55000, 10);
  const calc = calculateShoppingFee(dist, estimate);

  const goodsText = document.getElementById('shopGoodsCostText');
  const serviceFeeText = document.getElementById('shopServiceFeeText');
  const deliveryFeeText = document.getElementById('shopDeliveryFeeText');
  const totalText = document.getElementById('shopTotalText');
  const waBtn = document.getElementById('btnWaShopping');

  if (goodsText) goodsText.textContent = formatRp(calc.shoppingEstimate);
  if (serviceFeeText) serviceFeeText.textContent = formatRp(calc.serviceFee);
  if (deliveryFeeText) deliveryFeeText.textContent = formatRp(calc.deliveryFee);
  if (totalText) totalText.textContent = formatRp(calc.totalCustomerPay);

  // Update WA preview link
  if (waBtn) {
    const previewOrder = {
      id: 'DRAFT',
      type: 'SHOPPING',
      customerName: document.getElementById('shopCustomerName')?.value || 'Rian',
      customerPhone: document.getElementById('shopCustomerPhone')?.value || '',
      storeName: document.getElementById('shopStoreName')?.value || 'Warung',
      shoppingList: document.getElementById('shopItems')?.value || '',
      shoppingEstimate: calc.shoppingEstimate,
      totalServiceAndDelivery: calc.totalServiceAndDelivery,
      dropoffAddress: document.getElementById('shopDropoff')?.value || '',
      totalAmount: calc.totalCustomerPay,
      customerNotes: document.getElementById('shopNotes')?.value || ''
    };
    waBtn.href = buildWhatsAppOrderDraft(previewOrder);
  }
}

function submitShoppingOrder() {
  const dist = currentShopDistanceKm;
  const estimate = parseInt(document.getElementById('shopEstimate').value || 55000, 10);
  const calc = calculateShoppingFee(dist, estimate);

  const newOrder = {
    id: 'MTM-' + Math.floor(1000 + Math.random() * 9000),
    type: 'SHOPPING',
    orderTypeLabel: 'Minta Dibelikan',
    customerName: document.getElementById('shopCustomerName').value,
    customerPhone: document.getElementById('shopCustomerPhone').value,
    storeName: document.getElementById('shopStoreName').value,
    storeAddress: document.getElementById('shopStoreAddress').value,
    storeCoords: shopMarkerA ? [shopMarkerA.getLatLng().lat, shopMarkerA.getLatLng().lng] : SIDOARJO_COORDS.taman_pinang,
    pickupCoords: shopMarkerA ? [shopMarkerA.getLatLng().lat, shopMarkerA.getLatLng().lng] : SIDOARJO_COORDS.taman_pinang,
    dropoffCoords: shopMarkerB ? [shopMarkerB.getLatLng().lat, shopMarkerB.getLatLng().lng] : SIDOARJO_COORDS.pahlawan,
    shoppingList: document.getElementById('shopItems').value,
    shoppingEstimate: calc.shoppingEstimate,
    serviceFee: calc.serviceFee,
    shippingFee: calc.deliveryFee,
    totalServiceAndDelivery: calc.totalServiceAndDelivery,
    platformFee: calc.platformFee,
    driverShare: calc.driverNetEarnings,
    dropoffAddress: document.getElementById('shopDropoff').value,
    distanceKm: dist,
    totalAmount: calc.totalCustomerPay,
    paymentMethod: 'COD (Talangan Tunai)',
    customerNotes: document.getElementById('shopNotes').value,
    status: 'WAITING_DRIVER',
    createdAt: new Date().toISOString()
  };

  const state = loadSharedState();
  state.orders.unshift(newOrder);
  state.activeOrderId = newOrder.id;
  saveSharedState(state, true, 'ORDER_CREATED');

  alert(`Pesanan #${newOrder.id} dengan rute jalan ${formatKm(dist)} berhasil disiarkan ke mitra terdekat.`);
  activateTab('tab-orders');
  renderCustomerOrders();
}

// =========================================================================
// 4. PILAR 2: SERVIS & JASA BANTUAN
// =========================================================================
function initServicePillar() {
  const slider = document.getElementById('serviceHoursSlider');
  const form = document.getElementById('formService');

  if (slider) {
    slider.addEventListener('input', updateServiceCalculations);
  }

  updateServiceCalculations();

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitServiceOrder();
    });
  }
}

function setServiceHours(val) {
  const slider = document.getElementById('serviceHoursSlider');
  if (slider) {
    slider.value = val;
    updateServiceCalculations();
  }
}

function updateServiceCalculations() {
  const hours = parseInt(document.getElementById('serviceHoursSlider')?.value || 2, 10);
  const calc = calculateServiceFee(hours);

  const hoursText = document.getElementById('serviceHoursText');
  const rateText = document.getElementById('serviceRateText');
  const calcHoursText = document.getElementById('serviceHoursCalcText');
  const totalText = document.getElementById('serviceTotalText');
  const waBtn = document.getElementById('btnWaService');

  if (hoursText) hoursText.textContent = `${hours} Jam`;
  if (rateText) rateText.textContent = `${formatRp(calc.hourlyRate)} / Jam`;
  if (calcHoursText) calcHoursText.textContent = `${hours} Jam`;
  if (totalText) totalText.textContent = formatRp(calc.totalCustomerPay);

  if (waBtn) {
    const previewOrder = {
      id: 'DRAFT',
      type: 'SERVICE',
      customerName: document.getElementById('serviceCustomerName')?.value || 'Rian',
      customerPhone: document.getElementById('serviceCustomerPhone')?.value || '',
      serviceCategory: document.getElementById('serviceCategory')?.value || 'Bantuan',
      durationHours: hours,
      workDescription: document.getElementById('serviceDesc')?.value || '',
      taskAddress: document.getElementById('serviceLocation')?.value || '',
      totalAmount: calc.totalCustomerPay,
      customerNotes: document.getElementById('serviceNotes')?.value || ''
    };
    waBtn.href = buildWhatsAppOrderDraft(previewOrder);
  }
}

function initServiceMap() {
  const container = document.getElementById('serviceMapCanvas');
  if (!container || typeof L === 'undefined') return;

  const startPos = SIDOARJO_COORDS.taman_pinang;
  currentServiceCoord = startPos;

  serviceMap = L.map('serviceMapCanvas', {
    center: startPos,
    zoom: 14,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(serviceMap);

  serviceMarker = L.marker(startPos, {
    draggable: true,
    icon: createCustomPin('S', '#7C3AED')
  }).addTo(serviceMap).bindPopup('<b>Titik Lokasi:</b> Tempat Pengerjaan Tugas Bantuan');

  serviceMarker.on('dragend', () => {
    const pos = [serviceMarker.getLatLng().lat, serviceMarker.getLatLng().lng];
    currentServiceCoord = pos;
    const statusBadge = document.getElementById('serviceRouteStatus');
    if (statusBadge) statusBadge.textContent = 'Lokasi Dipilih (Kustom)';
  });

  serviceMap.on('click', (e) => {
    const pos = [e.latlng.lat, e.latlng.lng];
    currentServiceCoord = pos;
    serviceMarker.setLatLng(pos);
    const statusBadge = document.getElementById('serviceRouteStatus');
    if (statusBadge) statusBadge.textContent = 'Lokasi Dipilih (Kustom)';
  });
}

function applyServicePreset(presetKey) {
  if (!serviceMarker) return;
  let pos = SIDOARJO_COORDS.taman_pinang;
  let addr = 'Perumahan Taman Pinang Indah Blok B-4, Sidoarjo';

  if (presetKey === 'puri_indah') {
    pos = SIDOARJO_COORDS.puri_indah;
    addr = 'Perumahan Puri Indah Blok D-4, Sidoarjo';
  } else if (presetKey === 'alun_alun') {
    pos = SIDOARJO_COORDS.alun_alun;
    addr = 'Area Alun-Alun Sidoarjo Kota';
  } else if (presetKey === 'buduran') {
    pos = SIDOARJO_COORDS.buduran;
    addr = 'Perumahan Buduran Asri, Buduran';
  } else if (presetKey === 'waru') {
    pos = SIDOARJO_COORDS.waru;
    addr = 'Kawasan Ruko & Perumahan Waru, Sidoarjo';
  } else if (presetKey === 'candi') {
    pos = SIDOARJO_COORDS.candi;
    addr = 'Kecamatan Candi, Sidoarjo';
  }

  currentServiceCoord = pos;
  document.getElementById('serviceLocation').value = addr;
  serviceMarker.setLatLng(pos);
  serviceMap.setView(pos, 14);

  const statusBadge = document.getElementById('serviceRouteStatus');
  if (statusBadge) statusBadge.textContent = 'Lokasi Sidoarjo Terpilih';
}

function submitServiceOrder() {
  const hours = parseInt(document.getElementById('serviceHoursSlider')?.value || 2, 10);
  const calc = calculateServiceFee(hours);

  const newOrder = {
    id: 'SRV-' + Math.floor(1000 + Math.random() * 9000),
    type: 'SERVICE',
    orderTypeLabel: 'Servis & Bantuan Tenaga',
    customerName: document.getElementById('serviceCustomerName').value,
    customerPhone: document.getElementById('serviceCustomerPhone').value,
    serviceCategory: document.getElementById('serviceCategory').value,
    taskAddress: document.getElementById('serviceLocation').value,
    taskCoords: currentServiceCoord,
    workDescription: document.getElementById('serviceDesc').value,
    durationHours: hours,
    hourlyRate: calc.hourlyRate,
    platformFee: calc.platformFee,
    driverShare: calc.driverNetEarnings,
    totalAmount: calc.totalCustomerPay,
    paymentMethod: 'Tunai di Tempat',
    customerNotes: document.getElementById('serviceNotes').value,
    status: 'WAITING_DRIVER',
    createdAt: new Date().toISOString()
  };

  const state = loadSharedState();
  state.orders.unshift(newOrder);
  state.activeOrderId = newOrder.id;
  saveSharedState(state, true, 'SERVICE_ORDER_CREATED');

  alert(`Pesanan Jasa #${newOrder.id} berhasil disiarkan.`);
  activateTab('tab-orders');
  renderCustomerOrders();
}

// =========================================================================
// 5. PILAR 3: ANTAR / KIRIM P2P DENGAN PETA JALAN RAYA
// =========================================================================
function initDeliveryMap() {
  const container = document.getElementById('delMapCanvas');
  if (!container || typeof L === 'undefined') return;

  const startA = SIDOARJO_COORDS.pahlawan;  // Pickup Titik A
  const startB = SIDOARJO_COORDS.buduran;   // Dropoff Titik B

  delMap = L.map('delMapCanvas', {
    center: startA,
    zoom: 13,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(delMap);

  delMarkerA = L.marker(startA, {
    draggable: true,
    icon: createCustomPin('A', '#2563EB')
  }).addTo(delMap).bindPopup('<b>Titik A:</b> Lokasi Penjemputan');

  delMarkerB = L.marker(startB, {
    draggable: true,
    icon: createCustomPin('B', '#059669')
  }).addTo(delMap).bindPopup('<b>Titik B:</b> Lokasi Tujuan Pengantaran');

  delMarkerA.on('dragend', updateDeliveryDrivingRoute);
  delMarkerB.on('dragend', updateDeliveryDrivingRoute);

  updateDeliveryDrivingRoute();
}

async function updateDeliveryDrivingRoute() {
  if (!delMarkerA || !delMarkerB) return;

  const posA = [delMarkerA.getLatLng().lat, delMarkerA.getLatLng().lng];
  const posB = [delMarkerB.getLatLng().lat, delMarkerB.getLatLng().lng];

  const statusBadge = document.getElementById('delRouteStatus');
  if (statusBadge) statusBadge.textContent = 'Menghitung Rute...';

  const routeResult = await fetchRealDrivingRoute(posA, posB);

  currentDelDistanceKm = routeResult.distanceKm;

  if (delRouteLine) {
    delMap.removeLayer(delRouteLine);
  }

  delRouteLine = L.polyline(routeResult.coordinates, {
    color: '#2563EB',
    weight: 5,
    opacity: 0.85,
    lineJoin: 'round'
  }).addTo(delMap);

  delMap.fitBounds(delRouteLine.getBounds(), { padding: [25, 25] });

  const distEl = document.getElementById('delDistanceText');
  const durEl = document.getElementById('delDurationText');

  if (distEl) distEl.textContent = formatKm(currentDelDistanceKm);
  if (durEl) durEl.textContent = `~${routeResult.durationMin} Menit`;
  if (statusBadge) {
    statusBadge.textContent = routeResult.isRealRoad ? 'Rute Berkendara Nyata' : 'Estimasi Jalur Jalan';
  }

  updateDeliveryCalculations();
}

function applyDelPreset(presetKey) {
  if (!delMarkerA || !delMarkerB) return;

  let posA = SIDOARJO_COORDS.pahlawan;
  let posB = SIDOARJO_COORDS.buduran;
  let addrA = 'Jl. Pahlawan No. 20, Sidoarjo Kota';
  let addrB = 'Perumahan Buduran Asri Blok C-2, Buduran';

  if (presetKey === 'alun2_puri_indah') {
    posA = SIDOARJO_COORDS.alun_alun;
    posB = SIDOARJO_COORDS.puri_indah;
    addrA = 'Alun-Alun Sidoarjo Kota';
    addrB = 'Perumahan Puri Indah Blok D-4, Sidoarjo';
  } else if (presetKey === 'candi_kota') {
    posA = SIDOARJO_COORDS.candi;
    posB = SIDOARJO_COORDS.pahlawan;
    addrA = 'Jl. Raya Candi No. 45, Candi';
    addrB = 'Jl. Pahlawan No. 20, Sidoarjo Kota';
  }

  document.getElementById('delPickup').value = addrA;
  document.getElementById('delDropoff').value = addrB;

  delMarkerA.setLatLng(posA);
  delMarkerB.setLatLng(posB);
  updateDeliveryDrivingRoute();
}

function initDeliveryPillar() {
  const form = document.getElementById('formDelivery');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submitDeliveryOrder();
    });
  }
}

function updateDeliveryCalculations() {
  const dist = currentDelDistanceKm;
  const calc = calculateDeliveryFee(dist);

  const feeText = document.getElementById('delFeeText');
  const ruleText = document.getElementById('delRuleText');
  const totalText = document.getElementById('delTotalText');
  const waBtn = document.getElementById('btnWaDelivery');

  if (feeText) feeText.textContent = formatRp(calc.totalFee);
  if (ruleText) ruleText.textContent = `${formatKm(dist)} (Jalan Raya) × Rp 2.500/km`;
  if (totalText) totalText.textContent = formatRp(calc.totalCustomerPay);

  if (waBtn) {
    const previewOrder = {
      id: 'DRAFT',
      type: 'DELIVERY',
      customerName: document.getElementById('delSenderName')?.value || 'Bambang',
      customerPhone: document.getElementById('delSenderPhone')?.value || '',
      deliveryCategory: document.getElementById('delCategory')?.value || 'Dokumen',
      pickupAddress: document.getElementById('delPickup')?.value || '',
      dropoffAddress: document.getElementById('delDropoff')?.value || '',
      distanceKm: dist,
      totalAmount: calc.totalCustomerPay,
      customerNotes: document.getElementById('delNotes')?.value || ''
    };
    waBtn.href = buildWhatsAppOrderDraft(previewOrder);
  }
}

function submitDeliveryOrder() {
  const dist = currentDelDistanceKm;
  const calc = calculateDeliveryFee(dist);

  const newOrder = {
    id: 'KRM-' + Math.floor(1000 + Math.random() * 9000),
    type: 'DELIVERY',
    orderTypeLabel: 'Antar / Kurir P2P',
    customerName: document.getElementById('delSenderName').value,
    customerPhone: document.getElementById('delSenderPhone').value,
    recipientName: document.getElementById('delRecipientName').value,
    recipientPhone: document.getElementById('delRecipientPhone').value,
    pickupAddress: document.getElementById('delPickup').value,
    pickupCoords: delMarkerA ? [delMarkerA.getLatLng().lat, delMarkerA.getLatLng().lng] : SIDOARJO_COORDS.pahlawan,
    dropoffAddress: document.getElementById('delDropoff').value,
    dropoffCoords: delMarkerB ? [delMarkerB.getLatLng().lat, delMarkerB.getLatLng().lng] : SIDOARJO_COORDS.buduran,
    deliveryCategory: document.getElementById('delCategory').value,
    itemDescription: document.getElementById('delItemDesc').value,
    distanceKm: dist,
    shippingFee: calc.totalFee,
    platformFee: calc.platformFee,
    driverShare: calc.driverNetEarnings,
    totalAmount: calc.totalCustomerPay,
    paymentMethod: 'COD / Tunai',
    customerNotes: document.getElementById('delNotes').value,
    status: 'WAITING_DRIVER',
    createdAt: new Date().toISOString()
  };

  const state = loadSharedState();
  state.orders.unshift(newOrder);
  state.activeOrderId = newOrder.id;
  saveSharedState(state, true, 'DELIVERY_ORDER_CREATED');

  alert(`Pesanan Kurir #${newOrder.id} dengan rute jalan ${formatKm(dist)} berhasil disiarkan.`);
  activateTab('tab-orders');
  renderCustomerOrders();
}

// =========================================================================
// 6. RADAR & RIWAYAT PESANAN SAYA
// =========================================================================
function renderRadarFleet() {
  const state = loadSharedState();
  const drivers = state.drivers || [];
  const activeCount = drivers.filter(d => d.isOnline && d.accountStatus !== 'SUSPENDED').length;
  const radarText = document.getElementById('radarText');
  if (radarText) {
    radarText.textContent = `${activeCount} Mitra Siaga`;
  }
}

function renderCustomerOrders() {
  const state = loadSharedState();
  const container = document.getElementById('customerOrdersContainer');
  const badge = document.getElementById('activeOrderBadge');
  if (!container) return;

  const orders = state.orders || [];
  if (badge) badge.textContent = orders.length;

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        Belum ada pesanan aktif. Silakan pilih salah satu layanan di atas untuk membuat pesanan baru.
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(ord => {
    let statusLabel = 'Menunggu Konfirmasi Mitra';
    let statusClass = 'waiting';

    if (ord.status === 'GOING_TO_PICKUP') {
      statusLabel = 'Mitra Menuju Lokasi';
      statusClass = 'process';
    } else if (ord.status === 'IN_PROGRESS') {
      statusLabel = 'Sedang Dikerjakan / Dalam Perjalanan';
      statusClass = 'process';
    } else if (ord.status === 'DONE') {
      statusLabel = 'Pesanan Selesai';
      statusClass = 'done';
    } else if (ord.status === 'CANCELLED') {
      statusLabel = 'Dibatalkan';
      statusClass = 'waiting';
    }

    let specificDetails = '';
    if (ord.type === 'SHOPPING') {
      specificDetails = `
        <div class="order-detail-line"><b>Tempat Beli:</b> ${ord.storeName} (${ord.storeAddress || ''})</div>
        <div class="order-detail-line"><b>Barang:</b> ${ord.shoppingList}</div>
        <div class="order-detail-line"><b>Talangan Belanja:</b> ${formatRp(ord.shoppingEstimate)}</div>
        <div class="order-detail-line"><b>Alamat Antar:</b> ${ord.dropoffAddress} (${formatKm(ord.distanceKm)} rute jalan)</div>
      `;
    } else if (ord.type === 'SERVICE') {
      specificDetails = `
        <div class="order-detail-line"><b>Kategori:</b> ${ord.serviceCategory} (${ord.durationHours} Jam)</div>
        <div class="order-detail-line"><b>Instruksi:</b> ${ord.workDescription}</div>
        <div class="order-detail-line"><b>Lokasi Tugas:</b> ${ord.taskAddress}</div>
      `;
    } else {
      specificDetails = `
        <div class="order-detail-line"><b>Kategori:</b> ${ord.deliveryCategory}</div>
        <div class="order-detail-line"><b>Jemput:</b> ${ord.pickupAddress}</div>
        <div class="order-detail-line"><b>Antar:</b> ${ord.dropoffAddress} (${formatKm(ord.distanceKm)} rute jalan)</div>
      `;
    }

    return `
      <div class="order-card">
        <div class="order-header-row">
          <div>
            <span class="order-id-badge">${ord.id}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: 6px;">${ord.orderTypeLabel}</span>
          </div>
          <span class="status-tag ${statusClass}">${statusLabel}</span>
        </div>

        ${specificDetails}

        <div class="order-detail-line" style="margin-top: 6px;">
          <b>Total Tagihan:</b> <span style="font-family: var(--font-mono); font-weight: 800; color: var(--brand-accent);">${formatRp(ord.totalAmount)}</span> (${ord.paymentMethod})
        </div>

        ${ord.driverName ? `
          <div class="driver-assigned-strip">
            <b>Mitra Bertugas:</b> ${ord.driverName} (${ord.driverPhone || '-'})
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// Global scope bindings
window.setServiceHours = setServiceHours;
window.applyShopPreset = applyShopPreset;
window.applyServicePreset = applyServicePreset;
window.applyDelPreset = applyDelPreset;
window.renderCustomerOrders = renderCustomerOrders;
