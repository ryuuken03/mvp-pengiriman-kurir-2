/**
 * MTM Sidoarjo v2.0 - Simulator Hub Controller
 * Mengatur tampilan 3 frame terpadu (Customer, Driver, Admin)
 * dan menjalankan 3 skenario simulasi otomatis:
 * 1. Minta Dibelikan (Jastip Bebas Warung PKL dengan Talangan)
 * 2. Servis & Bantuan (Jasa Bersih-bersih 2 Jam)
 * 3. Antar / Kurir P2P (Kirim Dokumen Cepat ke Buduran)
 */

document.addEventListener('DOMContentLoaded', () => {
  initViewSwitcher();
  initDemoButtons();
  initResetButton();
});

// =========================================================================
// 1. VIEWPORT SWITCHER
// =========================================================================
function initViewSwitcher() {
  const stage = document.getElementById('simulatorStage');
  const btns = document.querySelectorAll('.view-btn');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const view = btn.getAttribute('data-view');
      stage.className = `simulator-stage view-${view}`;
      showToast(`Beralih ke tampilan: ${btn.textContent}`);
    });
  });
}

// =========================================================================
// 2. QUICK DEMO SCENARIOS (3 PILAR MTM)
// =========================================================================
function initDemoButtons() {
  document.getElementById('btnDemoShopping')?.addEventListener('click', runDemoShopping);
  document.getElementById('btnDemoService')?.addEventListener('click', runDemoService);
  document.getElementById('btnDemoDelivery')?.addEventListener('click', runDemoDelivery);
}

/**
 * DEMO 1: Minta Dibelikan (Personal Shopper Bebek Goreng)
 */
function runDemoShopping() {
  showToast('Memulai Demo 1: Minta Dibelikan Bebek Goreng di Warung PKL...');
  const s = loadSharedState();
  const feeInfo = calculateShoppingFee(3.5, 55000, s);

  const newOrder = {
    id: 'MTM-' + Math.floor(1000 + Math.random() * 9000),
    type: 'SHOPPING',
    orderTypeLabel: 'Minta Dibelikan',
    customerName: 'Rian Pratama',
    customerPhone: '0812-3456-7890',
    storeName: 'Bebek Goreng H. Slamet',
    storeAddress: 'Jl. Taman Pinang Indah No. 8, Sidoarjo',
    storeCoords: [-7.4439, 112.7058],
    pickupCoords: [-7.4439, 112.7058],
    dropoffCoords: [-7.4485, 112.7160],
    shoppingList: '2 Porsi Bebek Goreng Kremes + 2 Nasi Putih + Sambal dipisah',
    shoppingEstimate: 55000,
    serviceFee: feeInfo.serviceFee,
    shippingFee: feeInfo.deliveryFee,
    totalServiceAndDelivery: feeInfo.totalServiceAndDelivery,
    platformFee: feeInfo.platformFee,
    driverShare: feeInfo.driverNetEarnings,
    dropoffAddress: 'Jl. Pahlawan No. 15, Sidoarjo Kota',
    distanceKm: 3.5,
    totalAmount: feeInfo.totalCustomerPay,
    paymentMethod: 'COD (Talangan Tunai)',
    customerNotes: 'Bebek minta bagian paha ya mas',
    status: 'WAITING_DRIVER',
    createdAt: new Date().toISOString()
  };

  s.orders.unshift(newOrder);
  s.activeOrderId = newOrder.id;
  saveSharedState(s, true, 'DEMO_SHOPPING_CREATED');
  reloadAllIframes();

  setTimeout(() => {
    showToast('Mitra Budi Santoso menerima tugas belanja & membawa talangan Rp 55.000!');
    const s2 = loadSharedState();
    const ord = s2.orders.find(o => o.id === newOrder.id);
    const drv = s2.drivers[0];
    if (ord && drv) {
      ord.status = 'GOING_TO_PICKUP';
      ord.driverId = drv.id;
      ord.driverName = drv.name;
      ord.driverPhone = drv.phone;
      ord.driverVehicle = drv.vehicle;
      ord.driverPlate = drv.plateNumber;
      saveSharedState(s2, true, 'DEMO_DRIVER_ACCEPTED');
      reloadAllIframes();
    }
  }, 2200);
}

/**
 * DEMO 2: Servis & Jasa Bantuan (Bersih-bersih Rumah 2 Jam)
 */
