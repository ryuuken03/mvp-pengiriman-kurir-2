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

    // 3. Servis & Jasa Bantuan (Skema Opsi 1)
    serviceBaseInspectionFee: 15000, // Biaya transport kedatangan & pengecekan dasar di lokasi
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
function calculateShoppingFee(distanceKm, shoppingEstimate = 0, state = null, storeCount = 1) {
  const currentState = state || loadSharedState();
  const rules = currentState.pricingRules || LOKALKIRIM_V2_INITIAL_DATA.pricingRules;
  const dist = Math.max(1, Number(distanceKm) || 1);
  const count = Math.max(1, Number(storeCount) || 1);

  const baseServiceFeePerStore = Number(rules.shoppingServiceFee || 5000);
  const serviceFee = baseServiceFeePerStore * count;
  const deliveryFee = Math.round(dist * Number(rules.shoppingPerKm || 2500));
  const totalServiceAndDelivery = serviceFee + deliveryFee;

  const platformFee = Math.max(
    Number(rules.platformFeeMin || 1000),
    Math.round(totalServiceAndDelivery * ((rules.platformFeePercent || 15) / 100))
  );
  const driverNetEarnings = totalServiceAndDelivery - platformFee;
  const goodsCost = Number(shoppingEstimate) || 0;
  const totalCustomerPay = goodsCost + totalServiceAndDelivery;

  const storeText = count > 1 ? `Jasa Beli (${count} Toko: ${formatRp(serviceFee)})` : `Jasa Beli ${formatRp(serviceFee)}`;

  return {
    serviceFee,
    deliveryFee,
    totalServiceAndDelivery,
    shoppingEstimate: goodsCost,
    totalCustomerPay,
    platformFee,
    driverNetEarnings,
    storeCount: count,
    calculationNote: `${storeText} + Antar ${dist} km (${formatRp(deliveryFee)})`
  };
}

/**
 * 2. Kalkulator Servis & Jasa Bantuan (Skema Opsi 1: Biaya Cek Dasar + Penawaran Biaya di Lokasi)
 * Biaya Dasar (Pengecekan/Kedatangan): serviceBaseInspectionFee (Rp 15.000)
 * Biaya Jasa Servis Riil: laborQuote (ditentukan oleh mitra/tukang di tempat, default 0 jika belum diajukan)
 */
function calculateServiceFee(baseFee = null, laborQuote = 0, state = null) {
  const currentState = state || loadSharedState();
  const rules = currentState.pricingRules || LOKALKIRIM_V2_INITIAL_DATA.pricingRules;

  const inspectionFee = baseFee !== null ? Number(baseFee) : Number(rules.serviceBaseInspectionFee || 15000);
  const laborCost = Math.max(0, Number(laborQuote) || 0);
  const totalFee = inspectionFee + laborCost;

  const platformFee = Math.max(
    Number(rules.platformFeeMin || 1000),
    Math.round(totalFee * ((rules.platformFeePercent || 15) / 100))
  );
  const driverNetEarnings = totalFee - platformFee;

  const note = laborCost > 0
    ? `Biaya Pengecekan (${formatRp(inspectionFee)}) + Jasa Servis Disetujui (${formatRp(laborCost)})`
    : `Biaya Kedatangan & Cek Lokasi (${formatRp(inspectionFee)}) [Biaya jasa perbaikan disepakati di lokasi]`;

  return {
    inspectionFee,
    laborCost,
    totalFee,
    totalCustomerPay: totalFee,
    platformFee,
    driverNetEarnings,
    calculationNote: note
  };
}

/**
 * 3. Kalkulator Antar / Kurir P2P (Point-to-Point)
 * Biaya = Max(Tarif Dasar Min, Jarak × Tarif per KM) + Biaya Tambahan Titik Singgah (jika ada)
 */
function calculateDeliveryFee(distanceKm, state = null, extraStops = 0) {
  const currentState = state || loadSharedState();
  const rules = currentState.pricingRules || LOKALKIRIM_V2_INITIAL_DATA.pricingRules;
  const dist = Math.max(1, Number(distanceKm) || 1);
  const stops = Math.max(0, Number(extraStops) || 0);

  const baseFare = Number(rules.deliveryBaseFare || 8000);
  const perKm = Number(rules.deliveryPerKm || 2500);
  const rawFare = Math.round(dist * perKm);
  const stopSurcharge = stops * 3000; // Biaya singgah per titik Rp 3.000
  const totalFee = Math.max(baseFare, rawFare) + stopSurcharge;

  const platformFee = Math.max(
    Number(rules.platformFeeMin || 1000),
    Math.round(totalFee * ((rules.platformFeePercent || 15) / 100))
  );
  const driverNetEarnings = totalFee - platformFee;

  let note = rawFare > baseFare
    ? `${dist} km × ${formatRp(perKm)}/km`
    : `Tarif Dasar Minimum (s.d. 3 km)`;

  if (stops > 0) {
    note += ` + ${stops} Titik Singgah (${formatRp(stopSurcharge)})`;
  }

  return {
    distanceKm: dist,
    totalFee,
    totalCustomerPay: totalFee,
    platformFee,
    driverNetEarnings,
    extraStops: stops,
    stopSurcharge,
    calculationNote: note
  };
}

