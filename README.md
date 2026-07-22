# 🍽️ Platescape POS - Smart Cashier

Platescape POS adalah aplikasi kasir (Point of Sale) berbasis Single Page Application (SPA) yang berjalan sepenuhnya di sisi klien (Frontend-only). Aplikasi ini mengadopsi pendekatan **Offline-First** menggunakan *IndexedDB* untuk kecepatan dan **Google Drive API** sebagai database Cloud gratis untuk sinkronisasi data lintas perangkat.

## ✨ Fitur Utama
* **Google OAuth 2.0 Login:** Autentikasi aman menggunakan akun Google (Sesi aktif 24 jam).
* **Offline-First & Auto-Sync:** Transaksi super cepat menggunakan *IndexedDB* (Browser memori), otomatis di-sync ke Google Drive setiap 2 menit atau saat *checkout*.
* **Manajemen Produk (CRUD):** Tambah, Edit, dan Hapus produk. File gambar produk otomatis di-upload ke Google Drive.
* **Keranjang & Checkout:** Kalkulasi otomatis, input nomor meja, dan catatan tambahan.
* **Order History:** Daftar riwayat transaksi, fitur cek nota, dan hapus nota.
* **Laporan Produk Terjual:** Pantau total produk terjual dan kalkulasi pendapatan secara langsung (bisa di-edit/reset).
* **Cetak Struk/Invoice:** Tampilan cetak nota cantik bergaya *Mac OS window* UI.
* **Responsif:** Nyaman digunakan di layar Desktop, Tablet, maupun HP.

# jika ingin langsung mencoba bisa ke link dibawah ini
`https://platescape-cashier.netlify.app`

---

## 🛠️ Persyaratan Sistem (Prerequisites)
Karena aplikasi ini menggunakan Google Drive pengguna sebagai database, Anda WAJIB memiliki **Client ID** dari Google Cloud Console. 

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat Project baru dan aktifkan **Google Drive API**.
3. Atur *OAuth Consent Screen* (Tambahkan email admin/kasir di bagian *Test Users* jika status *Testing*).
4. Buat kredensial **OAuth client ID** (Pilih tipe *Web application*).
5. Masukkan URI asli Anda (misal: `http://localhost:5500` atau URL Netlify) di bagian **Authorized JavaScript origins** dan **Authorized redirect URIs**.

---

## 🚀 Instalasi & Persiapan (SANGAT PENTING!)

Agar aplikasi ini dapat berjalan dan bisa login dengan Google, **Anda diwajibkan untuk mengonfigurasi Client ID** secara lokal. 

Ikuti langkah-langkah berikut:

1. Clone atau Download repositori ini.
2. Di dalam folder utama proyek, **buat sebuah folder baru** bernama `data`.
3. Di dalam folder `data`, **buat file baru** dengan nama `client_id.json`.
4. Buka file `client_id.json` tersebut dan tempelkan kode di bawah ini:

## json
{
    "client_id": "FILL your client id from google cloud console here"
}
Catatan: Ganti teks "FILL your client id..." dengan Client ID asli milik Anda yang didapatkan dari Google Cloud Console (biasanya berakhiran .apps.googleusercontent.com). File ini sudah diatur agar diabaikan oleh .gitignore sehingga aman dan tidak akan terpublikasi ke GitHub.

## Struktur Folder Seharusnya:

📂 Platescape_POS/
 ┣ 📂 data/
 ┃ ┗ 📜 client_id.json    <-- (File Wajib Anda Buat!)
 ┣ 📜 index.html
 ┣ 📜 style.css
 ┣ 📜 app.js
 ┣ 📜 404.html
 ┣ 📜 README.md
 ┗ 📜 .gitignore


## 💻 Cara Menjalankan Aplikasi di Komputer Lokal
Karena aplikasi ini menggunakan fungsi fetch() untuk membaca file client_id.json lokal, Anda tidak bisa membukanya hanya dengan klik ganda (double click) pada file index.html.
1. Anda harus menjalankannya menggunakan Local Web Server.
2. Pengguna VS Code: Instal ekstensi Live Server, klik kanan pada index.html, dan pilih Open with Live Server.
3. Pengguna Node.js: Gunakan modul seperti http-server atau live-server di terminal.

## 🌍 Cara Deployment (Hosting ke Netlify)
Jika Anda ingin meng-host aplikasi ini ke layanan seperti Netlify menggunakan metode Drag and Drop:
1. Pastikan Anda sudah membuat file client_id.json di dalam folder data di komputer Anda.
2. Drag folder utama proyek Anda dan Drop ke dashboard Netlify.
3. Setelah web online, salin URL web Anda (contoh: https://kasir-platescape.netlify.app).
4. Kembali ke Google Cloud Console.
5. Masukkan URL tersebut ke dalam Authorized JavaScript origins dan Authorized redirect URIs. (Wajib menggunakan https:// tanpa garis miring / di akhir).
6. Tambahkan nama domain web tersebut di pengaturan OAuth Consent Screen pada bagian Authorized domains.

## 🏗️ Teknologi yang Digunakan
1. HTML5, CSS3, Vanilla JavaScript (ES6+)
2. Bootstrap 5 - Grid & Styling Dasar
3. SweetAlert2 - Pop-up interaktif & Notifikasi
4. FontAwesome 6 - Ikon antarmuka
5. Google Identity Services (GSI) - Autentikasi Login
6. Google Drive API v3 - Cloud Storage untuk file JSON dan Gambar

Dibuat untuk mempermudah manajemen kasir secara mandiri, gratis, dan aman langsung dari Google Drive Anda!