function runDemoService() {
  showToast('Memulai Demo 2: Pemesanan Jasa Tenaga Bersih-bersih 2 Jam...');
  const s = loadSharedState();
  const feeInfo = calculateServiceFee(2, s);

  const newOrder = {
    id: 'SRV-' + Math.floor(1000 + Math.random() * 9000),
    type: 'SERVICE',
    orderTypeLabel: 'Servis & Bantuan Tenaga',
    customerName: 'Ibu Ratna Dewi',
    customerPhone: '0813-8899-2211',
    serviceCategory: 'Bersih-bersih Rumah / Gudang',
    taskAddress: 'Perumahan Taman Pinang Indah Blok B-4, Sidoarjo',
    taskCoords: [-7.4439, 112.7058],
    dropoffCoords: [-7.4439, 112.7058],
    workDescription: 'Bantu sapu, pel, dan rapikan kardus di ruang gudang belakang lantai 1',
    durationHours: 2,
    hourlyRate: feeInfo.hourlyRate,
    platformFee: feeInfo.platformFee,
    driverShare: feeInfo.driverNetEarnings,
    totalAmount: feeInfo.totalCustomerPay,
    paymentMethod: 'Tunai di Tempat',
    customerNotes: 'Peralatan sapu dan pel sudah disiapkan di lokasi',
    status: 'WAITING_DRIVER',
    createdAt: new Date().toISOString()
  };

  s.orders.unshift(newOrder);
  s.activeOrderId = newOrder.id;
  saveSharedState(s, true, 'DEMO_SERVICE_CREATED');
  reloadAllIframes();

  setTimeout(() => {
    showToast('Mitra Budi Santoso menerima tugas jasa bantuan & menuju rumah pelanggan!');
    const s2 = loadSharedState();
    const ord = s2.orders.find(o => o.id === newOrder.id);
    const drv = s2.drivers[0];
    if (ord && drv) {
      ord.status = 'GOING_TO_PICKUP';
      ord.driverId = drv.id;
      ord.driverName = drv.name;
      ord.driverPhone = drv.phone;
      ord.driverVehicle = drv.vehicle;
      ord.driverPlate = drv.plateNumber;
      saveSharedState(s2, true, 'DEMO_DRIVER_ACCEPTED');
      reloadAllIframes();
    }
  }, 2200);
}

/**
 * DEMO 3: Antar / Kirim Paket Dokumen P2P
 */
function runDemoDelivery() {
  showToast('Memulai Demo 3: Kirim Dokumen Penting P2P ke Buduran (4,5 km)...');
  const s = loadSharedState();
  const feeInfo = calculateDeliveryFee(4.5, s);

  const newOrder = {
    id: 'KRM-' + Math.floor(1000 + Math.random() * 9000),
    type: 'DELIVERY',
    orderTypeLabel: 'Antar / Kurir P2P',
    customerName: 'Bambang Sudiro',
    customerPhone: '0812-4455-6677',
    recipientName: 'Indah Kusuma',
    recipientPhone: '0857-9900-1122',
    pickupAddress: 'Jl. Pahlawan No. 20, Sidoarjo Kota',
    pickupCoords: [-7.4485, 112.7160],
    dropoffAddress: 'Perumahan Buduran Asri Blok C-2, Buduran',
    dropoffCoords: [-7.4305, 112.7295],
    deliveryCategory: 'Dokumen / Surat Penting',
    itemDescription: 'Dokumen Sertifikat & Akta Notaris dalam map plastik',
    distanceKm: 4.5,
    shippingFee: feeInfo.totalFee,
    platformFee: feeInfo.platformFee,
    driverShare: feeInfo.driverNetEarnings,
    totalAmount: feeInfo.totalCustomerPay,
    paymentMethod: 'COD / Tunai',
    customerNotes: 'Harap dijaga agar tidak basah karena musim hujan',
    status: 'WAITING_DRIVER',
    createdAt: new Date().toISOString()
  };

  s.orders.unshift(newOrder);
  s.activeOrderId = newOrder.id;
  saveSharedState(s, true, 'DEMO_DELIVERY_CREATED');
  reloadAllIframes();

  setTimeout(() => {
    showToast('Mitra Budi Santoso menerima pengantaran dokumen & menuju titik jemput!');
    const s2 = loadSharedState();
    const ord = s2.orders.find(o => o.id === newOrder.id);
    const drv = s2.drivers[0];
    if (ord && drv) {
      ord.status = 'GOING_TO_PICKUP';
      ord.driverId = drv.id;
      ord.driverName = drv.name;
      ord.driverPhone = drv.phone;
      ord.driverVehicle = drv.vehicle;
      ord.driverPlate = drv.plateNumber;
      saveSharedState(s2, true, 'DEMO_DRIVER_ACCEPTED');
      reloadAllIframes();
    }
  }, 2200);
}

// =========================================================================
// 3. RESET HANDLER & UTILITIES
// =========================================================================
function initResetButton() {
  const btn = document.getElementById('btnResetAll');
  if (btn) {
    btn.addEventListener('click', () => {
      if (confirm('Apakah Anda yakin ingin mereset seluruh data simulasi ke kondisi awal bawaan?')) {
        resetAllDataToDefault();
        reloadAllIframes();
        showToast('Data ekosistem telah direset ke standar awal pabrik.');
      }
    });
  }
}

function reloadAllIframes() {
  const iframes = ['iframeCustomer', 'iframeDriver', 'iframeAdmin'];
  iframes.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.contentWindow) {
      try {
        el.contentWindow.location.reload();
      } catch (e) {}
    }
  });
}

function showToast(msg) {
  const toast = document.getElementById('toastBox');
  if (toast) {
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3200);
  }
}
