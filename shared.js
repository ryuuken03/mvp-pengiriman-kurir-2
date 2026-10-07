/**
 * GoMitra / LokalKirim v2.0 - Shared State & Master Data Engine
 * Mengadopsi arsitektur MTM Sidoarjo (Mas Tulong Mas):
 * 1. Minta Dibelikan (Personal Shopper / Jastip Bebas Warung & Apotek)
 * 2. Servis & Bantuan (Hourly / Task-Based Worker)
 * 3. Antar / Kurir P2P (Point-to-Point Express)
 * Terintegrasi sinkronisasi realtime 3-aktor (Customer, Driver, Admin)
 * Sesuai standar AGENTS.md: Bebas Emoji, Bahasa Baku, Format Baku.
 */

// =========================================================================
// 1. KONSTANTA STORAGE & BROADCAST
// =========================================================================
const LOKALKIRIM_V2_STORAGE_KEY = 'lokalkirim_v2_mtm_state';
const LOKALKIRIM_V2_CHANNEL_NAME = 'lokalkirim_v2_mtm_channel';

// =========================================================================
// 2. MASTER DATA DEFAULT
// =========================================================================
const LOKALKIRIM_V2_INITIAL_DATA = {
  pricingRules: {
    // 1. Antar / Kurir P2P
    deliveryBaseFare: 8000,
    deliveryPerKm: 2500,
    deliveryMinKm: 3,

    // 2. Minta Dibelikan
    shoppingServiceFee: 5000,
    shoppingPerKm: 2500,

    // 3. Servis & Jasa Bantuan
    serviceHourlyRate: 17500,

    // Bagi Hasil / Biaya Platform
    platformFeePercent: 15, // 15% dari jasa/ongkir
    platformFeeMin: 1000
  },
  driver: {
    id: 'drv-01',
    name: 'Budi Santoso',
    phone: '0812-8877-6655',
    area: 'Sidoarjo Kota',
    vehicle: 'Honda Beat ESP (Hitam)',
    plateNumber: 'W 4821 KLR',
    isOnline: true,
    accountStatus: 'ACTIVE',
    earnings: 0,
    cashHeld: 0
  },
  drivers: [
    {
      id: 'drv-01',
      name: 'Budi Santoso',
      phone: '0812-8877-6655',
      area: 'Sidoarjo Kota',
      vehicle: 'Honda Beat ESP (Hitam)',
      plateNumber: 'W 4821 KLR',
      isOnline: true,
      accountStatus: 'ACTIVE',
      earnings: 0,
      cashHeld: 0
    },
    {
      id: 'drv-02',
      name: 'Agus Priyanto',
      phone: '0857-1122-3344',
      area: 'Waru',
      vehicle: 'Yamaha Vario 125 (Merah)',
      plateNumber: 'W 3910 TZU',
      isOnline: true,
      accountStatus: 'ACTIVE',
      earnings: 0,
      cashHeld: 0
    },
    {
      id: 'drv-03',
      name: 'Dedi Suryana',
      phone: '0813-7766-5544',
      area: 'Buduran',
      vehicle: 'Honda Vario 160 (Putih)',
      plateNumber: 'W 6789 PQR',
      isOnline: true,
      accountStatus: 'ACTIVE',
      earnings: 0,
      cashHeld: 0
    },
    {
      id: 'drv-04',
      name: 'Rudi Hartono',
      phone: '0819-3322-1100',
      area: 'Candi',
      vehicle: 'Yamaha Gear 125 (Biru)',
      plateNumber: 'W 2145 ABC',
      isOnline: true,
      accountStatus: 'ACTIVE',
      earnings: 0,
      cashHeld: 0
    }
  ],
  orders: [],
  activeOrderId: null
};

// =========================================================================
// 3. PERSISTENSI STATE & BROADCAST
// =========================================================================
let sharedChannelInstance = null;

function getSharedBroadcastChannel() {
  if (!sharedChannelInstance && typeof window !== 'undefined' && window.BroadcastChannel) {
    sharedChannelInstance = new BroadcastChannel(LOKALKIRIM_V2_CHANNEL_NAME);
  }
  return sharedChannelInstance;
}