// =========================================================================
// 5. GENERATOR PESAN WHATSAPP TERFORMAT (STANDAR RESMI)
// =========================================================================
function buildWhatsAppOrderDraft(order) {
  const lines = [
    'Halo Bantal Malang, saya mau konfirmasi pesanan:',
    ''
  ];

  if (order.type === 'SHOPPING') {
    lines.push(`Layanan: Minta Dibelikan (#${order.id})`);
    if (order.stores && order.stores.length > 1) {
      lines.push(`Jumlah Toko: ${order.stores.length} Tempat Pembelian`);
      order.stores.forEach((st, idx) => {
        lines.push(`- Toko ${idx + 1}: ${st.name || '-'} (${st.address || '-'})`);
        if (st.detail) lines.push(`  Patokan: ${st.detail}`);
        if (st.items) lines.push(`  Barang: ${st.items}`);
      });
    } else {
      lines.push(`Tempat Beli: ${order.storeName || '-'}`);
      if (order.storeDetail) lines.push(`Patokan Toko: ${order.storeDetail}`);
      lines.push(`Daftar Barang: ${order.shoppingList || '-'}`);
    }
    lines.push(`Estimasi Talangan: ${formatRp(order.shoppingEstimate)}`);
    lines.push(`Ongkir & Jasa: ${formatRp(order.totalServiceAndDelivery)}`);
    lines.push(`Alamat Antar: ${order.dropoffAddress || '-'}`);
    if (order.dropoffDetail) lines.push(`Patokan Rumah: ${order.dropoffDetail}`);
    lines.push(`Total Tagihan COD: ${formatRp(order.totalAmount)}`);
  } else if (order.type === 'SERVICE') {
    lines.push(`Layanan: Servis & Bantuan (#${order.id})`);
    lines.push(`Kategori: ${order.serviceCategory || 'Servis / Bantuan'}`);
    lines.push(`Biaya Cek & Transport: ${formatRp(order.serviceBaseInspectionFee || 15000)}`);
    if (order.serviceQuoteItems && order.serviceQuoteItems.length > 0) {
      lines.push(`Rincian Jasa & Suku Cadang (${order.serviceQuoteItems.length} Item):`);
      order.serviceQuoteItems.forEach(it => {
        lines.push(`- ${it.name}: ${formatRp(it.cost)}`);
      });
      lines.push(`Subtotal Jasa & Part: ${formatRp(order.serviceLaborCost)}`);
      lines.push(`Total Tagihan Disetujui: ${formatRp(order.totalAmount)}`);
    } else if (order.serviceLaborCost && order.serviceLaborCost > 0) {
      lines.push(`Biaya Jasa Servis: ${formatRp(order.serviceLaborCost)}`);
      if (order.serviceQuoteNote) lines.push(`Rincian Servis: ${order.serviceQuoteNote}`);
      lines.push(`Total Tagihan Disetujui: ${formatRp(order.totalAmount)}`);
    } else {
      lines.push(`Biaya Jasa Servis: Ditentukan & Disepakati di Lokasi`);
      lines.push(`Total Tagihan Awal: ${formatRp(order.totalAmount || 15000)}`);
    }
    lines.push(`Deskripsi Pekerjaan: ${order.workDescription || '-'}`);
    lines.push(`Lokasi Tugas: ${order.taskAddress || '-'}`);
    if (order.taskDetail) lines.push(`Patokan Lokasi: ${order.taskDetail}`);
  } else {
    // DELIVERY
    lines.push(`Layanan: Antar / Kurir P2P (#${order.id})`);
    lines.push(`Kategori: ${order.deliveryCategory || 'Barang / Dokumen'}`);
    lines.push(`Titik Jemput: ${order.pickupAddress || '-'}`);
    if (order.pickupDetail) lines.push(`Patokan Jemput: ${order.pickupDetail}`);

    if (order.stops && order.stops.length > 1) {
      lines.push(`Titik Pengantaran: ${order.stops.length} Lokasi`);
      order.stops.forEach((st, idx) => {
        lines.push(`- Tujuan ${idx + 1}: ${st.recipientName || 'Penerima'} (${st.address || '-'})`);
        if (st.detail) lines.push(`  Patokan: ${st.detail}`);
      });
    } else {
      lines.push(`Titik Antar: ${order.dropoffAddress || '-'}`);
      if (order.dropoffDetail) lines.push(`Patokan Antar: ${order.dropoffDetail}`);
    }
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
  } catch (e) { }
  const fresh = JSON.parse(JSON.stringify(LOKALKIRIM_V2_INITIAL_DATA));
  saveSharedState(fresh, true, 'RESET_ALL');
  return fresh;
}

