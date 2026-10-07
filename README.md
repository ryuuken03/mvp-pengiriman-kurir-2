# Bantal Malang v2.0 (MVP2)
## Ekosistem Jasa Bantuan Lokal & On-Demand Errand Runner (Hyperlocal Sidoarjo)

Versi 2.0 (`MVP2`) mengadopsi model operasional riil **MTM Sidoarjo (Mas Tulong Mas - https://www.mtmsidoarjo.my.id/)**. Sistem dialihkan dari e-commerce katalog toko konvensional menjadi **3 Pilar Jasa Bantuan Lokal**:

1. **Minta Dibelikan** (Personal Shopper / Jastip Bebas Warung PKL, Apotek & Sembako dengan sistem talangan tunai kurir).
2. **Servis & Bantuan** (Jasa Tenaga Harian / Hourly Worker: Bersih-bersih rumah/gudang, angkat barang/pindahan ringan, pendampingan aktivitas, dll.).
3. **Antar / Kirim P2P** (Kurir Cepat Point-to-Point antar-warga untuk dokumen penting, paket dagangan, atau antar-jemput).

Arsitektur disederhanakan menjadi **3 Aktor Utama** (*Customer $\rightarrow$ Driver/Mitra $\rightarrow$ Admin Dispatcher*), terintegrasi secara *real-time* menggunakan sinkronisasi `BroadcastChannel` dan `localStorage`.

---

## 3 Pilar Layanan Utama & Skema Tarif

| Pilar Layanan | Deskripsi Operasional | Rumus Biaya Transparan |
| :--- | :--- | :--- |
| **Minta Dibelikan** | Pelanggan memesan makanan/kebutuhan di warung tenda atau toko bebas tanpa syarat pendaftaran merchant. Mitra membayarkan tunai terlebih dahulu di kasir. | Biaya Jasa Beli Flat (`Rp 5.000`) + Ongkir Antar Rute Jalan (`Rp 2.500/km`) + Uang Talangan Belanja Riil (diganti tunai saat COD). |
| **Servis & Bantuan** | Penyewaan jasa tenaga kerja harian untuk kebutuhan praktis di rumah atau tempat usaha. | Durasi Kerja $\times$ Tarif per Jam (`Rp 17.500/jam`). |
| **Antar / Kirim P2P** | Pengiriman barang pribadi, paket dokumen penting kantor, atau jemput antar langsung titik ke titik. | Tarif Dasar Minimum (`Rp 8.000` s.d. 3 km) atau Jarak Rute Jalan $\times$ `Rp 2.500/km`. |

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
2. **Peta Interaktif & Rute Jalan Raya (Leaflet + OSRM):**
   - Geser pin jemput (A) dan pin tujuan (B) pada peta secara bebas.
   - Atau klik salah satu tombol **Preset Rute Cepat Sidoarjo** (contoh: *Taman Pinang $\rightarrow$ Jl. Pahlawan*, *Pasar Larangan $\rightarrow$ Alun-Alun*, *Ruko Waru*, dll.).
   - Sistem secara otomatis menghitung rute berkendara nyata jalan raya menggunakan engine OSRM (bukan garis lurus fiktif) beserta jarak km dan estimasi menit tempuh.
3. **Penyetelan Khusus Layanan:**
   - **Minta Dibelikan:** Masukkan perkiraan talangan belanja dan catatan menu/barang belanjaan.
   - **Servis & Bantuan:** Geser slider durasi jam kerja (1 s.d. 8 jam).
4. **Kalkulasi Biaya Transparan:** Rincian biaya talangan, biaya jasa, ongkir jalan raya, dan total bayar COD di tempat tertampil otomatis.
5. **Kirim Pesanan:**
   - Klik **Kirim Pesanan ke Mitra** untuk menyiarkan order langsung ke sistem kurir terdekat.
   - Atau klik **Pesan Langsung via WhatsApp** untuk membuka tautan chat resmi dengan draf rincian pesanan yang sudah terformat rapi.
6. **Lacak Pesanan:** Buka tab **Pesanan Saya** untuk memantau status pengerjaan oleh kurir secara *real-time*.

---

### C. Alur Penggunaan Aplikasi Mitra Kurir (`driver.html`)
1. **Switch Toggle Status Kerja (On / Off):**
   - Geser saklar switch di pojok kanan atas ke posisi **Siap Kerja (On)** untuk menerima pesanan masuk.
   - Geser ke posisi **Sedang Istirahat (Off)** saat ingin beristirahat (antrean tugas otomatis disembunyikan).
   - Jika akun disuspensi oleh admin, saklar otomatis terkunci (*disabled*) berwarna merah dengan label **Ditangguhkan (Suspend)**.
2. **Peta Navigasi & Rute Tugas Pemesan:**
   - Menampilkan peta Leaflet OpenStreetMap langsung di layar kurir.
   - Saat bertugas, peta menggambarkan rute berkendara nyata dari titik toko/jemput (Marker 1/A) ke alamat pemesan (Marker 2/B) beserta jarak km dan durasi tempuh.
   - Saat stanby/siaga, peta menampilkan pangkalan kurir di wilayah tugasnya (Alun-Alun Sidoarjo, Waru, Buduran, atau Candi).
3. **Tawaran Tugas Masuk:**
   - Periksa kartu tawaran tugas yang masuk lengkap dengan pendapatan bersih yang akan diterima.
   - Klik **Lihat Rute di Peta** untuk mempratinjau rute jalan pemesan sebelum memutuskan mengambil tugas.
   - Klik **Terima Tugas** untuk mengonfirmasi order atau **Lewati** untuk mengabaikan.
4. **Alur Kerja Bertahap (Workflow Operasional):**
   - **Minta Dibelikan:** Tombol alur 1: *"Tiba di Lokasi & Beli Barang (Bawa Talangan Tunai)"* $\rightarrow$ Tombol alur 2: *"Pesanan Tiba & Terima Kas COD Total"*.
   - **Servis & Bantuan:** Tombol alur 1: *"Tiba di Lokasi & Mulai Bekerja"* $\rightarrow$ Tombol alur 2: *"Tugas Selesai & Terima Pembayaran"*.
   - **Antar P2P:** Tombol alur 1: *"Paket Diambil & Antar ke Penerima"* $\rightarrow$ Tombol alur 2: *"Paket Tiba di Tujuan & Selesaikan Pengantaran"*.
5. **Ringkasan Dompet Kas:**
   - Memantau akumulasi **Pendapatan Bersih** mitra.
   - Memantau total **Kas Tunai COD Ditangan** yang wajib disetorkan/dikelola.
   - Memantau akumulasi **Setoran Biaya Platform**.

---

### D. Alur Penggunaan Konsol Admin & Dispatcher (`admin.html`)
1. **Ringkasan Metrik Bisnis:** Menampilkan Total GMV Transaksi, jumlah pesanan Minta Dibelikan, Servis, dan Antar P2P secara langsung.
2. **Dynamic Pricing Engine:**
   - Konfigurasi tarif dikelompokkan ke dalam kartu per pilar:
     - **Pilar 1 (Minta Dibelikan):** Biaya Jasa Beli Flat (`Rp`) & Ongkir Belanja (`Rp / km`).
     - **Pilar 2 (Servis & Bantuan):** Tarif Tenaga Kerja (`Rp / jam`).
     - **Pilar 3 (Antar / Kurir P2P):** Tarif Minimum s.d. 3 km (`Rp`) & Tarif per KM Lanjutan (`Rp / km`).
     - **Bagi Hasil Platform:** Persentase komisi platform (`%`).
   - Setiap nilai yang diubah dan disimpan langsung disinkronkan ke kalkulator aplikasi pelanggan dan kurir.
3. **Manajemen Armada & Switch Status Akun:**
   - Kolom **Status Mitra**: Menampilkan status akun (`Akun Aktif` / `Ditangguhkan`) dan status kerja (`Kerja: Siaga (On)` / `Kerja: Istirahat (Off)`).
   - Kolom **Aksi Status Akun**: Dilengkapi saklar switch toggle (**Aktif** / **Suspend**).
   - Menggeser switch ke posisi *Suspend* seketika menonaktifkan akun mitra dari sistem dan mengunci saklar kerja di aplikasi kurir.
4. **Buku Besar Transaksi Real-time:** Menampilkan log seluruh transaksi yang sedang berlangsung maupun yang telah selesai.

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