function loadSharedState() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOKALKIRIM_V2_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.drivers || parsed.drivers.length === 0) {
          parsed.drivers = JSON.parse(JSON.stringify(LOKALKIRIM_V2_INITIAL_DATA.drivers));
        }
        parsed.drivers.forEach(d => {
          if (!d.accountStatus) d.accountStatus = 'ACTIVE';
        });
        if (!parsed.driver && parsed.drivers.length > 0) {
          parsed.driver = parsed.drivers[0];
        } else if (parsed.driver && !parsed.driver.accountStatus) {
          parsed.driver.accountStatus = 'ACTIVE';
        }
        if (!parsed.pricingRules) {
          parsed.pricingRules = JSON.parse(JSON.stringify(LOKALKIRIM_V2_INITIAL_DATA.pricingRules));
        }
        if (!parsed.orders) {
          parsed.orders = [];
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Gagal memuat state dari storage:', e);
  }
  return JSON.parse(JSON.stringify(LOKALKIRIM_V2_INITIAL_DATA));
}

function saveSharedState(state, broadcast = true, actionType = 'STATE_UPDATE') {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOKALKIRIM_V2_STORAGE_KEY, JSON.stringify(state));
    }
    if (broadcast) {
      const ch = getSharedBroadcastChannel();
      if (ch) {
        ch.postMessage({ type: 'STATE_UPDATE', payload: state, action: actionType });
      }
    }
  } catch (e) {
    console.error('Gagal menyimpan state:', e);
  }
}

// =========================================================================
// 4. FORMATTER & ENGINE KALKULASI HARGA (3 PILAR MTM)
// =========================================================================
function formatRp(val) {
  return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
}

function formatKm(val) {
  return Number(val || 0).toFixed(1).replace('.', ',') + ' km';
}

/**
 * 1. Kalkulator Minta Dibelikan (Shopping / Jastip Bebas)
 * Biaya = Biaya Jasa Beli Flat + (Jarak × Tarif per KM)
 * Total Bayar Konsumen = Estimasi Talangan Belanja + Ongkir & Jasa
 */
function calculateShoppingFee(distanceKm, shoppingEstimate = 0, state = null) {
  const currentState = state || loadSharedState();
  const rules = currentState.pricingRules || LOKALKIRIM_V2_INITIAL_DATA.pricingRules;
  const dist = Math.max(1, Number(distanceKm) || 1);

  const serviceFee = Number(rules.shoppingServiceFee || 5000);
  const deliveryFee = Math.round(dist * Number(rules.shoppingPerKm || 2500));
  const totalServiceAndDelivery = serviceFee + deliveryFee;

  const platformFee = Math.max(
    Number(rules.platformFeeMin || 1000),
    Math.round(totalServiceAndDelivery * ((rules.platformFeePercent || 15) / 100))
  );
  const driverNetEarnings = totalServiceAndDelivery - platformFee;
  const goodsCost = Number(shoppingEstimate) || 0;
  const totalCustomerPay = goodsCost + totalServiceAndDelivery;

  return {
    serviceFee,
    deliveryFee,
    totalServiceAndDelivery,
    shoppingEstimate: goodsCost,
    totalCustomerPay,
    platformFee,
    driverNetEarnings,
    calculationNote: `Jasa Beli ${formatRp(serviceFee)} + Antar ${dist} km (${formatRp(deliveryFee)})`
  };
}

/**
 * 2. Kalkulator Servis & Jasa Bantuan (Hourly / Task Worker)
 * Biaya = Durasi Jam × Tarif per Jam
 */
function calculateServiceFee(hours = 1, state = null) {
  const currentState = state || loadSharedState();
  const rules = currentState.pricingRules || LOKALKIRIM_V2_INITIAL_DATA.pricingRules;
  const h = Math.max(1, Number(hours) || 1);

  const hourlyRate = Number(rules.serviceHourlyRate || 17500);
  const totalFee = Math.round(h * hourlyRate);

  const platformFee = Math.max(
    Number(rules.platformFeeMin || 1000),
    Math.round(totalFee * ((rules.platformFeePercent || 15) / 100))
  );
  const driverNetEarnings = totalFee - platformFee;

  return {
    hours: h,
    hourlyRate,
    totalFee,
    totalCustomerPay: totalFee,
    platformFee,
    driverNetEarnings,
    calculationNote: `${h} Jam × ${formatRp(hourlyRate)}/jam`
  };
}

/**
 * 3. Kalkulator Antar / Kurir P2P (Point-to-Point)
 * Biaya = Max(Tarif Dasar Min, Jarak × Tarif per KM)
 */