// =========================================================================
// 7. KOMPONEN STRUK & RINCIAN PEMBAYARAN TERPADU (UNIFIED BILLING RECEIPT)
// =========================================================================
function renderUnifiedBillingReceipt(ord, role = 'CUSTOMER') {
  if (!ord) return '';

  let itemRowsHtml = '';

  if (ord.type === 'SHOPPING') {
    const isMultiStore = ord.stores && ord.stores.length > 1;
    let storeDetails = '';
    if (isMultiStore) {
      storeDetails = ord.stores.map((st, i) => `
        <div class="receipt-item-sub">
          <span>&bull; Toko ${i + 1} (${st.name}): ${st.items || '-'}</span>
        </div>
      `).join('');
    } else {
      storeDetails = `
        <div class="receipt-item-sub">
          <span>&bull; ${ord.storeName || 'Toko'}: ${ord.shoppingList || '-'}</span>
        </div>
      `;
    }

    itemRowsHtml = `
      <div class="receipt-section-title">Barang Belanjaan (Dana Talangan):</div>
      ${storeDetails}
      <div class="receipt-row">
        <span>Uang Talangan Kasir:</span>
        <span class="receipt-val">${formatRp(ord.shoppingEstimate || 0)}</span>
      </div>
      <div class="receipt-divider"></div>
      <div class="receipt-section-title">Biaya Pengantaran & Layanan:</div>
      <div class="receipt-row">
        <span>Jasa Beli (${isMultiStore ? ord.stores.length + ' Toko' : '1 Toko'}):</span>
        <span class="receipt-val">${formatRp(ord.serviceFee || 5000)}</span>
      </div>
      <div class="receipt-row">
        <span>Ongkos Kirim Rute OSRM (${formatKm(ord.distanceKm)}):</span>
        <span class="receipt-val">${formatRp(ord.shippingFee || 0)}</span>
      </div>
    `;
  } else if (ord.type === 'SERVICE') {
    let itemsDetailHtml = '';
    if (ord.serviceQuoteItems && ord.serviceQuoteItems.length > 0) {
      itemsDetailHtml = ord.serviceQuoteItems.map(it => `
        <div class="receipt-row receipt-indent">
          <span>&bull; ${it.name}:</span>
          <span class="receipt-val">${formatRp(it.cost)}</span>
        </div>
      `).join('');
    } else if (ord.serviceLaborCost && ord.serviceLaborCost > 0) {
      itemsDetailHtml = `
        <div class="receipt-row receipt-indent">
          <span>&bull; ${ord.serviceQuoteNote || 'Jasa Servis & Perbaikan'}:</span>
          <span class="receipt-val">${formatRp(ord.serviceLaborCost)}</span>
        </div>
      `;
    } else {
      itemsDetailHtml = `
        <div class="receipt-row receipt-indent" style="color: var(--text-muted); font-style: italic;">
          <span>&bull; Biaya Jasa Servis:</span>
          <span>Ditentukan di Lokasi</span>
        </div>
      `;
    }

    itemRowsHtml = `
      <div class="receipt-section-title">Biaya Pemeriksaan & Kedatangan:</div>
      <div class="receipt-row">
        <span>Biaya Kedatangan & Cek Dasar:</span>
        <span class="receipt-val">${formatRp(ord.serviceBaseInspectionFee || 15000)}</span>
      </div>
      <div class="receipt-divider"></div>
      <div class="receipt-section-title">Rincian Pekerjaan Jasa & Suku Cadang:</div>
      ${itemsDetailHtml}
      ${ord.serviceLaborCost > 0 ? `
        <div class="receipt-row" style="font-weight: 700; margin-top: 4px;">
          <span>Subtotal Jasa & Part:</span>
          <span class="receipt-val">${formatRp(ord.serviceLaborCost)}</span>
        </div>
      ` : ''}
    `;
  } else {
    // DELIVERY
    itemRowsHtml = `
      <div class="receipt-section-title">Rincian Pengantaran Kurir:</div>
      <div class="receipt-row">
        <span>Ongkir Jarak Rute OSRM (${formatKm(ord.distanceKm)}):</span>
        <span class="receipt-val">${formatRp((ord.shippingFee || ord.totalAmount) - (ord.hasExtraDeliveryStop ? 3000 : 0))}</span>
      </div>
      ${ord.hasExtraDeliveryStop ? `
        <div class="receipt-row">
          <span>Biaya Titik Singgah Tambahan (Penerima 1):</span>
          <span class="receipt-val">${formatRp(3000)}</span>
        </div>
      ` : ''}
    `;
  }

  // Bagian Total Konsumen
  const grandTotalBlock = `
    <div class="receipt-total-box">
      <div class="receipt-total-row">
        <span>Total Tagihan Konsumen (COD):</span>
        <span class="receipt-total-val">${formatRp(ord.totalAmount)}</span>
      </div>
      <div class="receipt-payment-method">Metode Pembayaran: Tunai di Tempat (COD)</div>
    </div>
  `;

  // Bagian Tambahan untuk Driver (Potongan Aplikasi & Hak Bersih)
  let driverFinancialsBlock = '';
  if (role === 'DRIVER') {
    driverFinancialsBlock = `
      <div class="receipt-driver-box" style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; padding: 10px; margin-top: 10px;">
        <div style="font-weight: 800; font-size: 0.74rem; color: #065F46; margin-bottom: 6px;">
          Rincian Finansial & Bagi Hasil Mitra:
        </div>
        <div class="receipt-row">
          <span>Uang Kas Diterima dari Konsumen (COD):</span>
          <span class="receipt-val" style="font-weight: 800;">${formatRp(ord.totalAmount)}</span>
        </div>
        <div class="receipt-row" style="color: #DC2626;">
          <span>Potongan Biaya Aplikasi Platform (15%):</span>
          <span class="receipt-val" style="font-weight: 800; color: #DC2626;">- ${formatRp(ord.platformFee || 0)}</span>
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-row" style="color: #059669; font-size: 0.84rem; font-weight: 800;">
          <span>Hak Pendapatan Bersih Mitra:</span>
          <span class="receipt-val" style="color: #059669; font-size: 0.95rem;">+ ${formatRp(ord.driverShare || 0)}</span>
        </div>
        <div style="font-size: 0.68rem; color: #047857; margin-top: 4px; line-height: 1.3;">
          Total kas COD ${formatRp(ord.totalAmount)} masuk ke dompet kas Anda, dengan kewajiban setoran komisi platform ${formatRp(ord.platformFee || 0)}.
        </div>
      </div>
    `;
  }

  // Bagian Tambahan untuk Admin (Audit Komisi Platform & Hak Driver)
  let adminFinancialsBlock = '';
  if (role === 'ADMIN') {
    adminFinancialsBlock = `
      <div class="receipt-admin-box" style="background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 6px; padding: 10px; margin-top: 10px;">
        <div style="font-weight: 800; font-size: 0.74rem; color: #3730A3; margin-bottom: 6px;">
          Buku Besar Finansial & Bagi Hasil Platform:
        </div>
        <div class="receipt-row">
          <span>Nilai Transaksi Bruto (Gross GMV):</span>
          <span class="receipt-val" style="font-weight: 800;">${formatRp(ord.totalAmount)}</span>
        </div>
        ${ord.shoppingEstimate ? `
          <div class="receipt-row" style="color: var(--text-muted);">
            <span>Dana Talangan Belanja Kasir:</span>
            <span class="receipt-val">${formatRp(ord.shoppingEstimate)}</span>
          </div>
        ` : ''}
        <div class="receipt-row" style="color: #1E40AF; font-size: 0.82rem; font-weight: 800;">
          <span>Penerimaan Biaya Aplikasi (Kas Platform):</span>
          <span class="receipt-val" style="color: #1E40AF;">+ ${formatRp(ord.platformFee || 0)}</span>
        </div>
        <div class="receipt-row" style="color: #059669; font-size: 0.82rem; font-weight: 800;">
          <span>Hak Bersih Mitra Kurir:</span>
          <span class="receipt-val" style="color: #059669;">+ ${formatRp(ord.driverShare || 0)}</span>
        </div>
        <div style="font-size: 0.68rem; color: #4338CA; margin-top: 4px; line-height: 1.3;">
          Status Kas: Tercatat pada kas COD ditangan mitra (${ord.driverName || 'Belum Ditugaskan'}).
        </div>
      </div>
    `;
  }

  return `
    <div class="unified-receipt-card">
      <div class="receipt-card-header">
        <span class="receipt-card-title">Struk & Rincian Pembayaran</span>
        <span class="receipt-order-id">#${ord.id}</span>
      </div>
      <div class="receipt-card-body">
        ${itemRowsHtml}
        ${grandTotalBlock}
        ${driverFinancialsBlock}
        ${adminFinancialsBlock}
      </div>
    </div>
  `;
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
  window.renderUnifiedBillingReceipt = renderUnifiedBillingReceipt;
}
