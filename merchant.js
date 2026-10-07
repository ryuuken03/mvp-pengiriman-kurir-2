/**
 * LokalKirim v2.0 - Merchant Logic
 * Mengelola pesanan sembako masuk, penyiapan pesanan, panggil kurir terdekat, dan omset toko
 */

let activeMerchantId = 'toko-berkah';

document.addEventListener('DOMContentLoaded', () => {
  initMerchantSwitcher();
  initStoreToggle();
  renderMerchantApp();

  const ch = getSharedBroadcastChannel();
  if (ch) {
    ch.addEventListener('message', () => {
      renderMerchantApp();
    });
  }
  window.addEventListener('storage', () => {
    renderMerchantApp();
  });
});

function initMerchantSwitcher() {
  const switcher = document.getElementById('merchantSwitcher');
  if (switcher) {
    switcher.value = activeMerchantId;
    switcher.addEventListener('change', (e) => {
      activeMerchantId = e.target.value;
      renderMerchantApp();
    });
  }
}

function initStoreToggle() {
  const btn = document.getElementById('btnStoreToggle');
  const label = document.getElementById('storeStatusLabel');

  if (btn) {
    btn.addEventListener('click', () => {
      const s = loadSharedState();
      const m = (s.merchants || []).find(x => x.id === activeMerchantId);
      if (m) {
        m.isOpen = !m.isOpen;
        saveSharedState(s, true, 'MERCHANT_OPEN_TOGGLED');
        renderMerchantApp();
      }
    });
  }
}

function renderMerchantApp() {
  const s = loadSharedState();
  const m = (s.merchants || []).find(x => x.id === activeMerchantId) || s.merchants[0] || LOKALKIRIM_V2_INITIAL_DATA.merchants[0];

  // Header info
  const titleEl = document.getElementById('merchantTitle');
  const addrEl = document.getElementById('merchantAddressText');
  const storeBtn = document.getElementById('btnStoreToggle');
  const storeLabel = document.getElementById('storeStatusLabel');

  if (titleEl) titleEl.textContent = m.name;
  if (addrEl) addrEl.textContent = `${m.address} • ${m.pricingRuleText || 'Tarif Flat'}`;

  if (storeBtn && storeLabel) {
    if (m.isOpen) {
      storeBtn.className = 'store-toggle-btn';
      storeLabel.textContent = 'Toko Buka';
    } else {
      storeBtn.className = 'store-toggle-btn closed';
      storeLabel.textContent = 'Toko Tutup';
    }
  }

  // Orders calculation
  const merchantOrders = (s.orders || []).filter(o => o.merchantId === m.id);
  const pending = merchantOrders.filter(o => o.status === 'WAITING_MERCHANT' || o.status === 'PREPARING');
  const completed = merchantOrders.filter(o => o.status === 'DONE');
  const revenue = completed.reduce((sum, o) => sum + (o.subtotal || 0), 0);

  const pendEl = document.getElementById('pendingOrdersCount');
  const compEl = document.getElementById('completedOrdersCount');
  const revEl = document.getElementById('merchantRevenueText');

  if (pendEl) pendEl.textContent = pending.length;
  if (compEl) compEl.textContent = completed.length;
  if (revEl) revEl.textContent = formatRp(revenue);

  renderMerchantOrders(merchantOrders);
  renderMerchantProducts(m);
}

function renderMerchantOrders(orders) {
  const container = document.getElementById('merchantOrdersQueue');
  if (!container) return;

  const activeOrders = orders.filter(o => o.status !== 'DONE' && o.status !== 'CANCELLED');

  if (activeOrders.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.8rem;">
        Belum ada pesanan sembako baru yang perlu diproses.
      </div>
    `;
    return;
  }

  container.innerHTML = activeOrders.map(order => {
    let statusText = 'Pesanan Baru Masuk';
    let actionBtn = '';

    if (order.status === 'WAITING_MERCHANT') {
      statusText = 'Perlu Dikonfirmasi Toko';
      actionBtn = `
        <button type="button" class="btn-merchant-action" onclick="prepareOrder('${order.id}')">
          Terima & Siapkan Pesanan
        </button>
      `;
    } else if (order.status === 'PREPARING') {
      statusText = 'Sedang Disiapkan Toko';
      actionBtn = `
        <button type="button" class="btn-merchant-action btn-dispatch" onclick="dispatchOrder('${order.id}')">
          Pesanan Siap &bull; Panggil Kurir Terdekat
        </button>
      `;
    } else if (order.status === 'WAITING_DRIVER') {
      statusText = 'Mencari Kurir Terdekat...';
      actionBtn = `
        <div style="font-size: 0.75rem; color: #1D4ED8; font-weight: 700; text-align: center; margin-top: 8px;">
          Pesanan sedang disiarkan ke armada kurir siaga
        </div>
      `;
    } else {
      statusText = `Kurir: ${order.driverName || 'Armada'} (${order.status})`;
    }

    return `
      <div class="order-card-merchant">
        <div class="order-card-header">
          <span style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 800;">#${order.id}</span>
          <span style="font-size: 0.72rem; font-weight: 700; color: #1E3A8A;">${statusText}</span>
        </div>

        <div style="font-size: 0.8rem; margin-bottom: 8px;">
          <div style="font-weight: 700;">Item Belanja:</div>
          <ul style="margin-left: 16px; margin-top: 4px; color: var(--text-secondary); font-size: 0.75rem;">
            ${(order.items || []).map(i => `<li>${i.name} &times; ${i.qty}</li>`).join('')}
          </ul>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; border-top: 1px dashed var(--border); padding-top: 6px; margin-top: 6px;">
          <span>Nilai Produk Toko: <b>${formatRp(order.subtotal)}</b></span>
          <span>Metode: <b>${order.paymentMethod}</b></span>
        </div>

        ${actionBtn}
      </div>
    `;
  }).join('');
}

function renderMerchantProducts(merchant) {
  const container = document.getElementById('merchantProductsList');
  if (!container) return;

  const prods = merchant.products || [];
  container.innerHTML = prods.map(p => `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding: 8px 0; font-size: 0.78rem;">
      <div>
        <div style="font-weight: 700;">${p.name}</div>
        <div style="color: var(--text-muted); font-size: 0.7rem;">${p.unit} &bull; ${p.category}</div>
      </div>
      <div style="font-family: var(--font-mono); font-weight: 800; color: var(--primary);">
        ${formatRp(p.price)}
      </div>
    </div>
  `).join('');
}

window.prepareOrder = function(orderId) {
  const s = loadSharedState();
  const order = (s.orders || []).find(o => o.id === orderId);
  if (order) {
    order.status = 'PREPARING';
    saveSharedState(s, true, 'MERCHANT_ORDER_PREPARING');
    renderMerchantApp();
  }
};

window.dispatchOrder = function(orderId) {
  const s = loadSharedState();
  const order = (s.orders || []).find(o => o.id === orderId);
  if (order) {
    order.status = 'WAITING_DRIVER'; // Siarkan ke driver
    saveSharedState(s, true, 'MERCHANT_ORDER_DISPATCHED');
    renderMerchantApp();
  }
};
