# Bantal Malang v2.0 (MVP2)
## Ekosistem Jasa Bantuan Lokal & On-Demand Errand Runner (Hyperlocal Sidoarjo)

Versi 2.0 (`MVP2`) mengadopsi model operasional riil **MTM Sidoarjo (Mas Tulong Mas - https://www.mtmsidoarjo.my.id/)**. Sistem dialihkan dari e-commerce katalog toko konvensional menjadi **3 Pilar Jasa Bantuan Lokal**:

1. **Minta Dibelikan** (Personal Shopper / Jastip Bebas Warung PKL, Apotek & Sembako dengan sistem talangan tunai kurir).
2. **Servis & Bantuan** (Jasa Tenaga Harian / Hourly Worker: Bersih-bersih rumah/gudang, angkat barang/pindahan ringan, pendampingan aktivitas, dll.).
3. **Antar / Kirim P2P** (Kurir Cepat Point-to-Point antar-warga untuk dokumen penting, paket dagangan, atau antar-jemput).

Arsitektur disederhanakan menjadi **3 Aktor Utama** (*Customer $\rightarrow$ Driver/Mitra $\rightarrow$ Admin Dispatcher*), terintegrasi secara *real-time* menggunakan sinkronisasi `BroadcastChannel` dan `localStorage`.

Dokumen spesifikasi kebutuhan produk resmi dan analisis iterasi berikutnya tersedia pada **[PRD_MVP2.md](file:///c:/Project/solusi.toriq/Zulfiar%20Ryan/Project%20Kurir%20Mirip%20Gojek/PRD_MVP2.md)**.

---

## 3 Pilar Layanan Utama & Skema Tarif

| Pilar Layanan | Deskripsi Operasional | Rumus Biaya Transparan |
| :--- | :--- | :--- |
| **Minta Dibelikan** | Pelanggan memesan makanan/kebutuhan di warung tenda atau toko bebas tanpa syarat pendaftaran merchant. Mendukung **Multi-Toko** (hingga 2 toko dalam 1 trip). Mitra membayarkan tunai terlebih dahulu di kasir. | (Biaya Jasa Beli Flat `Rp 5.000` $\times$ Jumlah Toko) + Ongkir Antar Rute Jalan OSRM (`Rp 2.500/km`) + Uang Talangan Belanja Riil (diganti tunai saat COD). *(Biaya Jasa Beli Rp 5.000 adalah kompensasi waktu antre 15–30 menit, parkir, dan pemilihan barang di kasir warung agar mitra tidak menolak order belanja jarak dekat).* |
| **Servis & Bantuan** | Layanan jasa bantuan tenaga dan tukang servis teknik (AC, Pompa Air, Listrik, Bangunan, Las, Motor). Menggunakan skema **Opsi 1**: Biaya Kedatangan & Cek Lokasi Dasar (`Rp 15.000`), serta penawaran daftar rincian item jasa & suku cadang (*itemized breakdown + auto-sum*) yang diajukan mitra/tukang di aplikasi setelah pengecekan fisik untuk disetujui oleh pelanggan. | Biaya Pengecekan Lokasi (`Rp 15.000`) + Biaya Jasa & Suku Cadang Riil yang Disetujui Pelanggan di Tempat (COD). *(Tidak ada biaya jasa beli, melainkan kompensasi kehadiran fisik teknisi dan jasa perbaikan).* |
| **Antar / Kirim P2P** | Pengiriman barang pribadi, paket dokumen kantor, atau jemput antar langsung titik ke titik. Mendukung **Multi-Drop / Titik Singgah** opsional. | $\max(\text{Tarif Dasar Min Rp 8.000}, \text{Jarak OSRM} \times \text{Rp 2.500/km}) + (\text{Biaya Titik Singgah Rp 3.000/stop})$. *(Tidak ada biaya jasa beli karena kurir murni mengambil paket yang sudah siap dan langsung mengantarkannya tanpa antre di kasir).* |

---

## Struktur File Proyek

```text
MVP2/
├── index.html            # Simulator 3 Panel Terpadu (Customer, Driver, Admin)
├── style.css             # Desain frame simulator responsif & switcher tampilan
├── app.js                # Pengendali skenario demo simulasi 3 pilar
├── shared.js             # Engine state bersama, kalkulasi harga, & format WhatsApp
├── customer.html         # Antarmuka Pelanggan (Formulir 3 pilar & peta Leaflet)
├── customer.js           # Logika interaksi peta, routing OSRM, & pemesanan pelanggan
├── customer.css          # Desain antarmuka pelanggan
├── driver.html           # Antarmuka Mitra Kurir (Switch On/Off & peta navigasi rute)
├── driver.js             # Logika switch kerja, tracking rute OSRM, & dompet kas COD
├── driver.css            # Desain antarmuka aplikasi mitra kurir
├── admin.html            # Konsol Pengawas Admin & Dispatcher
├── admin.js              # Logika Dynamic Pricing Engine & switch suspensi mitra
├── admin.css             # Desain antarmuka konsol admin
├── vercel.json           # Konfigurasi deployment hosting Vercel
├── vendor/               # Aset pustaka lokal Leaflet Map (JS & CSS)
└── README.md             # Dokumentasi operasional & panduan deployment
```

---

## Cara Menjalankan Secara Lokal (Local Development)

Proyek ini menggunakan teknologi standar web murni (*Vanilla HTML, CSS, JavaScript*) tanpa ketergantungan build tool yang rumit, sehingga dapat dijalankan menggunakan server web statis lokal apapun.

### 1. Menggunakan Node.js (`serve` atau `http-server`)
Buka terminal pada direktori `MVP2`, lalu jalankan:
```bash
# Menjalankan server lokal pada port 4173 (atau port pilihan Anda)
npx serve . -l 4173
```

### 2. Menggunakan Python
```bash
# Python 3
python -m http.server 4173
```

### 3. Menggunakan Ekstensi VS Code (Live Server)
Klik kanan pada file `index.html` di VS Code, lalu pilih **"Open with Live Server"**.

### Akses Alamat URL Lokal
Buka peramban (*browser*) dan akses salah satu alamat berikut:
- **Simulator 3 Panel (Rekomendasi Utama):** `http://localhost:4173/index.html`
- **Aplikasi Pelanggan Saja:** `http://localhost:4173/customer.html`
- **Aplikasi Mitra Kurir Saja:** `http://localhost:4173/driver.html`
- **Konsol Pengawas Admin Saja:** `http://localhost:4173/admin.html`

---

## Panduan Penggunaan Aplikasi (Cara Pakai per Peran)

### A. Melalui Simulator 3 Panel (`index.html`)
Panggung simulator menampilkan 3 aplikasi secara berdampingan dalam satu layar:
1. **Viewport Switcher:** Tombol di bagian atas untuk beralih antara tampilan **Semua Peran (3 Panel)**, **Pelanggan Saja**, **Mitra Kurir Saja**, atau **Admin Saja**.
2. **Tombol Quick Demo (Skenario Otomatis):**
   - **Demo 1 (Minta Dibelikan):** Mensimulasikan pesanan bebek goreng di warung PKL dengan talangan Rp 55.000. Mitra kurir otomatis menerima tugas, mengambil talangan, dan mengantar pesanan.
   - **Demo 2 (Servis & Bantuan):** Mensimulasikan pemesanan jasa tenaga bersih-bersih 2 jam. Mitra menerima tugas dan menuju lokasi rumah.
   - **Demo 3 (Antar Paket P2P):** Mensimulasikan pengantaran dokumen penting antartitik (Pahlawan ke Buduran, 4,5 km rute jalan riil).
   - **Reset Data:** Mengembalikan seluruh basis data simulasi ke setelan awal pabrik.

---

### B. Alur Penggunaan Aplikasi Pelanggan (`customer.html`)
1. **Pilih Pilar Layanan:** Klik salah satu dari 3 kartu layanan di bagian atas (*Minta Dibelikan*, *Servis & Bantuan*, atau *Antar / Kirim*).
2. **Modal Pemilih Lokasi Bergaya Google Maps (Location Picker Modal):**
   - Setiap bagian titik alamat dilengkapi tombol **"Pilih Titik di Peta"**.
   - Menekan tombol ini memunculkan dialog modal interaktif bergaya **Google Maps**:
     - **Floating Search Bar & Autocomplete:** Kolom pencarian melayang di atas peta dengan autocompletion offline instan 17+ landmark Sidoarjo dan fallback pencarian alamat online via OSM Geocoding.
     - **Tombol GPS Floating:** Tombol cepat di sudut kanan bawah untuk mendeteksi posisi koordinat perangkat pengguna secara langsung melalui sensor GPS peramban.
     - **Fixed Center Pin Engine:** Pin peta diletakkan tetap di tengah kanvas. Pengguna cukup menggeser (*pan*) peta dengan jempol, dan sistem otomatis melakukan *reverse-geocoding* alamat patokan terdekat.
     - **Bottom Confirmation Card:** Kartu konfirmasi di bagian bawah menampilkan nama lokasi patokan terdeteksi, koordinat garis lintang/bujur, serta tombol **"Gunakan Titik Lokasi Ini"**.
3. **Kartu Pratinjau Alamat Teks Panjang (Location Preview Cards):**
   - Menghilangkan kolom teks kaku (*input disabled*) yang kerap terpotong di layar ponsel cerdas.
   - Menggantinya dengan kartu pratinjau teks panjang (*multiline wrap*) yang menampilkan badge status "Titik Terpilih", koordinat presisi, serta alamat lengkap yang mudah dibaca tepat di atas kolom patokan opsional.
4. **Kartu Ringkasan Rute Kompak & Accordion Drawer (Opsi A Mobile-Friendly):**
   - Menggantikan kanvas peta besar yang statis di formulir utama dengan **Kartu Ringkasan Rute Kompak (Tinggi 48px)**.
   - Menampilkan metrik jarak jalan raya riil OSRM (`km`), estimasi waktu tempuh (`menit`), dan tombol interaktif **"Lihat Peta Rute"**.
   - Mencegah jebakan sentuhan jempol (*map gesture trap*) pada layar ponsel. Saat tombol ditekan, drawer peta membuka rute jalan raya dengan transisi mulus dan auto-fit bounds Leaflet.
5. **Dukungan Multi-Titik (Multi-Store & Multi-Drop):**
   - **Minta Dibelikan (Multi-Toko):** Pelanggan dapat menekan tombol `+ Tambah Toko Singgah Tambahan` untuk menitip belanja di toko/warung kedua dalam satu trip. Biaya jasa beli dihitung transparan (Rp 5.000 $\times$ 2 = Rp 10.000) dan rute OSRM menghubungkan Toko 1 $\rightarrow$ Toko 2 $\rightarrow$ Alamat Antar.
   - **Antar / Kirim P2P (Multi-Drop):** Pelanggan dapat menekan tombol `+ Tambah Titik Antar Singgah` untuk mengirim paket ke 2 alamat penerima sekaligus dengan tambahan biaya singgah Rp 3.000.
6. **Kalkulasi Biaya Transparan & Kirim Pesanan:**
   - Rincian biaya talangan, biaya jasa beli/toko, biaya singgah, ongkir jalan raya, dan total bayar COD di tempat tertampil otomatis.
   - Klik **Kirim Pesanan ke Mitra** untuk siaran order langsung ke sistem kurir terdekat atau **Pesan Langsung via WhatsApp** untuk format chat resmi.
7. **Lacak Pesanan & Modal Detail Transaksi Terpadu:**
   - Buka tab **Pesanan Saya** untuk memantau status pesanan dalam format kartu ringkas (*glanceable*).
   - Klik tombol **"Lihat Detail Transaksi"** untuk membuka lembar modal interaktif berisi rincian rute lengkap dan **Struk Pembayaran Terpadu (Unified Billing Receipt)** yang menyatukan seluruh komponen tagihan (talangan, suku cadang, ongkir, jasa) tanpa terpisah-pisah.
   - Jika status pesanan *Menunggu Persetujuan Biaya Servis*, tombol aksi persetujuan (*Setujui Biaya & Kerjakan* / *Tolak*) tersedia langsung di dalam modal tepat di bawah struk terpadu.

---

### C. Alur Penggunaan Aplikasi Mitra Kurir (`driver.html`)
1. **Switch Toggle Status Kerja (On / Off):**
   - Geser saklar switch di pojok kanan atas ke posisi **Siap Kerja (On)** untuk menerima pesanan masuk.
   - Geser ke posisi **Sedang Istirahat (Off)** saat ingin beristirahat.
   - Jika akun disuspensi oleh admin, saklar otomatis terkunci (*disabled*) berwarna merah.
2. **Peta Navigasi & Rute Tugas Multi-Stop:**
   - Menampilkan peta navigasi tugas OpenStreetMap dengan rute berkendara multi-waypoint (Marker 1/A $\rightarrow$ Marker Singgah $\rightarrow$ Marker 2/B).
   - Menghitung jarak jalan raya nyata secara akumulatif menggunakan OSRM driving engine.
3. **Tawaran Tugas Masuk:**
   - Kartu tawaran merinci titik-titik belanja (Toko 1 & Toko 2) atau titik antar singgah, nominal talangan tunai yang wajib disiapkan, dan pendapatan bersih kurir.
   - Tombol **Lihat Rute di Peta** untuk mempratinjau rute sebelum konfirmasi tugas.
4. **Alur Kerja Bertahap (Workflow Operasional):**
   - Menyesuaikan pilar layanan secara cerdas:
     - **Pilar 1 (Minta Dibelikan):** *"1. Tiba di Lokasi & Selesaikan Belanja"* $\rightarrow$ *"2. Pesanan Tiba & Terima COD Total"*.
     - **Pilar 2 (Servis & Bantuan - Skema Opsi 1 Itemized):** *"1. Tiba di Lokasi & Mulai Pengecekan"* $\rightarrow$ Form Input Rincian Itemized Pekerjaan & Suku Cadang (+ Tambah Item & Auto-Sum, Status: *Menunggu Persetujuan Pelanggan*) $\rightarrow$ Pengerjaan Disetujui Konsumen (atau Pembatalan Berbayar Cek Rp 15.000 jika Ditolak) $\rightarrow$ *"Selesaikan Servis & Terima Pembayaran"*.
     - **Pilar 3 (Antar / Kirim P2P):** *"1. Paket Diambil & Antar"* $\rightarrow$ *"2. Paket Tiba & Selesaikan Pengantaran"*.
5. **Ringkasan Dompet Kas:**
   - Memantau akumulasi **Pendapatan Bersih** mitra.
   - Memantau total **Kas Tunai COD Ditangan** yang wajib dipertanggungjawabkan.
   - Memantau akumulasi **Setoran Biaya Platform**.
6. **Modal Detail Transaksi & Struk Bagi Hasil Mitra:**
   - Pada kartu tugas aktif dan setiap kartu riwayat selesai, tersedia tombol **"Lihat Detail Transaksi & Rincian Struk"**.
   - Membuka modal berisi rincian rute, pemesan, struk pesanan terpadu, total uang kas COD yang diterima, potongan biaya aplikasi platform (15%), dan hak pendapatan bersih mitra secara transparan.

---

### D. Alur Penggunaan Konsol Admin & Dispatcher (`admin.html`)
1. **Ringkasan Metrik Bisnis:** Menampilkan Total GMV Transaksi, jumlah pesanan Minta Dibelikan, Servis, dan Antar P2P secara langsung.
2. **Dynamic Pricing Engine:**
   - Konfigurasi tarif dikelompokkan ke dalam kartu per pilar:
     - **Pilar 1 (Minta Dibelikan):** Biaya Jasa Beli Flat (`Rp`) & Ongkir Belanja (`Rp / km`).
     - **Pilar 2 (Servis & Bantuan):** Biaya Cek & Kedatangan Dasar (`Rp 15.000`) & Tarif Tenaga Kerja (`Rp / jam`).
     - **Pilar 3 (Antar / Kurir P2P):** Tarif Minimum s.d. 3 km (`Rp`) & Tarif per KM Lanjutan (`Rp / km`).
     - **Bagi Hasil Platform:** Persentase komisi platform (`%`).
   - Setiap nilai yang diubah dan disimpan langsung disinkronkan ke kalkulator aplikasi pelanggan dan kurir.
3. **Manajemen Armada & Switch Status Akun:**
   - Kolom **Status Mitra**: Menampilkan status akun (`Akun Aktif` / `Ditangguhkan`) dan status kerja (`Kerja: Siaga (On)` / `Kerja: Istirahat (Off)`).
   - Kolom **Aksi Status Akun**: Dilengkapi saklar switch toggle (**Aktif** / **Suspend**).
   - Menggeser switch ke posisi *Suspend* seketika menonaktifkan akun mitra dari sistem dan mengunci saklar kerja di aplikasi kurir.
4. **Buku Besar Transaksi Real-time & Modal Audit Finansial:**
   - Tabel menampilkan seluruh log transaksi disertai tombol **"Detail"** di kolom aksi.
   - Menekan tombol ini membuka modal audit terpadu yang menampilkan rincian rute, pemesan, nilai GMV kotor, penerimaan biaya aplikasi (kas platform 15%), dan hak bersih mitra kurir.

---

## Panduan Upload & Deploy ke Vercel

Aplikasi ini 100% kompatibel dengan hosting statis Vercel dan sudah dilengkapi file konfigurasi [`vercel.json`](file:///c:/Project/solusi.toriq/Zulfiar%20Ryan/Project%20Kurir%20Mirip%20Gojek/MVP2/vercel.json).

### Metode 1: Menggunakan Vercel CLI (Metode Tercepat)

1. Pastikan Node.js sudah terpasang, lalu pasang Vercel CLI secara global (jika belum):
   ```bash
   npm install -g vercel
   ```

2. Buka terminal dan masuk ke direktori `MVP2`:
   ```bash
   cd "c:\Project\solusi.toriq\Zulfiar Ryan\Project Kurir Mirip Gojek\MVP2"
   ```

3. Jalankan perintah deploy:
   ```bash
   vercel
   ```

4. Ikuti panduan interaktif di terminal:
   - `Set up and deploy?` $\rightarrow$ Ketik **`y`** lalu tekan Enter.
   - `Which scope do you want to deploy to?` $\rightarrow$ Pilih akun Vercel Anda.
   - `Link to existing project?` $\rightarrow$ Ketik **`n`**.
   - `What’s your project’s name?` $\rightarrow$ Beri nama (contoh: **`mtm-sidoarjo-mvp2`**).
   - `In which directory is your code located?` $\rightarrow$ Tekan Enter (menggunakan direktori saat ini **`./`**).
   - `Want to modify these settings?` $\rightarrow$ Ketik **`n`** (biarkan default karena ini situs statis).

5. Setelah preview selesai, luncurkan ke produksi:
   ```bash
   vercel --prod
   ```
   Terminal akan langsung menampilkan tautan URL live produksi (misal: `https://mtm-sidoarjo-mvp2.vercel.app`).

---

### Metode 2: Menggunakan Git & Dashboard Vercel (GitHub / GitLab)

1. **Inisialisasi & Push ke GitHub:**
   ```bash
   # Masuk ke direktori MVP2 atau root repository Anda
   git init
   git add .
   git commit -m "feat: rilis MVP2 bantal Malang 3 pilar operasional"
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```

2. **Hubungkan di Dashboard Vercel:**
   - Kunjungi [https://vercel.com](https://vercel.com) dan masuk (*Login*) dengan akun GitHub Anda.
   - Klik tombol **"Add New..."** lalu pilih **"Project"**.
   - Cari dan pilih repositori Git yang baru Anda push, lalu klik **"Import"**.

3. **Pengaturan Konfigurasi Proyek di Vercel:**
   - **Project Name:** `mtm-sidoarjo-mvp2` (atau sesuai keinginan Anda).
   - **Framework Preset:** Pilih **"Other"** (karena murni Static HTML/JS).
   - **Root Directory:**
     - Jika Anda menge-push folder `MVP2` sebagai root repositori, biarkan `./`.
     - Jika Anda menge-push seluruh folder proyek dan `MVP2` berada di dalam subfolder, klik **Edit** dan arahkan ke folder **`MVP2`**.
   - **Build and Output Settings:** Biarkan kosong (tidak memerlukan build command).

4. **Klik "Deploy":**
   - Dalam waktu 10–20 detik, Vercel akan menyelesaikan proses deployment dan memberikan domain publik gratis bersertifikat SSL/HTTPS (contoh: `https://mtm-sidoarjo-mvp2.vercel.app`).

---

### Konfigurasi Tambahan: `vercel.json`

File konfigurasi [`vercel.json`](file:///c:/Project/solusi.toriq/Zulfiar%20Ryan/Project%20Kurir%20Mirip%20Gojek/MVP2/vercel.json) telah disediakan di dalam folder `MVP2`:

```json
{
  "cleanUrls": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        }
      ]
    }
  ]
}
```

**Fungsi konfigurasi ini:**
- `cleanUrls: true`: Mengizinkan akses rute bersih tanpa ekstensi `.html` (misal: `/customer` dapat diakses langsung sebagai pengganti `/customer.html`).
- `X-Frame-Options: SAMEORIGIN`: Memastikan panggung simulator multi-peran pada `index.html` dapat memuat frame aplikasi `customer.html`, `driver.html`, dan `admin.html` tanpa diblokir oleh kebijakan keamanan browser (*cross-origin framing*).

---

## Standar Desain & Visual Hygiene (`AGENTS.md`)

- **Bebas Polusi Ikon & Emoji:** Seluruh judul, label, status badge, dan tombol aksi menggunakan teks bersih fungsional tanpa emoji dekoratif.
- **Tipografi Industri:** Menggunakan jenis huruf *Plus Jakarta Sans* untuk keterbacaan teks dan *JetBrains Mono* untuk data numerik & finansial.
- **Format Baku:** Seluruh nominal uang diformat baku dengan pemisah ribuan titik (`Rp 25.000`) dan jarak rute menggunakan desimal koma baku (`3,5 km`).
