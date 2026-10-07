# MTM Sidoarjo v2.0 (MVP2)
## Ekosistem Jasa Bantuan Lokal & On-Demand Errand Runner

Versi 2.0 (`MVP2`) mengadopsi model operasional **MTM Sidoarjo (Mas Tulong Mas - https://www.mtmsidoarjo.my.id/)**. Sistem dialihkan dari e-commerce katalog toko menjadi **3 Pilar Jasa Bantuan Lokal**:
1. **Minta Dibelikan** (Personal Shopper / Jastip Bebas Warung PKL, Apotek & Makanan dengan sistem talangan tunai kurir).
2. **Servis & Bantuan** (Jasa Tenaga Harian / Hourly Worker: Bersih-bersih rumah/gudang, angkat barang/pindahan ringan, pendampingan aktivitas, dll.).
3. **Antar / Kirim P2P** (Kurir Cepat Point-to-Point antar-warga untuk paket, dokumen penting, atau antar-jemput).

Arsitektur disederhanakan menjadi **3 Aktor Utama** (*Customer $\rightarrow$ Driver/Mitra $\rightarrow$ Admin Dispatcher*), menghilangkan friksi onboarding merchant toko fisik.

---

## 3 Pilar Layanan Utama & Skema Tarif

| Pilar Layanan | Deskripsi Operasional | Rumus Biaya |
| :--- | :--- | :--- |
| **Minta Dibelikan** | Pelanggan memesan makanan di warung tenda/bebas tanpa perlu warung terdaftar. Mitra membayarkan tunai terlebih dahulu di kasir. | Biaya Jasa Beli Flat (`Rp 5.000`) + Ongkir Antar (`Rp 2.500/km`) + Uang Talangan Belanja Riil (diganti saat COD). |
| **Servis & Bantuan** | Penyewaan jasa tenaga kerja harian untuk kebutuhan praktis di rumah atau tempat usaha. | Durasi Jam $\times$ Tarif per Jam (`Rp 17.500/jam`). |
| **Antar / Kirim P2P** | Pengiriman barang pribadi, pakaian, atau dokumen kantor langsung dari titik jemput ke titik tujuan. | Tarif Dasar Minimum (`Rp 8.000` s.d. 3 km) atau Jarak $\times$ `Rp 2.500/km`. |

---

## Struktur Modul & File MVP2

| File | Peran & Deskripsi |
| :--- | :--- |
| **`index.html`** | Panggung Simulator 3 Panel Terpadu (Customer, Driver, Admin) dengan Viewport Switcher & 3 Tombol Demo Otomatis |
| **`style.css`** | Desain panggung simulator responsif |
| **`app.js`** | Pengendali skenario demo interaktif lintas peran |
| **`shared.js`** | Single Source of Truth state bersama, Pricing Engine dinamis, dan Generator WhatsApp resmi |
| **`customer.html` / `.js` / `.css`** | Aplikasi Pelanggan PWA (Formulir 3 pilar layanan, kalkulator estimasi tarif instan, tracking status pesanan) |
| **`driver.html` / `.js` / `.css`** | Aplikasi Mitra Kurir & Pelaksana (Penerimaan tawaran tugas, alur kerja bertahap per jenis layanan, buku kas COD) |
| **`admin.html` / `.js` / `.css`** | Konsol Pengawas & Dispatcher (Pengaturan Dynamic Pricing Engine, radar armada siaga, log buku besar GMV) |

---

## 3 Skenario Pengujian Cepat (Quick Demo)

Pada header bar `MVP2/index.html`, Anda dapat menguji seluruh alur dengan sekali klik:

1. **Demo 1: Minta Dibelikan**
   - Pelanggan memesan 2 porsi bebek goreng di Bebek Slamet dengan estimasi talangan Rp 55.000.
   - Mitra menerima tugas dengan peringatan talangan, membeli di warung, lalu mengantar ke rumah pemesan dan menerima kas COD.
2. **Demo 2: Servis & Bantuan**
   - Pelanggan memesan jasa bersih-bersih gudang selama 2 jam (biaya Rp 35.000).
   - Mitra menerima tugas, menuju lokasi, mulai bekerja, dan menyelesaikan pekerjaan.
3. **Demo 3: Antar Paket P2P**
   - Pelanggan memesan pengiriman dokumen akta notaris penting dari Sidoarjo Kota ke Buduran (4,5 km).
   - Mitra menerima tugas, mengambil dokumen di titik jemput, dan mengantarkannya ke penerima.

---

## Manajemen Status Mitra & Suspensi Admin

1. **Status Kerja Mitra (On / Off di Aplikasi Kurir):**
   - **Siap Terima Order (On):** Mitra online dan siap menerima tugas baru yang masuk di wilayahnya.
   - **Sedang Istirahat (Off):** Mitra menonaktifkan status kerja sementara; notifikasi order dinonaktifkan dan antrean tawaran disembunyikan.

2. **Status Akun & Suspensi (di Konsol Admin):**
   - **Aktif:** Akun mitra dapat beroperasi normal dan bebas berganti status kerja On/Off.
   - **Suspend (Ditangguhkan):** Admin dapat menangguhkan akun mitra langsung dari tabel armada. Saat di-suspend:
     - Status kerja mitra otomatis dimatikan (`Off`).
     - Mitra dilarang menyalakan status kerja (`On`) dan tidak dapat menerima order apapun.
     - Aplikasi Mitra menampilkan banner peringatan suspensi akun.
     - Radar armada siaga di aplikasi pelanggan otomatis mengecualikan mitra yang disuspend.

---

## Kepatuhan Standar AGENTS.md

- **Visual Hygiene & Bebas Emoji:** Seluruh label, judul, tombol, dan status menggunakan teks bersih dan tipografi monokrom tanpa emoji dekoratif.
- **Tipografi Resmi:** Menggunakan *Plus Jakarta Sans* dan *JetBrains Mono*.
- **Bahasa Indonesia Baku & Format Finansial Standar:** Format mata uang `Rp 25.000` dan jarak konsisten `3,5 km`.