function calculateDeliveryFee(distanceKm, state = null) {
  const currentState = state || loadSharedState();
  const rules = currentState.pricingRules || LOKALKIRIM_V2_INITIAL_DATA.pricingRules;
  const dist = Math.max(1, Number(distanceKm) || 1);

  const baseFare = Number(rules.deliveryBaseFare || 8000);
  const perKm = Number(rules.deliveryPerKm || 2500);
  const rawFare = Math.round(dist * perKm);
  const totalFee = Math.max(baseFare, rawFare);

  const platformFee = Math.max(
    Number(rules.platformFeeMin || 1000),
    Math.round(totalFee * ((rules.platformFeePercent || 15) / 100))
  );
  const driverNetEarnings = totalFee - platformFee;

  const note = rawFare > baseFare
    ? `${dist} km × ${formatRp(perKm)}/km`
    : `Tarif Dasar Minimum (s.d. 3 km)`;

  return {
    distanceKm: dist,
    totalFee,
    totalCustomerPay: totalFee,
    platformFee,
    driverNetEarnings,
    calculationNote: note
  };
}

// =========================================================================
// 5. GENERATOR PESAN WHATSAPP TERFORMAT (STANDAR RESMI)
// =========================================================================
function buildWhatsAppOrderDraft(order) {
  const lines = [
    'Halo MTM Sidoarjo, saya mau konfirmasi pesanan:',
    ''
  ];

  if (order.type === 'SHOPPING') {
    lines.push(`Layanan: Minta Dibelikan (#${order.id})`);
    lines.push(`Tempat Beli: ${order.storeName || '-'}`);
    lines.push(`Daftar Barang: ${order.shoppingList || '-'}`);
    lines.push(`Estimasi Talangan: ${formatRp(order.shoppingEstimate)}`);
    lines.push(`Ongkir & Jasa: ${formatRp(order.totalServiceAndDelivery)}`);
    lines.push(`Alamat Antar: ${order.dropoffAddress || '-'}`);
    lines.push(`Total Tagihan COD: ${formatRp(order.totalAmount)}`);
  } else if (order.type === 'SERVICE') {
    lines.push(`Layanan: Servis & Bantuan (#${order.id})`);
    lines.push(`Kategori: ${order.serviceCategory || 'Bantuan Umum'}`);
    lines.push(`Durasi: ${order.durationHours} Jam`);
    lines.push(`Deskripsi Pekerjaan: ${order.workDescription || '-'}`);
    lines.push(`Lokasi Tugas: ${order.taskAddress || '-'}`);
    lines.push(`Total Biaya: ${formatRp(order.totalAmount)}`);
  } else {
    // DELIVERY
    lines.push(`Layanan: Antar / Kurir P2P (#${order.id})`);
    lines.push(`Kategori: ${order.deliveryCategory || 'Barang / Dokumen'}`);
    lines.push(`Titik Jemput: ${order.pickupAddress || '-'}`);
    lines.push(`Titik Antar: ${order.dropoffAddress || '-'}`);
    lines.push(`Jarak: ${order.distanceKm} km`);
    lines.push(`Total Ongkir: ${formatRp(order.totalAmount)}`);
  }

  if (order.customerNotes) {
    lines.push(`Catatan: ${order.customerNotes}`);
  }
  lines.push('');
  lines.push('Nama Pemesan: ' + (order.customerName || 'Pelanggan'));
  lines.push('No. HP: ' + (order.customerPhone || '-'));
  lines.push('');
  lines.push('Mohon segera diproses. Terima kasih.');

  return `https://wa.me/6289524336693?text=${encodeURIComponent(lines.join('\n'))}`;
}

// =========================================================================
// 6. UTILITY RESET DATA
// =========================================================================
function resetAllDataToDefault() {
  try {
    localStorage.removeItem(LOKALKIRIM_V2_STORAGE_KEY);
  } catch (e) {}
  const fresh = JSON.parse(JSON.stringify(LOKALKIRIM_V2_INITIAL_DATA));
  saveSharedState(fresh, true, 'RESET_ALL');
  return fresh;
}

// Global Exports
if (typeof window !== 'undefined') {
  window.LOKALKIRIM_V2_INITIAL_DATA = LOKALKIRIM_V2_INITIAL_DATA;
  window.LOKALKIRIM_V2_STORAGE_KEY = LOKALKIRIM_V2_STORAGE_KEY;
  window.LOKALKIRIM_V2_CHANNEL_NAME = LOKALKIRIM_V2_CHANNEL_NAME;

  window.loadSharedState = loadSharedState;
  window.saveSharedState = saveSharedState;
  window.getSharedBroadcastChannel = getSharedBroadcastChannel;

  window.formatRp = formatRp;
  window.formatKm = formatKm;
  window.calculateShoppingFee = calculateShoppingFee;
  window.calculateServiceFee = calculateServiceFee;
  window.calculateDeliveryFee = calculateDeliveryFee;
  window.buildWhatsAppOrderDraft = buildWhatsAppOrderDraft;
  window.resetAllDataToDefault = resetAllDataToDefault;
}
