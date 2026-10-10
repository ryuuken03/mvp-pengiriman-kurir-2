/**
 * Customer App Logic
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
let shopMarkerStop = null;
let shopMarkerB = null;
let shopRouteLine = null;
let currentShopDistanceKm = 2.6;
let hasExtraStore = false;

let serviceMap = null;
let serviceMarker = null;
let currentServiceCoord = SIDOARJO_COORDS.taman_pinang;

let delMap = null;
let delMarkerA = null;
let delMarkerStop = null;
let delMarkerB = null;
let delRouteLine = null;
let currentDelDistanceKm = 4.5;
let hasExtraDeliveryStop = false;

// Modal Location Picker State
let pickerMap = null;
let pickerMarker = null;
let currentPickerTarget = 'shop_store';
let currentPickerCoord = SIDOARJO_COORDS.taman_pinang;
let currentPickerAddress = 'Taman Pinang Indah';

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
// 2. HELPER RUTE BERKENDARA NYATA (OSRM + MULTI-WAYPOINT SUPPORT)
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

function resolveApproximateAddress(lat, lng) {
  let closestName = 'Wilayah Sidoarjo';
  let minDistance = 999999;
  for (const [key, coords] of Object.entries(SIDOARJO_COORDS)) {
    const d = calculateHaversineKm(lat, lng, coords[0], coords[1]);
    if (d < minDistance) {
      minDistance = d;
      const labels = {
        alun_alun: 'Area Alun-Alun Sidoarjo Kota',
        pahlawan: 'Kawasan Jl. Pahlawan, Sidoarjo Kota',
        taman_pinang: 'Perumahan Taman Pinang Indah',
        pasar_larangan: 'Area Pasar Tradisional Larangan',
        puri_indah: 'Kawasan Perumahan Puri Indah',
        buduran: 'Kawasan Perumahan Buduran Asri',
        waru: 'Kawasan Ruko & Perumahan Waru',
        candi: 'Kawasan Raya Candi, Sidoarjo'
      };
      closestName = labels[key] || 'Wilayah Sidoarjo';
    }
  }
  if (minDistance <= 0.6) {
    return closestName;
  }
  return `${closestName} (~${minDistance.toFixed(1)} km)`;
}

async function fetchRealDrivingRoute(pointsOrA, maybeB) {
  let points = [];
  if (Array.isArray(pointsOrA) && pointsOrA.length > 0 && Array.isArray(pointsOrA[0])) {
    points = pointsOrA;
  } else if (pointsOrA && maybeB) {
    points = [pointsOrA, maybeB];
  } else {
    return { success: false, distanceKm: 1, durationMin: 2, coordinates: [], isRealRoad: false };
  }

  // Format lon,lat;lon,lat untuk OSRM
  const pointsString = points.map(pt => `${pt[1]},${pt[0]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${pointsString}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
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
    console.warn('Gagal menghubungi OSRM online, menggunakan rute jalan realistis (fallback):', e);
  }

  // Fallback realistis: Haversine sum x 1.35x
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

// Database Landmark Sidoarjo untuk Pencarian Cepat (Offline Search)
const SIDOARJO_LANDMARKS_SEARCH_DB = [
  { name: 'Alun-Alun Sidoarjo Kota', category: 'Pusat Kota', coords: [-7.4478, 112.7183] },
  { name: 'Jl. Pahlawan Sidoarjo Kota', category: 'Kawasan Bisnis & Kuliner', coords: [-7.4485, 112.7160] },
  { name: 'Perumahan Taman Pinang Indah', category: 'Kawasan Perumahan & Ruko', coords: [-7.4439, 112.7058] },
  { name: 'Pasar Tradisional Larangan', category: 'Pasar & Perbelanjaan', coords: [-7.4602, 112.7145] },
  { name: 'Perumahan Puri Indah Sidoarjo', category: 'Kawasan Perumahan', coords: [-7.4580, 112.6980] },
  { name: 'Perumahan Buduran Asri, Buduran', category: 'Kawasan Perumahan', coords: [-7.4305, 112.7295] },
  { name: 'Kawasan Ruko & Stasiun Waru', category: 'Perbatasan Surabaya-Sidoarjo', coords: [-7.3525, 112.7280] },
  { name: 'Kecamatan Candi Sidoarjo', category: 'Kawasan Selatan Sidoarjo', coords: [-7.4815, 112.7220] },
  { name: 'GOR Gelora Delta Sidoarjo', category: 'Fasilitas Olahraga & Publik', coords: [-7.4565, 112.7125] },
  { name: 'Kawasan Kuliner Gading Fajar 2', category: 'Pusat Kuliner Sidoarjo', coords: [-7.4588, 112.7092] },
  { name: 'Perumahan Pondok Jati Sidoarjo', category: 'Kawasan Perumahan', coords: [-7.4350, 112.7095] },
  { name: 'Perumahan Kahuripan Nirwana Village', category: 'Perumahan Modern', coords: [-7.4655, 112.6950] },
  { name: 'RSUD R.T. Notopuro Sidoarjo', category: 'Layanan Kesehatan', coords: [-7.4410, 112.7175] },
  { name: 'Bandara Internasional Juanda (T1)', category: 'Transportasi Udara', coords: [-7.3798, 112.7875] },
  { name: 'Lippo Plaza Sidoarjo', category: 'Pusat Perbelanjaan', coords: [-7.4510, 112.7105] },
  { name: 'Suncity Mall Sidoarjo', category: 'Pusat Perbelanjaan', coords: [-7.4490, 112.7140] },
  { name: 'Stasiun Kereta Api Sidoarjo Kota', category: 'Stasiun Kereta', coords: [-7.4518, 112.7225] }
];

let searchDebounceTimer = null;

// =========================================================================
// 2B. MODAL PEMILIH LOKASI (GOOGLE MAPS STYLE & CENTER PIN ENGINE)
// =========================================================================
function initLocationPickerModal() {
  const container = document.getElementById('pickerMapCanvas');
  if (!container || typeof L === 'undefined' || pickerMap) return;

  pickerMap = L.map('pickerMapCanvas', {
    center: currentPickerCoord,
    zoom: 15,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(pickerMap);

  const centerPin = document.getElementById('pickerCenterPin');

  pickerMap.on('movestart', () => {
    if (centerPin) centerPin.classList.add('is-dragging');
  });

  pickerMap.on('moveend', () => {
    if (centerPin) centerPin.classList.remove('is-dragging');
    const center = pickerMap.getCenter();
    updatePickerLocationState([center.lat, center.lng]);
  });

  initPickerSearchBar();
}

function initPickerSearchBar() {
  const input = document.getElementById('pickerSearchInput');
  const clearBtn = document.getElementById('btnClearPickerSearch');
  if (!input) return;

  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (clearBtn) clearBtn.style.display = query.length > 0 ? 'inline-block' : 'none';
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      handlePickerSearch(query);
    }, 250);
  });
}

function clearPickerSearch() {
  const input = document.getElementById('pickerSearchInput');
  const clearBtn = document.getElementById('btnClearPickerSearch');
  const dropdown = document.getElementById('pickerSearchDropdown');
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (dropdown) dropdown.style.display = 'none';
}

function handlePickerSearch(query) {
  const dropdown = document.getElementById('pickerSearchDropdown');
  if (!dropdown) return;

  if (!query || query.length < 2) {
    dropdown.style.display = 'none';
    return;
  }

  // 1. Lapis Offline Landmark Search
  const qLower = query.toLowerCase();
  const localMatches = SIDOARJO_LANDMARKS_SEARCH_DB.filter(item =>
    item.name.toLowerCase().includes(qLower) || item.category.toLowerCase().includes(qLower)
  );

  if (localMatches.length > 0) {
    dropdown.innerHTML = localMatches.map((item, idx) => `
      <div class="search-result-item" onclick="selectSearchResult(${idx})">
        <div class="search-result-name">${item.name}</div>
        <div class="search-result-cat">${item.category}</div>
      </div>
    `).join('');
    dropdown.style.display = 'block';
    return;
  }

  // 2. Lapis Online Geocoding Nominatim OSM
  dropdown.innerHTML = `<div class="search-empty-state">Mencari alamat di peta Sidoarjo...</div>`;
  dropdown.style.display = 'block';

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Sidoarjo')}&limit=5&countrycodes=id`)
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        dropdown.innerHTML = data.map(item => `
          <div class="search-result-item" onclick="selectOnlineSearchResult('${item.lat}', '${item.lon}', '${item.display_name.replace(/'/g, "\\'")}')">
            <div class="search-result-name">${item.display_name.split(',')[0]}</div>
            <div class="search-result-cat">${item.display_name}</div>
          </div>
        `).join('');
      } else {
        dropdown.innerHTML = `<div class="search-empty-state">Lokasi tidak ditemukan. Geser peta langsung untuk menentukan titik.</div>`;
      }
    })
    .catch(() => {
      dropdown.innerHTML = `<div class="search-empty-state">Geser pin pada peta untuk memilih lokasi ini.</div>`;
    });
}

function selectSearchResult(idx) {
  const item = SIDOARJO_LANDMARKS_SEARCH_DB[idx];
  if (item && pickerMap) {
    pickerMap.flyTo(item.coords, 16);
    updatePickerLocationState(item.coords, item.name);
    clearPickerSearch();
  }
}

function selectOnlineSearchResult(lat, lon, displayName) {
  const coords = [parseFloat(lat), parseFloat(lon)];
  if (pickerMap) {
    pickerMap.flyTo(coords, 16);
    updatePickerLocationState(coords, displayName.split(',')[0]);
    clearPickerSearch();
  }
}

function locateUserGpsPosition() {
  if (!navigator.geolocation) {
    alert('Peramban Anda tidak mendukung fitur geolokasi GPS.');
    return;
  }

  const statusEl = document.getElementById('pickerCurrentAddressText');
  if (statusEl) statusEl.textContent = 'Mencari sinyal GPS perangkat...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const coords = [pos.coords.latitude, pos.coords.longitude];
      if (pickerMap) {
        pickerMap.flyTo(coords, 16);
      }
      const detectedName = resolveApproximateAddress(coords[0], coords[1]);
      updatePickerLocationState(coords, `Lokasi GPS Saya (${detectedName})`);
    },
    (err) => {
      console.warn('GPS Error:', err);
      alert('Gagal membaca lokasi GPS. Pastikan izin lokasi aktif di peramban Anda, atau geser peta secara manual.');
      if (statusEl) statusEl.textContent = currentPickerAddress;
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
}

function updatePickerLocationState(coords, explicitAddress = null) {
  currentPickerCoord = coords;
  const addrText = explicitAddress || resolveApproximateAddress(coords[0], coords[1]);
  currentPickerAddress = addrText;

  const addrEl = document.getElementById('pickerCurrentAddressText');
  const coordEl = document.getElementById('pickerCurrentCoordsText');
  if (addrEl) addrEl.textContent = addrText;
  if (coordEl) coordEl.textContent = `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
}

function openLocationPicker(targetKey) {
  currentPickerTarget = targetKey;
  const modal = document.getElementById('locationPickerModal');
  const titleEl = document.getElementById('locationModalTitle');
  const subEl = document.getElementById('locationModalSub');

  clearPickerSearch();

  let initialCoords = SIDOARJO_COORDS.taman_pinang;
  let initialAddr = 'Sidoarjo';

  if (targetKey === 'shop_store') {
    if (titleEl) titleEl.textContent = 'Pilih Titik Pembelian Utama (Titik A)';
    if (subEl) subEl.textContent = 'Geser peta ke lokasi warung, toko, apotek, atau kios pembelian';
    const lat = parseFloat(document.getElementById('shopStoreLat')?.value);
    const lng = parseFloat(document.getElementById('shopStoreLng')?.value);
    if (!isNaN(lat) && !isNaN(lng)) initialCoords = [lat, lng];
    initialAddr = document.getElementById('shopStoreAddress')?.value || 'Taman Pinang Indah';
  } else if (targetKey === 'shop_store_2') {
    if (titleEl) titleEl.textContent = 'Pilih Titik Toko Singgah Tambahan';
    if (subEl) subEl.textContent = 'Geser peta ke lokasi toko atau apotek perhentian kedua';
    const lat = parseFloat(document.getElementById('shopStoreLat2')?.value);
    const lng = parseFloat(document.getElementById('shopStoreLng2')?.value);
    if (!isNaN(lat) && !isNaN(lng)) initialCoords = [lat, lng];
    else initialCoords = SIDOARJO_COORDS.pasar_larangan;
    initialAddr = document.getElementById('shopStoreAddress2')?.value || 'Pasar Larangan';
  } else if (targetKey === 'shop_dropoff') {
    if (titleEl) titleEl.textContent = 'Pilih Titik Alamat Pengantaran (Titik B)';
    if (subEl) subEl.textContent = 'Geser peta ke rumah atau kantor tujuan akhir belanjaan';
    const lat = parseFloat(document.getElementById('shopDropoffLat')?.value);
    const lng = parseFloat(document.getElementById('shopDropoffLng')?.value);
    if (!isNaN(lat) && !isNaN(lng)) initialCoords = [lat, lng];
    initialAddr = document.getElementById('shopDropoff')?.value || 'Jl. Pahlawan';
  } else if (targetKey === 'service_location') {
    if (titleEl) titleEl.textContent = 'Pilih Titik Lokasi Pengerjaan Tugas';
    if (subEl) subEl.textContent = 'Geser peta ke rumah, gudang, atau lokasi kerja bantuan';
    const lat = parseFloat(document.getElementById('serviceLat')?.value);
    const lng = parseFloat(document.getElementById('serviceLng')?.value);
    if (!isNaN(lat) && !isNaN(lng)) initialCoords = [lat, lng];
    initialAddr = document.getElementById('serviceLocation')?.value || 'Taman Pinang Indah';
  } else if (targetKey === 'del_pickup') {
    if (titleEl) titleEl.textContent = 'Pilih Titik Penjemputan Paket (Titik A)';
    if (subEl) subEl.textContent = 'Geser peta ke titik tempat kurir mengambil dokumen/barang';
    const lat = parseFloat(document.getElementById('delPickupLat')?.value);
    const lng = parseFloat(document.getElementById('delPickupLng')?.value);
    if (!isNaN(lat) && !isNaN(lng)) initialCoords = [lat, lng];
    initialAddr = document.getElementById('delPickup')?.value || 'Jl. Pahlawan';
  } else if (targetKey === 'del_stop_2') {
    if (titleEl) titleEl.textContent = 'Pilih Titik Antar Singgah (Penerima 1)';
    if (subEl) subEl.textContent = 'Geser peta ke alamat pengantaran perhentian singgah pertama';
    const lat = parseFloat(document.getElementById('delStopLat2')?.value);
    const lng = parseFloat(document.getElementById('delStopLng2')?.value);
    if (!isNaN(lat) && !isNaN(lng)) initialCoords = [lat, lng];
    else initialCoords = SIDOARJO_COORDS.alun_alun;
    initialAddr = document.getElementById('delStopAddress2')?.value || 'Alun-Alun Sidoarjo';
  } else if (targetKey === 'del_dropoff') {
    if (titleEl) titleEl.textContent = 'Pilih Titik Pengantaran Utama (Titik B)';
    if (subEl) subEl.textContent = 'Geser peta ke alamat penerima paket tujuan akhir';
    const lat = parseFloat(document.getElementById('delDropoffLat')?.value);
    const lng = parseFloat(document.getElementById('delDropoffLng')?.value);
    if (!isNaN(lat) && !isNaN(lng)) initialCoords = [lat, lng];
    initialAddr = document.getElementById('delDropoff')?.value || 'Buduran Asri';
  }

  if (modal) modal.style.display = 'flex';

  if (!pickerMap) {
    initLocationPickerModal();
  }
  if (pickerMap) {
    setTimeout(() => {
      pickerMap.invalidateSize();
      pickerMap.setView(initialCoords, 15);
      updatePickerLocationState(initialCoords, initialAddr);
    }, 80);
  }
}

function closeLocationPicker() {
  const modal = document.getElementById('locationPickerModal');
  if (modal) modal.style.display = 'none';
  clearPickerSearch();
}

function setPickerLocation(coords, addressText) {
  if (pickerMap) {
    pickerMap.flyTo(coords, 15);
  }
  updatePickerLocationState(coords, addressText);
}

function confirmPickedLocation() {
  const coords = currentPickerCoord;
  const addrText = currentPickerAddress;
  updateLocationPreview(currentPickerTarget, coords, addrText);
  closeLocationPicker();
}

function updateLocationPreview(targetKey, coords, addressName) {
  const coordEl = document.getElementById(`previewCoords_${targetKey}`);
  const addrEl = document.getElementById(`previewAddress_${targetKey}`);
  const badgeEl = document.getElementById(`previewBadge_${targetKey}`);

  if (coordEl) coordEl.textContent = `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
  if (addrEl) addrEl.textContent = addressName;
  if (badgeEl) {
    badgeEl.textContent = 'Titik Terpilih';
    badgeEl.className = 'preview-badge-status';
  }

  if (targetKey === 'shop_store') {
    const addrInput = document.getElementById('shopStoreAddress');
    const latInput = document.getElementById('shopStoreLat');
    const lngInput = document.getElementById('shopStoreLng');
    if (addrInput) addrInput.value = addressName;
    if (latInput) latInput.value = coords[0];
    if (lngInput) lngInput.value = coords[1];
    if (shopMarkerA) shopMarkerA.setLatLng(coords);
    updateShoppingDrivingRoute();
  } else if (targetKey === 'shop_store_2') {
    const addrInput = document.getElementById('shopStoreAddress2');
    const latInput = document.getElementById('shopStoreLat2');
    const lngInput = document.getElementById('shopStoreLng2');
    if (addrInput) addrInput.value = addressName;
    if (latInput) latInput.value = coords[0];
    if (lngInput) lngInput.value = coords[1];
    if (shopMarkerStop) shopMarkerStop.setLatLng(coords);
    updateShoppingDrivingRoute();
  } else if (targetKey === 'shop_dropoff') {
    const addrInput = document.getElementById('shopDropoff');
    const latInput = document.getElementById('shopDropoffLat');
    const lngInput = document.getElementById('shopDropoffLng');
    if (addrInput) addrInput.value = addressName;
    if (latInput) latInput.value = coords[0];
    if (lngInput) lngInput.value = coords[1];
    if (shopMarkerB) shopMarkerB.setLatLng(coords);
    updateShoppingDrivingRoute();
  } else if (targetKey === 'service_location') {
    const addrInput = document.getElementById('serviceLocation');
    const latInput = document.getElementById('serviceLat');
    const lngInput = document.getElementById('serviceLng');
    const badgeTop = document.getElementById('serviceLocationPreviewBadge');
    if (addrInput) addrInput.value = addressName;
    if (latInput) latInput.value = coords[0];
    if (lngInput) lngInput.value = coords[1];
    if (badgeTop) badgeTop.textContent = addressName.split(',')[0];
    currentServiceCoord = coords;
    if (serviceMarker) serviceMarker.setLatLng(coords);
    if (serviceMap) serviceMap.setView(coords, 14);
  } else if (targetKey === 'del_pickup') {
    const addrInput = document.getElementById('delPickup');
    const latInput = document.getElementById('delPickupLat');
    const lngInput = document.getElementById('delPickupLng');
    if (addrInput) addrInput.value = addressName;
    if (latInput) latInput.value = coords[0];
    if (lngInput) lngInput.value = coords[1];
    if (delMarkerA) delMarkerA.setLatLng(coords);
    updateDeliveryDrivingRoute();
  } else if (targetKey === 'del_stop_2') {
    const addrInput = document.getElementById('delStopAddress2');
    const latInput = document.getElementById('delStopLat2');
    const lngInput = document.getElementById('delStopLng2');
    if (addrInput) addrInput.value = addressName;
    if (latInput) latInput.value = coords[0];
    if (lngInput) lngInput.value = coords[1];
    if (delMarkerStop) delMarkerStop.setLatLng(coords);
    updateDeliveryDrivingRoute();
  } else if (targetKey === 'del_dropoff') {
    const addrInput = document.getElementById('delDropoff');
    const latInput = document.getElementById('delDropoffLat');
    const lngInput = document.getElementById('delDropoffLng');
    if (addrInput) addrInput.value = addressName;
    if (latInput) latInput.value = coords[0];
    if (lngInput) lngInput.value = coords[1];
    if (delMarkerB) delMarkerB.setLatLng(coords);
    updateDeliveryDrivingRoute();
  }
}

// =========================================================================
// 2C. TOGGLE ROUTE MAP ACCORDION (OPSI A MOBILE FRIENDLY)
// =========================================================================
function toggleRouteAccordion(type) {
  const drawer = document.getElementById(`${type}MapDrawer`);
  const btn = document.getElementById(`btnToggle${type.charAt(0).toUpperCase() + type.slice(1)}Map`);
  if (!drawer || !btn) return;

  const isOpen = drawer.style.display !== 'none';
  if (isOpen) {
    drawer.style.display = 'none';
    btn.classList.remove('is-active');
    btn.textContent = type === 'service' ? 'Lihat Lokasi di Peta' : 'Lihat Peta Rute';
  } else {
    drawer.style.display = 'block';
    btn.classList.add('is-active');
    btn.textContent = 'Tutup Peta';
    setTimeout(() => {
      if (type === 'shop' && shopMap) {
        shopMap.invalidateSize();
        if (shopRouteLine) shopMap.fitBounds(shopRouteLine.getBounds(), { padding: [25, 25] });
      } else if (type === 'service' && serviceMap) {
        serviceMap.invalidateSize();
        if (serviceMarker) serviceMap.setView(serviceMarker.getLatLng(), 14);
      } else if (type === 'del' && delMap) {
        delMap.invalidateSize();
        if (delRouteLine) delMap.fitBounds(delRouteLine.getBounds(), { padding: [25, 25] });
      }
    }, 80);
  }
}

// =========================================================================
// 3. PILAR 1: MINTA DIBELIKAN DENGAN PETA JALAN RAYA & MULTI-TOKO
// =========================================================================
function toggleExtraStore(show) {
  hasExtraStore = show;
  const section = document.getElementById('extraStoreSection');
  const btn = document.getElementById('btnAddExtraStore');
  if (section) section.style.display = show ? 'block' : 'none';
  if (btn) btn.style.display = show ? 'none' : 'block';

  if (show) {
    const latInput = document.getElementById('shopStoreLat2');
    const lngInput = document.getElementById('shopStoreLng2');
    const addrInput = document.getElementById('shopStoreAddress2');
    const nameInput = document.getElementById('shopStoreName2');
    if (!latInput.value) {
      latInput.value = SIDOARJO_COORDS.pasar_larangan[0];
      lngInput.value = SIDOARJO_COORDS.pasar_larangan[1];
      addrInput.value = 'Pasar Tradisional Larangan';
      if (nameInput && !nameInput.value) nameInput.value = 'Apotek K-24 Larangan';
    }
    const stopCoords = [parseFloat(latInput.value), parseFloat(lngInput.value)];
    updateLocationPreview('shop_store_2', stopCoords, addrInput.value || 'Pasar Tradisional Larangan');

    if (shopMap && !shopMarkerStop) {
      shopMarkerStop = L.marker(stopCoords, {
        draggable: true,
        icon: createCustomPin('2', '#7C3AED')
      }).addTo(shopMap).bindPopup('<b>Toko Singgah:</b> Titik Pembelian 2');
      shopMarkerStop.on('dragend', () => {
        const latlng = shopMarkerStop.getLatLng();
        const detectedAddr = resolveApproximateAddress(latlng.lat, latlng.lng);
        updateLocationPreview('shop_store_2', [latlng.lat, latlng.lng], detectedAddr);
      });
    } else if (shopMarkerStop && shopMap) {
      shopMarkerStop.setLatLng(stopCoords);
      shopMarkerStop.addTo(shopMap);
    }
  } else {
    if (shopMarkerStop && shopMap) {
      shopMap.removeLayer(shopMarkerStop);
    }
  }
  updateShoppingDrivingRoute();
}

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
    icon: createCustomPin('1', '#2563EB')
  }).addTo(shopMap).bindPopup('<b>Titik 1:</b> Warung / Toko Pembelian Utama');

  shopMarkerB = L.marker(startB, {
    draggable: true,
    icon: createCustomPin('B', '#059669')
  }).addTo(shopMap).bindPopup('<b>Titik Tujuan:</b> Alamat Pengantaran');

  shopMarkerA.on('dragend', () => {
    const latlng = shopMarkerA.getLatLng();
    const detectedAddr = resolveApproximateAddress(latlng.lat, latlng.lng);
    updateLocationPreview('shop_store', [latlng.lat, latlng.lng], detectedAddr);
  });

  shopMarkerB.on('dragend', () => {
    const latlng = shopMarkerB.getLatLng();
    const detectedAddr = resolveApproximateAddress(latlng.lat, latlng.lng);
    updateLocationPreview('shop_dropoff', [latlng.lat, latlng.lng], detectedAddr);
  });

  updateShoppingDrivingRoute();
}

async function updateShoppingDrivingRoute() {
  if (!shopMarkerA || !shopMarkerB) return;

  const posA = [shopMarkerA.getLatLng().lat, shopMarkerA.getLatLng().lng];
  const posB = [shopMarkerB.getLatLng().lat, shopMarkerB.getLatLng().lng];

  const statusBadge = document.getElementById('shopRouteStatus');
  if (statusBadge) statusBadge.textContent = 'Menghitung Rute...';

  const pointsToRoute = [posA];
  if (hasExtraStore && shopMarkerStop) {
    const posStop = [shopMarkerStop.getLatLng().lat, shopMarkerStop.getLatLng().lng];
    pointsToRoute.push(posStop);
  }
  pointsToRoute.push(posB);

  const routeResult = await fetchRealDrivingRoute(pointsToRoute);

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
  updateLocationPreview('shop_store', posA, addrA);
  updateLocationPreview('shop_dropoff', posB, addrB);

  // Jika sedang aktif toko singgah, set toko singgah di tengah
  if (hasExtraStore && shopMarkerStop) {
    const midPos = SIDOARJO_COORDS.pasar_larangan;
    const midAddr = 'Pasar Tradisional Larangan';
    updateLocationPreview('shop_store_2', midPos, midAddr);
  }
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
  const storeCount = hasExtraStore ? 2 : 1;
  const calc = calculateShoppingFee(dist, estimate, null, storeCount);

  const goodsText = document.getElementById('shopGoodsCostText');
  const serviceFeeText = document.getElementById('shopServiceFeeText');
  const serviceFeeLabel = document.getElementById('shopServiceFeeLabel');
  const deliveryFeeText = document.getElementById('shopDeliveryFeeText');
  const totalText = document.getElementById('shopTotalText');
  const waBtn = document.getElementById('btnWaShopping');

  if (goodsText) goodsText.textContent = formatRp(calc.shoppingEstimate);
  if (serviceFeeText) serviceFeeText.textContent = formatRp(calc.serviceFee);
  if (serviceFeeLabel) {
    serviceFeeLabel.textContent = storeCount > 1 ? `Biaya Jasa Beli (${storeCount} Toko):` : 'Biaya Jasa Beli:';
  }
  if (deliveryFeeText) deliveryFeeText.textContent = formatRp(calc.deliveryFee);
  if (totalText) totalText.textContent = formatRp(calc.totalCustomerPay);

  // Update WA preview link
  if (waBtn) {
    const store1Name = document.getElementById('shopStoreName')?.value || 'Warung';
    const store1Items = document.getElementById('shopItems')?.value || '';
    const store1Addr = document.getElementById('shopStoreAddress')?.value || '';
    const store1Detail = document.getElementById('shopStoreDetail')?.value || '';

    const previewOrder = {
      id: 'DRAFT',
      type: 'SHOPPING',
      customerName: document.getElementById('shopCustomerName')?.value || 'Rian',
      customerPhone: document.getElementById('shopCustomerPhone')?.value || '',
      storeName: store1Name,
      storeDetail: store1Detail,
      shoppingList: store1Items,
      shoppingEstimate: calc.shoppingEstimate,
      totalServiceAndDelivery: calc.totalServiceAndDelivery,
      dropoffAddress: document.getElementById('shopDropoff')?.value || '',
      dropoffDetail: document.getElementById('shopDropoffDetail')?.value || '',
      totalAmount: calc.totalCustomerPay,
      customerNotes: document.getElementById('shopNotes')?.value || ''
    };

    if (hasExtraStore) {
      previewOrder.stores = [
        { name: store1Name, address: store1Addr, detail: store1Detail, items: store1Items },
        {
          name: document.getElementById('shopStoreName2')?.value || 'Toko 2',
          address: document.getElementById('shopStoreAddress2')?.value || '',
          detail: document.getElementById('shopStoreDetail2')?.value || '',
          items: document.getElementById('shopItems2')?.value || ''
        }
      ];
    }

    waBtn.href = buildWhatsAppOrderDraft(previewOrder);
  }
}

function submitShoppingOrder() {
  const dist = currentShopDistanceKm;
  const estimate = parseInt(document.getElementById('shopEstimate').value || 55000, 10);
  const storeCount = hasExtraStore ? 2 : 1;
  const calc = calculateShoppingFee(dist, estimate, null, storeCount);

  const posA = shopMarkerA ? [shopMarkerA.getLatLng().lat, shopMarkerA.getLatLng().lng] : SIDOARJO_COORDS.taman_pinang;
  const posB = shopMarkerB ? [shopMarkerB.getLatLng().lat, shopMarkerB.getLatLng().lng] : SIDOARJO_COORDS.pahlawan;

  const store1 = {
    name: document.getElementById('shopStoreName').value,
    address: document.getElementById('shopStoreAddress').value,
    detail: document.getElementById('shopStoreDetail')?.value || '',
    items: document.getElementById('shopItems').value,
    coords: posA
  };

  const stores = [store1];
  const waypoints = [posA];

  if (hasExtraStore && shopMarkerStop) {
    const posStop = [shopMarkerStop.getLatLng().lat, shopMarkerStop.getLatLng().lng];
    const store2 = {
      name: document.getElementById('shopStoreName2').value || 'Toko Singgah 2',
      address: document.getElementById('shopStoreAddress2').value || '',
      detail: document.getElementById('shopStoreDetail2')?.value || '',
      items: document.getElementById('shopItems2').value || '',
      coords: posStop
    };
    stores.push(store2);
    waypoints.push(posStop);
  }
  waypoints.push(posB);

  const newOrder = {
    id: 'MTM-' + Math.floor(1000 + Math.random() * 9000),
    type: 'SHOPPING',
    orderTypeLabel: storeCount > 1 ? 'Minta Dibelikan (2 Toko)' : 'Minta Dibelikan',
    customerName: document.getElementById('shopCustomerName').value,
    customerPhone: document.getElementById('shopCustomerPhone').value,
    storeName: store1.name,
    storeAddress: store1.address,
    storeDetail: store1.detail,
    storeCoords: posA,
    pickupCoords: posA,
    dropoffCoords: posB,
    shoppingList: store1.items,
    hasExtraStore: hasExtraStore,
    storeCount: storeCount,
    stores: stores,
    waypoints: waypoints,
    shoppingEstimate: calc.shoppingEstimate,
    serviceFee: calc.serviceFee,
    shippingFee: calc.deliveryFee,
    totalServiceAndDelivery: calc.totalServiceAndDelivery,
    platformFee: calc.platformFee,
    driverShare: calc.driverNetEarnings,
    dropoffAddress: document.getElementById('shopDropoff').value,
    dropoffDetail: document.getElementById('shopDropoffDetail')?.value || '',
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

  const alertStoreText = storeCount > 1 ? ' (2 Toko Singgah)' : '';
  alert(`Pesanan #${newOrder.id}${alertStoreText} dengan rute jalan ${formatKm(dist)} berhasil disiarkan ke mitra terdekat.`);
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

function updateServiceCalculations() {
  const calc = calculateServiceFee();
  const baseFeeEl = document.getElementById('serviceBaseFeeText');
  const totalText = document.getElementById('serviceTotalText');
  const waBtn = document.getElementById('btnWaService');

  if (baseFeeEl) baseFeeEl.textContent = formatRp(calc.inspectionFee);
  if (totalText) totalText.textContent = formatRp(calc.totalCustomerPay);

  if (waBtn) {
    const previewOrder = {
      id: 'DRAFT',
      type: 'SERVICE',
      customerName: document.getElementById('serviceCustomerName')?.value || 'Rian',
      customerPhone: document.getElementById('serviceCustomerPhone')?.value || '',
      serviceCategory: document.getElementById('serviceCategory')?.value || 'Servis',
      serviceBaseInspectionFee: calc.inspectionFee,
      serviceLaborCost: 0,
      workDescription: document.getElementById('serviceDesc')?.value || '',
      taskAddress: document.getElementById('serviceLocation')?.value || '',
      taskDetail: document.getElementById('serviceLocationDetail')?.value || '',
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
    const detectedAddr = resolveApproximateAddress(pos[0], pos[1]);
    updateLocationPreview('service_location', pos, detectedAddr);
    const statusBadge = document.getElementById('serviceRouteStatus');
    if (statusBadge) statusBadge.textContent = 'Lokasi Dipilih (Kustom)';
  });

  serviceMap.on('click', (e) => {
    const pos = [e.latlng.lat, e.latlng.lng];
    const detectedAddr = resolveApproximateAddress(pos[0], pos[1]);
    updateLocationPreview('service_location', pos, detectedAddr);
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

  updateLocationPreview('service_location', pos, addr);

  const statusBadge = document.getElementById('serviceRouteStatus');
  if (statusBadge) statusBadge.textContent = 'Lokasi Sidoarjo Terpilih';
}

function submitServiceOrder() {
  const calc = calculateServiceFee();
  const lat = parseFloat(document.getElementById('serviceLat')?.value || currentServiceCoord[0]);
  const lng = parseFloat(document.getElementById('serviceLng')?.value || currentServiceCoord[1]);
  const taskCoords = [lat, lng];

  const newOrder = {
    id: 'SRV-' + Math.floor(1000 + Math.random() * 9000),
    type: 'SERVICE',
    orderTypeLabel: 'Servis & Bantuan Tukang',
    customerName: document.getElementById('serviceCustomerName').value,
    customerPhone: document.getElementById('serviceCustomerPhone').value,
    serviceCategory: document.getElementById('serviceCategory').value,
    taskAddress: document.getElementById('serviceLocation').value,
    taskDetail: document.getElementById('serviceLocationDetail')?.value || '',
    taskCoords: taskCoords,
    waypoints: [taskCoords],
    workDescription: document.getElementById('serviceDesc').value,
    serviceBaseInspectionFee: calc.inspectionFee,
    serviceLaborCost: 0,
    serviceQuoteItems: [],
    serviceQuoteNote: '',
    quoteStatus: 'PENDING_INSPECTION',
    platformFee: calc.platformFee,
    driverShare: calc.driverNetEarnings,
    totalAmount: calc.totalCustomerPay,
    paymentMethod: 'Tunai di Tempat (COD)',
    customerNotes: document.getElementById('serviceNotes').value,
    status: 'WAITING_DRIVER',
    createdAt: new Date().toISOString()
  };

  const state = loadSharedState();
  state.orders.unshift(newOrder);
  state.activeOrderId = newOrder.id;
  saveSharedState(state, true, 'SERVICE_ORDER_CREATED');

  alert(`Pesanan Servis #${newOrder.id} berhasil disiarkan. Biaya awal cek lokasi ${formatRp(newOrder.serviceBaseInspectionFee)}. Biaya jasa perbaikan akan diajukan tukang setelah pemeriksaan fisik.`);
  activateTab('tab-orders');
  renderCustomerOrders();
}

function approveServiceQuote(orderId) {
  const state = loadSharedState();
  const order = (state.orders || []).find(o => o.id === orderId);
  if (!order) return;

  order.status = 'IN_PROGRESS';
  order.quoteStatus = 'APPROVED';
  saveSharedState(state, true, 'SERVICE_QUOTE_APPROVED');
  alert(`Penawaran biaya servis #${order.id} sebesar ${formatRp(order.totalAmount)} telah disetujui. Mitra & tukang melanjutkan pengerjaan.`);
  renderCustomerOrders();
}

function rejectServiceQuote(orderId) {
  const state = loadSharedState();
  const order = (state.orders || []).find(o => o.id === orderId);
  if (!order) return;

  if (confirm(`Apakah Anda yakin membatalkan perbaikan servis #${order.id}? Anda hanya akan membayar biaya kedatangan & cek lokasi sebesar ${formatRp(order.serviceBaseInspectionFee || 15000)}.`)) {
    order.status = 'SERVICE_REJECTED';
    order.quoteStatus = 'REJECTED';
    order.serviceLaborCost = 0;
    order.totalAmount = order.serviceBaseInspectionFee || 15000;
    const calc = calculateServiceFee(order.serviceBaseInspectionFee || 15000, 0);
    order.platformFee = calc.platformFee;
    order.driverShare = calc.driverNetEarnings;

    saveSharedState(state, true, 'SERVICE_QUOTE_REJECTED');
    alert(`Pekerjaan perbaikan dibatalkan. Tagihan yang diselesaikan adalah Biaya Pengecekan Dasar ${formatRp(order.serviceBaseInspectionFee || 15000)}.`);
    renderCustomerOrders();
  }
}

// =========================================================================
// 5. PILAR 3: ANTAR / KIRIM P2P DENGAN PETA JALAN RAYA & MULTI-STOP
// =========================================================================
function toggleExtraDeliveryStop(show) {
  hasExtraDeliveryStop = show;
  const section = document.getElementById('extraStopSection');
  const btn = document.getElementById('btnAddExtraStop');
  if (section) section.style.display = show ? 'block' : 'none';
  if (btn) btn.style.display = show ? 'none' : 'block';

  if (show) {
    const latInput = document.getElementById('delStopLat2');
    const lngInput = document.getElementById('delStopLng2');
    const addrInput = document.getElementById('delStopAddress2');
    const nameInput = document.getElementById('delStopRecipientName2');
    if (!latInput.value) {
      latInput.value = SIDOARJO_COORDS.alun_alun[0];
      lngInput.value = SIDOARJO_COORDS.alun_alun[1];
      addrInput.value = 'Area Alun-Alun Sidoarjo Kota';
      if (nameInput && !nameInput.value) nameInput.value = 'Rudi Santoso';
    }
    const stopCoords = [parseFloat(latInput.value), parseFloat(lngInput.value)];
    updateLocationPreview('del_stop_2', stopCoords, addrInput.value || 'Area Alun-Alun Sidoarjo Kota');

    if (delMap && !delMarkerStop) {
      delMarkerStop = L.marker(stopCoords, {
        draggable: true,
        icon: createCustomPin('1', '#7C3AED')
      }).addTo(delMap).bindPopup('<b>Titik Singgah:</b> Pengantaran Pertama');
      delMarkerStop.on('dragend', () => {
        const latlng = delMarkerStop.getLatLng();
        const detectedAddr = resolveApproximateAddress(latlng.lat, latlng.lng);
        updateLocationPreview('del_stop_2', [latlng.lat, latlng.lng], detectedAddr);
      });
    } else if (delMarkerStop && delMap) {
      delMarkerStop.setLatLng(stopCoords);
      delMarkerStop.addTo(delMap);
    }
  } else {
    if (delMarkerStop && delMap) {
      delMap.removeLayer(delMarkerStop);
    }
  }
  updateDeliveryDrivingRoute();
}

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
  }).addTo(delMap).bindPopup('<b>Titik Tujuan:</b> Lokasi Pengantaran Utama');

  delMarkerA.on('dragend', () => {
    const latlng = delMarkerA.getLatLng();
    const detectedAddr = resolveApproximateAddress(latlng.lat, latlng.lng);
    updateLocationPreview('del_pickup', [latlng.lat, latlng.lng], detectedAddr);
  });

  delMarkerB.on('dragend', () => {
    const latlng = delMarkerB.getLatLng();
    const detectedAddr = resolveApproximateAddress(latlng.lat, latlng.lng);
    updateLocationPreview('del_dropoff', [latlng.lat, latlng.lng], detectedAddr);
  });

  updateDeliveryDrivingRoute();
}

async function updateDeliveryDrivingRoute() {
  if (!delMarkerA || !delMarkerB) return;

  const posA = [delMarkerA.getLatLng().lat, delMarkerA.getLatLng().lng];
  const posB = [delMarkerB.getLatLng().lat, delMarkerB.getLatLng().lng];

  const statusBadge = document.getElementById('delRouteStatus');
  if (statusBadge) statusBadge.textContent = 'Menghitung Rute...';

  const pointsToRoute = [posA];
  if (hasExtraDeliveryStop && delMarkerStop) {
    const posStop = [delMarkerStop.getLatLng().lat, delMarkerStop.getLatLng().lng];
    pointsToRoute.push(posStop);
  }
  pointsToRoute.push(posB);

  const routeResult = await fetchRealDrivingRoute(pointsToRoute);

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

  updateLocationPreview('del_pickup', posA, addrA);
  updateLocationPreview('del_dropoff', posB, addrB);

  if (hasExtraDeliveryStop && delMarkerStop) {
    const midPos = SIDOARJO_COORDS.alun_alun;
    updateLocationPreview('del_stop_2', midPos, 'Area Alun-Alun Sidoarjo Kota');
  }
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
  const extraStops = hasExtraDeliveryStop ? 1 : 0;
  const calc = calculateDeliveryFee(dist, null, extraStops);

  const feeText = document.getElementById('delFeeText');
  const ruleText = document.getElementById('delRuleText');
  const totalText = document.getElementById('delTotalText');
  const waBtn = document.getElementById('btnWaDelivery');

  if (feeText) feeText.textContent = formatRp(calc.totalFee);
  if (ruleText) ruleText.textContent = calc.calculationNote;
  if (totalText) totalText.textContent = formatRp(calc.totalCustomerPay);

  if (waBtn) {
    const previewOrder = {
      id: 'DRAFT',
      type: 'DELIVERY',
      customerName: document.getElementById('delSenderName')?.value || 'Bambang',
      customerPhone: document.getElementById('delSenderPhone')?.value || '',
      deliveryCategory: document.getElementById('delCategory')?.value || 'Dokumen',
      pickupAddress: document.getElementById('delPickup')?.value || '',
      pickupDetail: document.getElementById('delPickupDetail')?.value || '',
      dropoffAddress: document.getElementById('delDropoff')?.value || '',
      dropoffDetail: document.getElementById('delDropoffDetail')?.value || '',
      distanceKm: dist,
      totalAmount: calc.totalCustomerPay,
      customerNotes: document.getElementById('delNotes')?.value || ''
    };

    if (hasExtraDeliveryStop) {
      previewOrder.stops = [
        {
          recipientName: document.getElementById('delStopRecipientName2')?.value || 'Penerima 1',
          phone: document.getElementById('delStopRecipientPhone2')?.value || '',
          address: document.getElementById('delStopAddress2')?.value || '',
          detail: document.getElementById('delStopDetail2')?.value || ''
        },
        {
          recipientName: document.getElementById('delRecipientName')?.value || 'Penerima Utama',
          phone: document.getElementById('delRecipientPhone')?.value || '',
          address: document.getElementById('delDropoff')?.value || '',
          detail: document.getElementById('delDropoffDetail')?.value || ''
        }
      ];
    }

    waBtn.href = buildWhatsAppOrderDraft(previewOrder);
  }
}

function submitDeliveryOrder() {
  const dist = currentDelDistanceKm;
  const extraStops = hasExtraDeliveryStop ? 1 : 0;
  const calc = calculateDeliveryFee(dist, null, extraStops);

  const posA = delMarkerA ? [delMarkerA.getLatLng().lat, delMarkerA.getLatLng().lng] : SIDOARJO_COORDS.pahlawan;
  const posB = delMarkerB ? [delMarkerB.getLatLng().lat, delMarkerB.getLatLng().lng] : SIDOARJO_COORDS.buduran;

  const waypoints = [posA];
  const stops = [];

  if (hasExtraDeliveryStop && delMarkerStop) {
    const posStop = [delMarkerStop.getLatLng().lat, delMarkerStop.getLatLng().lng];
    waypoints.push(posStop);
    stops.push({
      recipientName: document.getElementById('delStopRecipientName2').value || 'Penerima Singgah 1',
      recipientPhone: document.getElementById('delStopRecipientPhone2').value || '-',
      address: document.getElementById('delStopAddress2').value,
      detail: document.getElementById('delStopDetail2')?.value || '',
      coords: posStop
    });
  }

  waypoints.push(posB);
  stops.push({
    recipientName: document.getElementById('delRecipientName').value,
    recipientPhone: document.getElementById('delRecipientPhone').value,
    address: document.getElementById('delDropoff').value,
    detail: document.getElementById('delDropoffDetail')?.value || '',
    coords: posB
  });

  const newOrder = {
    id: 'KRM-' + Math.floor(1000 + Math.random() * 9000),
    type: 'DELIVERY',
    orderTypeLabel: hasExtraDeliveryStop ? 'Antar P2P (Multi-Drop 2 Titik)' : 'Antar / Kurir P2P',
    customerName: document.getElementById('delSenderName').value,
    customerPhone: document.getElementById('delSenderPhone').value,
    recipientName: document.getElementById('delRecipientName').value,
    recipientPhone: document.getElementById('delRecipientPhone').value,
    pickupAddress: document.getElementById('delPickup').value,
    pickupDetail: document.getElementById('delPickupDetail')?.value || '',
    pickupCoords: posA,
    dropoffAddress: document.getElementById('delDropoff').value,
    dropoffDetail: document.getElementById('delDropoffDetail')?.value || '',
    dropoffCoords: posB,
    hasExtraDeliveryStop: hasExtraDeliveryStop,
    stopCount: stops.length,
    stops: stops,
    waypoints: waypoints,
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

  const alertStopText = hasExtraDeliveryStop ? ' (2 Titik Pengantaran)' : '';
  alert(`Pesanan Kurir #${newOrder.id}${alertStopText} dengan rute jalan ${formatKm(dist)} berhasil disiarkan.`);
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
      statusLabel = ord.type === 'SERVICE' ? 'Mitra & Tukang Menuju Lokasi' : 'Mitra Menuju Lokasi';
      statusClass = 'process';
    } else if (ord.status === 'CHECKING_SITE') {
      statusLabel = 'Pemeriksaan Kerusakan di Lokasi';
      statusClass = 'process';
    } else if (ord.status === 'AWAITING_CUSTOMER_APPROVAL') {
      statusLabel = 'Menunggu Persetujuan Biaya Servis';
      statusClass = 'waiting';
    } else if (ord.status === 'IN_PROGRESS') {
      statusLabel = ord.type === 'SERVICE' ? 'Perbaikan Sedang Dikerjakan' : 'Sedang Dikerjakan / Dalam Perjalanan';
      statusClass = 'process';
    } else if (ord.status === 'DONE') {
      statusLabel = 'Pesanan Selesai';
      statusClass = 'done';
    } else if (ord.status === 'CANCELLED' || ord.status === 'SERVICE_REJECTED') {
      statusLabel = 'Dibatalkan (Hanya Biaya Cek)';
      statusClass = 'waiting';
    }

    let summaryRouteHtml = '';
    if (ord.type === 'SHOPPING') {
      const extraStoreNote = (ord.stores && ord.stores.length > 1) ? ` (+${ord.stores.length - 1} Toko Singgah)` : '';
      summaryRouteHtml = `
        <div class="order-detail-line"><b>Toko:</b> ${ord.storeName || 'Toko'}${extraStoreNote}</div>
        <div class="order-detail-line"><b>Antar:</b> ${ord.dropoffAddress || '-'} (${formatKm(ord.distanceKm)} rute)</div>
      `;
    } else if (ord.type === 'SERVICE') {
      summaryRouteHtml = `
        <div class="order-detail-line"><b>Layanan:</b> ${ord.serviceCategory || 'Bantuan Servis'}</div>
        <div class="order-detail-line"><b>Lokasi:</b> ${ord.taskAddress || '-'}</div>
      `;
    } else {
      // DELIVERY
      const extraStopNote = ord.hasExtraDeliveryStop ? ' (+1 Titik Singgah)' : '';
      summaryRouteHtml = `
        <div class="order-detail-line"><b>Jemput:</b> ${ord.pickupAddress || '-'}</div>
        <div class="order-detail-line"><b>Antar:</b> ${ord.dropoffAddress || '-'}${extraStopNote} (${formatKm(ord.distanceKm)} rute)</div>
      `;
    }

    const isAwaitingApproval = ord.status === 'AWAITING_CUSTOMER_APPROVAL';

    return `
      <div class="order-card">
        <div class="order-header-row">
          <div>
            <span class="order-id-badge">${ord.id}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted); margin-left: 6px;">${ord.orderTypeLabel || ord.type}</span>
          </div>
          <span class="status-tag ${statusClass}">${statusLabel}</span>
        </div>

        ${summaryRouteHtml}

        <div class="order-detail-line" style="margin-top: 6px;">
          <b>Total Tagihan:</b> <span style="font-family: var(--font-mono); font-weight: 800; color: var(--brand-accent);">${formatRp(ord.totalAmount)}</span> (${ord.paymentMethod || 'COD'})
        </div>

        ${ord.driverName ? `
          <div class="driver-assigned-strip">
            <b>Mitra Bertugas:</b> ${ord.driverName} (${ord.driverPhone || '-'})
          </div>
        ` : ''}

        ${isAwaitingApproval ? `
          <div style="margin-top: 8px; background: #FFFBEB; border: 1px solid #FCD34D; border-radius: 6px; padding: 8px 10px; font-size: 0.72rem; color: #92400E;">
            <b>Perhatian:</b> Teknisi telah memeriksa lokasi dan mengajukan penawaran biaya servis. Buka detail untuk menyetujui atau membatalkan.
          </div>
        ` : ''}

        <button type="button" class="btn-view-detail" onclick="openCustomerOrderModal('${ord.id}')">
          ${isAwaitingApproval ? 'Lihat Detail & Persetujuan Biaya' : 'Lihat Detail Transaksi'}
        </button>
      </div>
    `;
  }).join('');
}

// Modal Detail Transaksi Customer
function openCustomerOrderModal(orderId) {
  const state = loadSharedState();
  const ord = (state.orders || []).find(o => o.id === orderId);
  if (!ord) return;

  const modal = document.getElementById('customerOrderDetailModal');
  const titleEl = document.getElementById('custModalOrderTitle');
  const subEl = document.getElementById('custModalOrderSub');
  const bodyEl = document.getElementById('custModalOrderBody');
  if (!modal || !bodyEl) return;

  if (titleEl) titleEl.textContent = `Detail Pesanan #${ord.id}`;

  let statusText = 'Menunggu Konfirmasi Mitra';
  if (ord.status === 'GOING_TO_PICKUP') statusText = 'Mitra Menuju Lokasi';
  else if (ord.status === 'CHECKING_SITE') statusText = 'Pemeriksaan Kerusakan di Lokasi';
  else if (ord.status === 'AWAITING_CUSTOMER_APPROVAL') statusText = 'Menunggu Persetujuan Biaya Servis';
  else if (ord.status === 'IN_PROGRESS') statusText = 'Sedang Dikerjakan / Dalam Pengantaran';
  else if (ord.status === 'DONE') statusText = 'Pesanan Selesai';
  else if (ord.status === 'SERVICE_REJECTED' || ord.status === 'CANCELLED') statusText = 'Dibatalkan (Hanya Biaya Cek)';

  if (subEl) subEl.textContent = `${ord.orderTypeLabel || ord.type} • Status: ${statusText}`;

  // 1. Rincian Informasi Rute & Spesifik Layanan
  let routeAndOrderInfoHtml = '';
  if (ord.type === 'SHOPPING') {
    let storeListHtml = '';
    if (ord.stores && ord.stores.length > 1) {
      storeListHtml = ord.stores.map((st, i) => `
        <div style="margin-bottom: 6px; padding-left: 8px; border-left: 2px solid #CBD5E1;">
          <div style="font-weight: 700; font-size: 0.74rem;">Toko ${i + 1}: ${st.name}</div>
          <div style="font-size: 0.7rem; color: #475569;">Alamat: ${st.address || '-'}${st.detail ? ' (' + st.detail + ')' : ''}</div>
          <div style="font-size: 0.7rem; color: #334155; margin-top: 2px;">Daftar Belanja: <b>${st.items || '-'}</b></div>
        </div>
      `).join('');
    } else {
      storeListHtml = `
        <div style="margin-bottom: 6px; padding-left: 8px; border-left: 2px solid #CBD5E1;">
          <div style="font-weight: 700; font-size: 0.74rem;">Toko Pembelian: ${ord.storeName || '-'}</div>
          <div style="font-size: 0.7rem; color: #475569;">Alamat: ${ord.storeAddress || '-'}${ord.storeDetail ? ' (' + ord.storeDetail + ')' : ''}</div>
          <div style="font-size: 0.7rem; color: #334155; margin-top: 2px;">Daftar Belanja: <b>${ord.shoppingList || '-'}</b></div>
        </div>
      `;
    }

    routeAndOrderInfoHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Informasi Pembelian & Alamat Antar
        </div>
        ${storeListHtml}
        <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #F1F5F9;">
          <div style="font-size: 0.72rem; color: #475569;"><b>Alamat Pengantaran:</b> ${ord.dropoffAddress || '-'}${ord.dropoffDetail ? ' (' + ord.dropoffDetail + ')' : ''}</div>
          <div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Rute Perjalanan:</b> ${formatKm(ord.distanceKm)}</div>
          ${ord.customerNotes ? `<div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Catatan:</b> ${ord.customerNotes}</div>` : ''}
        </div>
      </div>
    `;
  } else if (ord.type === 'SERVICE') {
    routeAndOrderInfoHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Informasi Bantuan Servis
        </div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Kategori:</b> ${ord.serviceCategory || '-'}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Deskripsi Kerusakan/Tugas:</b> ${ord.workDescription || '-'}</div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Lokasi Rumah/Tugas:</b> ${ord.taskAddress || '-'}${ord.taskDetail ? ' (' + ord.taskDetail + ')' : ''}</div>
        ${ord.customerNotes ? `<div style="font-size: 0.72rem; color: #475569;"><b>Catatan Tambahan:</b> ${ord.customerNotes}</div>` : ''}
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

    routeAndOrderInfoHtml = `
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 6px; padding: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.74rem; font-weight: 800; color: var(--text-main); margin-bottom: 8px; text-transform: uppercase;">
          Informasi Penjemputan & Pengantaran Paket
        </div>
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Kategori Paket:</b> ${ord.deliveryCategory || 'Dokumen'}</div>
        ${ord.itemDescription ? `<div style="font-size: 0.72rem; color: #475569; margin-bottom: 4px;"><b>Deskripsi Barang:</b> ${ord.itemDescription}</div>` : ''}
        <div style="font-size: 0.72rem; color: #475569; margin-bottom: 6px;">
          <b>Titik Jemput:</b> ${ord.pickupAddress || '-'}${ord.pickupDetail ? ' (' + ord.pickupDetail + ')' : ''}
        </div>
        ${stopsHtml}
        <div style="font-size: 0.72rem; color: #475569; margin-top: 4px; padding-top: 4px; border-top: 1px solid #F1F5F9;">
          <b>Total Jarak Rute Jalan:</b> ${formatKm(ord.distanceKm)}
        </div>
        ${ord.customerNotes ? `<div style="font-size: 0.72rem; color: #475569; margin-top: 2px;"><b>Catatan Pengirim:</b> ${ord.customerNotes}</div>` : ''}
      </div>
    `;
  }

  // 2. Mitra Bertugas
  let driverInfoHtml = '';
  if (ord.driverName) {
    driverInfoHtml = `
      <div style="background: #F1F5F9; border: 1px solid #CBD5E1; border-radius: 6px; padding: 10px; margin-bottom: 10px; font-size: 0.74rem;">
        <b>Mitra Bertugas:</b> ${ord.driverName} &bull; Telp: <b>${ord.driverPhone || '-'}</b>
      </div>
    `;
  }

  // 3. Struk Pembayaran Terpadu (Unified Billing Receipt)
  const unifiedReceiptHtml = renderUnifiedBillingReceipt(ord, 'CUSTOMER');

  // 4. Panel Persetujuan jika AWAITING_CUSTOMER_APPROVAL
  let approvalActionHtml = '';
  if (ord.status === 'AWAITING_CUSTOMER_APPROVAL') {
    approvalActionHtml = `
      <div style="margin-top: 12px; padding: 12px; background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px;">
        <div style="font-weight: 800; font-size: 0.8rem; color: #92400E; margin-bottom: 6px;">
          Konfirmasi Persetujuan Biaya Servis
        </div>
        <p style="font-size: 0.74rem; color: #78350F; margin-bottom: 10px; line-height: 1.4;">
          Teknisi telah menyelesaikan pemeriksaan di lokasi dan mengajukan total tagihan perbaikan sebesar <b>${formatRp(ord.totalAmount)}</b>. Silakan periksa rincian pada struk pembayaran di atas sebelum menyetujui.
        </p>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-primary" style="flex: 1; min-height: 44px;" onclick="approveServiceQuoteFromModal('${ord.id}')">
            Setujui Biaya & Kerjakan
          </button>
          <button type="button" style="background: #DC2626; color: white; border: none; border-radius: var(--radius-sm); padding: 10px 14px; font-weight: 700; font-size: 0.78rem; cursor: pointer; min-height: 44px;" onclick="rejectServiceQuoteFromModal('${ord.id}')">
            Tolak (Batal)
          </button>
        </div>
      </div>
    `;
  } else if (ord.status === 'SERVICE_REJECTED') {
    approvalActionHtml = `
      <div style="margin-top: 10px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 10px; font-size: 0.74rem; color: #991B1B; line-height: 1.35;">
        <b>Penawaran Ditolak:</b> Pekerjaan servis dibatalkan. Tagihan tunai yang dibayarkan ke kurir/tukang hanya Biaya Kedatangan & Pengecekan Dasar sebesar <b>${formatRp(ord.serviceBaseInspectionFee || 15000)}</b>.
      </div>
    `;
  }

  bodyEl.innerHTML = `
    ${routeAndOrderInfoHtml}
    ${driverInfoHtml}
    ${unifiedReceiptHtml}
    ${approvalActionHtml}
  `;

  modal.style.display = 'flex';
}

function closeCustomerOrderModal() {
  const modal = document.getElementById('customerOrderDetailModal');
  if (modal) modal.style.display = 'none';
}

function approveServiceQuoteFromModal(orderId) {
  approveServiceQuote(orderId);
  openCustomerOrderModal(orderId);
}

function rejectServiceQuoteFromModal(orderId) {
  rejectServiceQuote(orderId);
  openCustomerOrderModal(orderId);
}

// Global scope bindings
window.setServiceHours = setServiceHours;
window.applyShopPreset = applyShopPreset;
window.applyServicePreset = applyServicePreset;
window.applyDelPreset = applyDelPreset;
window.renderCustomerOrders = renderCustomerOrders;

window.openLocationPicker = openLocationPicker;
window.closeLocationPicker = closeLocationPicker;
window.setPickerLocation = setPickerLocation;
window.confirmPickedLocation = confirmPickedLocation;
window.toggleExtraStore = toggleExtraStore;
window.toggleExtraDeliveryStop = toggleExtraDeliveryStop;
window.toggleRouteAccordion = toggleRouteAccordion;
window.clearPickerSearch = clearPickerSearch;
window.locateUserGpsPosition = locateUserGpsPosition;
window.selectSearchResult = selectSearchResult;
window.selectOnlineSearchResult = selectOnlineSearchResult;
window.approveServiceQuote = approveServiceQuote;
window.rejectServiceQuote = rejectServiceQuote;
window.openCustomerOrderModal = openCustomerOrderModal;
window.closeCustomerOrderModal = closeCustomerOrderModal;
window.approveServiceQuoteFromModal = approveServiceQuoteFromModal;
window.rejectServiceQuoteFromModal = rejectServiceQuoteFromModal;



