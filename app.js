/* =========================================================
   SISTEM INTI & DEKLARASI VARIABEL
========================================================= */
let CLIENT_ID = ''; 
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let accessToken = null;
let appFolderId = null;
let databaseFileId = null; 
const FOLDER_NAME = "Platescape_POS_Data"; 
const DB_FILE_NAME = "database.json"; 

let cart = [];
let currentFilter = 'All';
let currentInvoiceData = null; 

let needsSync = false; 

document.getElementById('current-date').innerText = new Date().toLocaleDateString('id-ID', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });

/* =========================================================
   FUNGSI CUSTOM ANIMATED LOADER
========================================================= */
const CUSTOM_LOADER_HTML = `
<div class="custom-spinner-main">
  <div class="up">
    <div class="loaders">
      <div class="loader"></div><div class="loader"></div><div class="loader"></div>
      <div class="loader"></div><div class="loader"></div><div class="loader"></div>
      <div class="loader"></div><div class="loader"></div><div class="loader"></div>
    </div>
    <div class="loadersB">
      <div class="loaderA"><div class="ball0"></div></div><div class="loaderA"><div class="ball1"></div></div>
      <div class="loaderA"><div class="ball2"></div></div><div class="loaderA"><div class="ball3"></div></div>
      <div class="loaderA"><div class="ball4"></div></div><div class="loaderA"><div class="ball5"></div></div>
      <div class="loaderA"><div class="ball6"></div></div><div class="loaderA"><div class="ball7"></div></div>
      <div class="loaderA"><div class="ball8"></div></div>
    </div>
  </div>
</div>
`;

function showCustomLoader(titleText, subText = '') {
    Swal.fire({
        title: titleText,
        html: CUSTOM_LOADER_HTML + (subText ? `<p class="mt-2 text-muted" style="font-size:0.9rem">${subText}</p>` : ''),
        showConfirmButton: false,
        allowOutsideClick: false
    });
}

/* =========================================================
   MODUL INDEXEDDB (Menyimpan data di dalam memori Browser)
========================================================= */
const dbName = "PlatescapeDB";
const storeName = "products";
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id" });
            }
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(); };
        request.onerror = (e) => reject(e);
    });
}

function getAllProducts() {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject();
    });
}

function putProductsToIDB(productsArray) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.clear(); 
        productsArray.forEach(p => store.put(p));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject();
    });
}

function updateSingleProductInIDB(product) {
    return new Promise((resolve) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(product);
        tx.oncomplete = () => resolve();
    });
}


/* =========================================================
   MODUL LOGIN & AUTHENTICATION (SESI 24 JAM & ANTI REFRESH BUG)
========================================================= */
window.onload = async function () {
    try {
        const resConfig = await fetch('../data/client_id.json');
        const configData = await resConfig.json();
        CLIENT_ID = configData.client_id;
    } catch (e) {
        Swal.fire('Error Konfigurasi', 'Gagal memuat client_id.json. Pastikan file tersedia.', 'error');
        return;
    }

    await initDB();

    const savedToken = localStorage.getItem('pos_token');
    const loginTime = localStorage.getItem('pos_login_time');
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: handleGoogleAuthCallback
    });

    // FIX BUG 1: Langsung masuk ke UI dengan data lokal IndexedDB tanpa loading Google API ulang
    // DIPERBAIKI (Batas 58 Menit agar tidak tertolak Google)
    if (savedToken && loginTime && (Date.now() - parseInt(loginTime) < 3500000)) { 
        accessToken = savedToken;
        appFolderId = localStorage.getItem('pos_folderId');
        databaseFileId = localStorage.getItem('pos_dbFileId'); // PENTING: Panggil file ID agar tidak menimpa drive saat save
        
        document.getElementById('login-screen').classList.add('d-none');
        document.getElementById('main-app').classList.remove('d-none');
        
        initApp();
        startAutosave(); 
        return; // Hentikan script disini agar tidak meminta auth
    }
};

function handleAuthClick() {
    tokenClient.requestAccessToken();
}

async function handleGoogleAuthCallback(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        accessToken = tokenResponse.access_token;
        localStorage.setItem('pos_token', accessToken);
        localStorage.setItem('pos_login_time', Date.now()); 

        showCustomLoader('Sinkronisasi...', 'Mengunduh database dari Google Drive');
        try {
            appFolderId = await getOrCreateFolder();
            localStorage.setItem('pos_folderId', appFolderId);
            
            await downloadDatabaseFromDrive();

            document.getElementById('login-screen').classList.add('d-none');
            document.getElementById('main-app').classList.remove('d-none');
            
            initApp();
            startAutosave(); 
            
            Swal.fire({ icon: 'success', title: 'Data Siap!', timer: 1500, showConfirmButton: false });
        } catch (err) {
            Swal.fire('Error', 'Gagal memuat dari Drive.', 'error');
            console.error(err);
        }
    }
}

function logout() {
    Swal.fire({
        title: 'Keluar dari Kasir?',
        text: "Sesi Anda akan diakhiri.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#677E61',
        confirmButtonText: 'Ya, Logout!'
    }).then((result) => {
        if (result.isConfirmed) {
            if(needsSync) forceSyncToDrive(); 
            if (accessToken) { google.accounts.oauth2.revoke(accessToken, () => {}); }

            accessToken = null; appFolderId = null; databaseFileId = null;
            localStorage.clear();
            
            document.getElementById('main-app').classList.add('d-none');
            document.getElementById('login-screen').classList.remove('d-none');
            Swal.fire({ title: 'Berhasil Logout', toast: true, position: 'top-end', icon: 'success', timer: 2000, showConfirmButton: false });
        }
    });
}


/* =========================================================
   MODUL GOOGLE DRIVE (Hemat Kuota)
========================================================= */
async function getOrCreateFolder() {
    const query = `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`;
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;
    
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    return (await createRes.json()).id; 
}

async function downloadDatabaseFromDrive() {
    const query = `name='${DB_FILE_NAME}' and '${appFolderId}' in parents and trashed=false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
    const data = await res.json();

    if (data.files && data.files.length > 0) {
        databaseFileId = data.files[0].id;
        localStorage.setItem('pos_dbFileId', databaseFileId); // Simpan ID File
        
        const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${databaseFileId}?alt=media&t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
        const driveProducts = await fileRes.json();
        
        if(driveProducts.length > 0) await putProductsToIDB(driveProducts);
    } else {
        await uploadDatabaseToDrive([]); 
    }
}

async function uploadDatabaseToDrive(productsData) {
    if (!appFolderId || !accessToken) return;
    const fileContent = JSON.stringify(productsData, null, 2);

    if (databaseFileId) {
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${databaseFileId}?uploadType=media`, {
            method: 'PATCH', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: fileContent
        });
    } else {
        const file = new Blob([fileContent], { type: 'application/json' });
        const metadata = { name: DB_FILE_NAME, mimeType: 'application/json', parents: [appFolderId] };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' })); form.append('file', file);

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
            method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
        });
        databaseFileId = (await res.json()).id;
        localStorage.setItem('pos_dbFileId', databaseFileId); // Simpan ID file JSON yang baru dibuat
    }
}

// FIX BUG 2: MENGUBAH URL PREVIEW GAMBAR DRIVE
async function uploadImageToDrive(file) {
    if (!appFolderId) throw new Error("Folder ID Error.");
    const metadata = { name: file.name, parents: [appFolderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' })); form.append('file', file);
    
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form });
    const data = await res.json();
    
    await fetch(`https://www.googleapis.com/drive/v3/files/${data.id}/permissions`, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
    
    // Gunakan Thumbnail API (w800 = resolusi 800px) agar bisa dibaca browser sebagai gambar
    return `https://drive.google.com/thumbnail?id=${data.id}&sz=w800`;
}

function startAutosave() {
    setInterval(async () => {
        if(needsSync) {
            await forceSyncToDrive();
        }
    }, 120000); 
}

async function forceSyncToDrive() {
    if(!accessToken) return;
    document.getElementById('sync-text').innerText = "Menyimpan...";
    try {
        const allProducts = await getAllProducts(); 
        await uploadDatabaseToDrive(allProducts);   
        needsSync = false;
        document.getElementById('sync-btn').classList.replace('btn-outline-warning', 'btn-outline-success');
        document.getElementById('sync-text').innerText = "Tersinkron";
    } catch (e) {
        document.getElementById('sync-text').innerText = "Gagal Sync";
        // Jika token sudah mati (>1 Jam), sistem akan gagal sync. Anda bisa re-auth disini kelak jika diperlukan.
    }
}

function triggerSyncWarning() {
    needsSync = true;
    document.getElementById('sync-btn').classList.replace('btn-outline-success', 'btn-outline-warning');
    document.getElementById('sync-text').innerText = "Belum Tersimpan";
}


/* =========================================================
   UI RENDERING
========================================================= */
async function initApp() { await renderCategories(); await renderProducts(); }

async function renderCategories() {
    const products = await getAllProducts();
    let cats = ['All']; 
    products.forEach(p => { if (!cats.includes(p.category)) cats.push(p.category); });
    
    document.getElementById('category-list').innerHTML = cats.map(cat => `
        <div class="category-card ${currentFilter === cat ? 'active' : ''}" onclick="setCategory('${cat}')">
            <i class="fa-solid fa-tags"></i> <div style="font-size: 0.85rem; font-weight: 500;">${cat}</div>
        </div>`).join('');
}

async function setCategory(catName) { currentFilter = catName; await renderCategories(); await renderProducts(); }
async function filterProducts(searchQuery) { await renderProducts(searchQuery.toLowerCase()); }

async function renderProducts(search = '') {
    const products = await getAllProducts();
    let filtered = products.filter(p => (currentFilter === 'All' || p.category === currentFilter) && p.name.toLowerCase().includes(search));
    
    document.getElementById('product-list').innerHTML = filtered.map(p => `
        <div class="product-card">
            ${p.discount ? `<div class="discount-badge">${p.discount}</div>` : ''}
            <img src="${p.img}" class="product-img" alt="${p.name}">
            <div class="product-title">${p.name}</div>
            <div class="d-flex justify-content-between align-items-center mt-auto pt-2">
                <div class="product-price">Rp ${p.price.toLocaleString('id-ID')}</div>
                <button class="btn-add" onclick="addToCart(${p.id})"><i class="fa-solid fa-plus"></i></button>
            </div>
        </div>`).join('');
}

/* =========================================================
   CART & CHECKOUT LOGIC
========================================================= */
async function addToCart(id) {
    const products = await getAllProducts();
    const product = products.find(p => p.id == id); 
    const existing = cart.find(item => item.id == id);
    if (existing) existing.qty += 1; else cart.push({ ...product, qty: 1 });
    updateCartUI();
    if(window.innerWidth <= 992) Swal.fire({ title: 'Masuk Keranjang!', toast: true, position: 'top-end', showConfirmButton: false, timer: 1000 });
}

function updateCartQty(id, delta) {
    const item = cart.find(i => i.id == id);
    if(item) { item.qty += delta; if(item.qty <= 0) cart = cart.filter(i => i.id != id); updateCartUI(); }
}

// Fungsi Baru: Untuk mengubah Qty langsung dari ketikan Keyboard
function setCartQty(id, value) {
    let newQty = parseInt(value);
    
    // Jika input kosong, huruf, atau angka 0 ke bawah, hapus item dari keranjang
    if (isNaN(newQty) || newQty <= 0) {
        cart = cart.filter(i => i.id != id);
    } else {
        const item = cart.find(i => i.id == id);
        if(item) item.qty = newQty;
    }
    
    updateCartUI(); // Hitung dan render ulang keranjang
}

function updateCartUI() {
    const container = document.getElementById('cart-items-container'); 
    const totalEl = document.getElementById('cart-total-price');
    const mobileTotalEl = document.getElementById('mobile-total-price'); // <-- Elemen Mobile
    const mobileBadge = document.getElementById('mobile-cart-badge');       // <-- Badge Mobile
    const emptyMsg = document.getElementById('empty-cart-msg');
    
    // Hitung total qty barang di keranjang
    let totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
    if(mobileBadge) mobileBadge.innerText = totalQty;

    if(cart.length === 0) {
        emptyMsg.style.display = 'block'; 
        container.innerHTML = ''; 
        totalEl.innerText = 'Rp 0'; 
        if(mobileTotalEl) mobileTotalEl.innerText = 'Rp 0';
        return;
    }
    
    emptyMsg.style.display = 'none';
    let total = 0;
    container.innerHTML = cart.map(item => {
        total += item.price * item.qty;
        return `
        <div class="cart-item">
            <img src="${item.img}" class="cart-item-img">
            <div class="cart-item-info">
                <div class="fw-semibold" style="font-size: 0.95rem;">${item.name}</div>
                <div class="text-primary-dark fw-bold">Rp ${(item.price * item.qty).toLocaleString('id-ID')}</div>
            </div>
            <div class="qty-control">
                <i class="fa-solid fa-minus" onclick="updateCartQty(${item.id}, -1)"></i>
                <input type="number" value="${item.qty}" onchange="setCartQty(${item.id}, this.value)" onfocus="this.select()">
                <i class="fa-solid fa-plus" onclick="updateCartQty(${item.id}, 1)"></i>
            </div>
        </div>`;
    }).join('');
    
    totalEl.innerText = `Rp ${total.toLocaleString('id-ID')}`;
    if(mobileTotalEl) mobileTotalEl.innerText = `Rp ${total.toLocaleString('id-ID')}`; // <-- Update teks mobile
}

async function checkout() {
    const custName = document.getElementById('customer-name').value;
    const tableNum = document.getElementById('table-number').value; 
    const notes = document.getElementById('order-notes').value;

    if(cart.length === 0) return Swal.fire('Oops', 'Keranjang kosong!', 'warning');
    if(!custName) return Swal.fire('Oops', 'Nama pemesan wajib!', 'warning');

    const transactionData = {
        id: "ORD-" + Date.now(), date: new Date().toISOString(), customer: custName,
        table: tableNum || "Takeaway", notes: notes || "-", items: cart,
        total: cart.reduce((sum, item) => sum + (item.price * item.qty), 0)
    };

    showCustomLoader('Memproses Transaksi...');

    if(accessToken && appFolderId) {
        try {
            const file = new Blob([JSON.stringify(transactionData, null, 2)], { type: 'application/json' });
            const metadata = { name: `Invoice_${custName.replace(/\s+/g, '_')}_${transactionData.id}.json`, mimeType: 'application/json', parents: [appFolderId] };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' })); form.append('file', file);
            
            const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form });
            
            // PENGAMANAN BARU: Menangkap pesan asli dari Google jika tertolak
            if (!res.ok) {
                if (res.status === 401) throw new Error("Sesi Login Google Anda sudah habis (Lewat 1 Jam). Silakan Logout dan Login kembali.");
                throw new Error(`Google Drive Error Code: ${res.status}`);
            }
            
            const products = await getAllProducts();
            for (let item of cart) {
                let p = products.find(x => x.id == item.id);
                if(p) {
                    p.sold = (p.sold || 0) + item.qty; 
                    await updateSingleProductInIDB(p); 
                }
            }
            triggerSyncWarning(); 
            
            finishCheckout(transactionData);
        } catch(e) { 
            console.error("Checkout Failed:", e);
            // Menampilkan alasan detail kenapa gagal
            Swal.fire('Transaksi Gagal', e.message, 'error'); 
        }
    } else {
        Swal.fire('Oops', 'Akses ke Google Drive belum siap. Coba refresh halaman.', 'warning');
    }
}

function finishCheckout(transactionData) {
    cart = [];
    document.getElementById('customer-name').value = ''; document.getElementById('table-number').value = ''; document.getElementById('order-notes').value = '';
    updateCartUI(); 
    if(window.innerWidth <= 992) toggleSidebar('cart-sidebar');

    Swal.fire({
        title: 'Berhasil!', text: 'Pesanan berhasil diproses.', icon: 'success',
        showCancelButton: true, confirmButtonText: '<i class="fa-solid fa-print"></i> Print Invoice',
        cancelButtonText: 'OK', confirmButtonColor: '#677E61', cancelButtonColor: '#6c757d'
    }).then((result) => {
        if (result.isConfirmed) { printInvoiceData(transactionData); }
    });
}

/* =========================================================
   CRUD & VIEW MANAGEMENT
========================================================= */
function switchView(view) {
    ['view-pos', 'view-crud', 'view-history', 'view-sold'].forEach(id => document.getElementById(id).classList.add('d-none'));
    document.querySelectorAll('.sidebar .nav-item').forEach(el => el.classList.remove('active'));
    
    if(view === 'pos') { document.getElementById('view-pos').classList.remove('d-none'); document.querySelectorAll('.sidebar .nav-item')[0].classList.add('active'); initApp(); } 
    else if (view === 'crud') { document.getElementById('view-crud').classList.remove('d-none'); document.querySelectorAll('.sidebar .nav-item')[1].classList.add('active'); renderCrudTable(); } 
    else if (view === 'history') { document.getElementById('view-history').classList.remove('d-none'); document.querySelectorAll('.sidebar .nav-item')[2].classList.add('active'); renderHistory(); }
    else if (view === 'sold') { document.getElementById('view-sold').classList.remove('d-none'); document.querySelectorAll('.sidebar .nav-item')[3].classList.add('active'); renderSoldProducts(); }
    if(window.innerWidth <= 992) toggleSidebar('sidebar'); 
}

async function renderCrudTable() {
    const products = await getAllProducts();
    document.getElementById('crud-table-body').innerHTML = products.map(p => `
        <tr>
            <td><img src="${p.img}" class="rounded" width="50" height="50" style="object-fit:cover;"></td>
            <td class="fw-semibold">${p.name}</td>
            <td><span class="badge bg-secondary">${p.category}</span></td>
            <td>Rp ${p.price.toLocaleString('id-ID')}</td>
            <td>${p.discount ? `<span class="badge" style="background:var(--c-red)">${p.discount}</span>` : '-'}</td>
            <td>
                <button class="btn btn-sm btn-outline-secondary me-1" onclick="openProductModal(${p.id})"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct(${p.id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`).join('');
}

async function openProductModal(id = null) {
    const products = await getAllProducts();
    let p = id ? products.find(x => x.id == id) : { name:'', category:'', price:'', img:'', discount:'' };
    
    let cats = ['All']; products.forEach(p => { if (!cats.includes(p.category)) cats.push(p.category); });
    const catOptions = cats.filter(c=>c!=='All').map(c => `<option value="${c}">`).join('');

    Swal.fire({
        title: id ? 'Edit Product' : 'Add New Product',
        html: `<input id="swal-name" class="swal2-input" placeholder="Nama Produk" value="${p.name}">
            <input id="swal-cat" list="kategori-list" class="swal2-input" placeholder="Kategori" value="${p.category}">
            <datalist id="kategori-list">${catOptions}</datalist>
            <input id="swal-price" type="number" class="swal2-input" placeholder="Harga (Rp)" value="${p.price}">
            <div style="margin-top:20px; text-align:left; font-size:14px; padding:0 20px;">
                <label class="fw-bold mb-1">Pilih File Gambar</label>
                <input type="file" id="swal-file" accept="image/*" class="form-control mb-2">
                <div class="text-center my-1 text-muted">ATAU URL</div>
                <input id="swal-img-link" class="form-control" placeholder="Paste URL Gambar" value="${p.img}">
            </div>
            <input id="swal-disc" class="swal2-input mt-3" placeholder="Diskon" value="${p.discount || ''}">`,
        showCancelButton: true, preConfirm: async () => {
            let imgUrl = document.getElementById('swal-img-link').value;
            const fileInput = document.getElementById('swal-file');
            if (fileInput.files.length > 0) {
                Swal.showLoading(); // Pakai loader bawaan khusus di form konfirmasi ini
                try { imgUrl = await uploadImageToDrive(fileInput.files[0]); } catch(e) { return Swal.showValidationMessage('Gagal upload gambar.'); }
            }
            return { 
                name: document.getElementById('swal-name').value, 
                category: document.getElementById('swal-cat').value || 'Uncategorized', 
                price: parseInt(document.getElementById('swal-price').value) || 0, 
                img: imgUrl || 'https://placehold.co/400?text=No+Image', 
                discount: document.getElementById('swal-disc').value || null,
                sold: p.sold || 0 
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const prodData = result.value;
            if (id) prodData.id = id; else prodData.id = Date.now();
            
            await updateSingleProductInIDB(prodData);
            triggerSyncWarning(); 
            renderCrudTable();
            Swal.fire('Tersimpan di IDB', 'Sistem akan mensinkronisasi ke Drive segera.', 'success');
        }
    });
}

function deleteProduct(id) {
    Swal.fire({ title: 'Hapus?', icon: 'warning', showCancelButton: true }).then(async (result) => {
        if (result.isConfirmed) {
            const tx = db.transaction(storeName, "readwrite");
            tx.objectStore(storeName).delete(id);
            tx.oncomplete = () => { triggerSyncWarning(); renderCrudTable(); Swal.fire('Terhapus', '', 'success'); };
        }
    });
}

/* =========================================================
   ORDER HISTORY, FILTER, & PAGINATION LOGIC
========================================================= */
let currentHistoryPage = 1;
const historyRowsPerPage = 15;
let filteredHistoryData = [];

async function renderHistory() {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Memuat riwayat pesanan dari Google Drive...</td></tr>';
    
    try {
        const query = `name contains 'Invoice' and '${appFolderId}' in parents and trashed=false`;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime desc&t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
        
        if(!res.ok) throw new Error("Gagal baca Drive");
        const data = await res.json();
        
        if(!data.files || data.files.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Belum ada transaksi</td></tr>'; 
            document.getElementById('history-pagination-info').innerText = 'Menampilkan 0 dari 0 data';
            document.getElementById('history-pagination-buttons').innerHTML = '';
            window.loadedInvoices = [];
            filteredHistoryData = [];
            return; 
        }
        
        // Ambil isi detail file invoice secara paralel
        const filePromises = data.files.map(async (f) => {
            const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
            return { fileId: f.id, json: await fileRes.json(), createdTime: f.createdTime };
        });

        window.loadedInvoices = await Promise.all(filePromises);
        filteredHistoryData = [...window.loadedInvoices]; // Salin ke data aktif filter
        
        currentHistoryPage = 1; // Reset ke halaman 1
        renderHistoryTable();
    } catch(e) { 
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-4">Gagal memuat riwayat dari Google Drive</td></tr>'; 
    }
}

// Fungsi Utama Render Tabel Berdasarkan Halaman & Filter
function renderHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    const infoEl = document.getElementById('history-pagination-info');
    const paginationEl = document.getElementById('history-pagination-buttons');

    if (filteredHistoryData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Tidak ada data yang cocok dengan filter pencarian</td></tr>';
        infoEl.innerText = 'Menampilkan 0 dari 0 data';
        paginationEl.innerHTML = '';
        return;
    }

    // Hitung Pagination
    const totalData = filteredHistoryData.length;
    const totalPages = Math.ceil(totalData / historyRowsPerPage);
    if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;

    const startIndex = (currentHistoryPage - 1) * historyRowsPerPage;
    const endIndex = startIndex + historyRowsPerPage;
    const paginatedData = filteredHistoryData.slice(startIndex, endIndex);

    // Render Baris Tabel
    tbody.innerHTML = paginatedData.map(({ fileId, json }) => {
        const dateStr = new Date(json.date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        const itemsSummary = json.items.map(i => `${i.name} (${i.qty}x)`).join(', ');
        
        return `<tr>
            <td>${dateStr}</td>
            <td class="fw-semibold text-secondary">#${json.id.replace('ORD-', '')}</td>
            <td class="fw-bold">${json.customer}</td>
            <td><span class="badge bg-light text-dark border">${json.table}</span></td>
            <td><small class="text-muted">${itemsSummary}</small></td>
            <td class="fw-bold text-success">Rp ${json.total.toLocaleString('id-ID')}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-primary me-1" onclick="viewInvoice('${fileId}')" title="Lihat Invoice"><i class="fa-solid fa-eye"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteInvoice('${fileId}')" title="Hapus"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');

    // Info Text Pagination
    infoEl.innerText = `Menampilkan ${startIndex + 1} - ${Math.min(endIndex, totalData)} dari ${totalData} data`;

    // Render Tombol Pagination Bootstrap
    let paginationHtml = '';
    // Tombol Previous
    paginationHtml += `<li class="page-item ${currentHistoryPage === 1 ? 'disabled' : ''}">
        <button class="page-link" onclick="changeHistoryPage(${currentHistoryPage - 1})">Prev</button>
    </li>`;

    // Nomor Halaman (Maksimal tampilkan beberapa atau sederhana)
    for (let i = 1; i <= totalPages; i++) {
        paginationHtml += `<li class="page-item ${currentHistoryPage === i ? 'active' : ''}">
            <button class="page-link" onclick="changeHistoryPage(${i})">${i}</button>
        </li>`;
    }

    // Tombol Next
    paginationHtml += `<li class="page-item ${currentHistoryPage === totalPages ? 'disabled' : ''}">
        <button class="page-link" onclick="changeHistoryPage(${currentHistoryPage + 1})">Next</button>
    </li>`;

    paginationEl.innerHTML = paginationHtml;
}

// Navigasi Halaman
function changeHistoryPage(page) {
    if (page < 1) return;
    const totalPages = Math.ceil(filteredHistoryData.length / historyRowsPerPage);
    if (page > totalPages) return;
    currentHistoryPage = page;
    renderHistoryTable();
}

// Filter Pencarian (Nama / ID) dan Tanggal
function filterHistoryData() {
    const searchText = document.getElementById('history-search').value.toLowerCase();
    const dateFilterVal = document.getElementById('history-date-filter').value; // Format: YYYY-MM-DD

    filteredHistoryData = window.loadedInvoices.filter(({ json }) => {
        const orderId = json.id.toLowerCase();
        const customerName = json.customer.toLowerCase();
        
        // Cek kecocokan Search (ID atau Nama Pemesan)
        const matchesSearch = orderId.includes(searchText) || customerName.includes(searchText);

        // Cek kecocokan Tanggal (Ambil tanggal YYYY-MM-DD dari json.date)
        let matchesDate = true;
        if (dateFilterVal) {
            const orderDateStr = new Date(json.date).toISOString().slice(0, 10);
            matchesDate = (orderDateStr === dateFilterVal);
        }

        return matchesSearch && matchesDate;
    });

    currentHistoryPage = 1; // Kembalikan ke halaman pertama setiap kali memfilter
    renderHistoryTable();
}

// Reset Filter
function resetHistoryFilter() {
    document.getElementById('history-search').value = '';
    document.getElementById('history-date-filter').value = '';
    filteredHistoryData = [...(window.loadedInvoices || [])];
    currentHistoryPage = 1;
    renderHistoryTable();
}

function deleteInvoice(fileId) {
    Swal.fire({ title: 'Hapus Nota ini?', text: 'File akan dihapus dari Google Drive!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' })
    .then(async (result) => {
        if (result.isConfirmed) {
            showCustomLoader('Menghapus Nota...');
            try {
                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                    method: 'DELETE', headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                renderHistory(); 
                Swal.fire('Terhapus!', 'Nota berhasil dihapus.', 'success');
            } catch(e) { Swal.fire('Error', 'Gagal menghapus nota', 'error'); }
        }
    });
}

async function viewInvoice(fileId) {
    showCustomLoader('Membuka Invoice...');
    try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${accessToken}` }});
        const data = await res.json();
        currentInvoiceData = data; 
        
        let itemsHtml = data.items.map(i => `<tr><td class="col-item">${i.name}</td><td class="col-qty">${i.qty}</td><td class="col-price">Rp ${i.price.toLocaleString('id-ID')}</td><td class="col-total">Rp ${(i.price * i.qty).toLocaleString('id-ID')}</td></tr>`).join('');
        const dateFormatted = new Date(data.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        Swal.fire({
            showConfirmButton: false, customClass: { popup: 'swal-invoice-popup' }, 
            html: `
            <div class="custom-invoice">
                <div class="mac-dots"><span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span></div>
                <div class="invoice-header"><p>Invoice for</p><h2>${data.customer}</h2></div>
                <div class="invoice-meta d-flex justify-content-between"><span>${dateFormatted}</span><span>Table/Type: <strong>${data.table}</strong></span></div>
                <div class="invoice-table-bg">
                    <table class="invoice-table"><thead><tr><th class="col-item">Item</th><th class="col-qty">Qty</th><th class="col-price">Price</th><th class="col-total">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
                </div>
                ${data.notes && data.notes !== "-" ? `<div class="mb-3 text-muted" style="font-size:0.85rem"><b>Notes:</b> ${data.notes}</div>` : ''}
                <div class="invoice-total"><span>Total amount:</span> <strong>Rp ${data.total.toLocaleString('id-ID')}</strong></div>
                <div class="d-flex gap-2 mt-4"><button class="btn-print-invoice flex-grow-1" onclick="printInvoiceData(currentInvoiceData)"><i class="fa-solid fa-print"></i> Print</button><button class="btn-close-invoice" onclick="Swal.close()">Close</button></div>
            </div>`
        });
    } catch(e) { Swal.fire('Error', 'File terhapus.', 'error'); }
}

function printInvoiceData(data) {
    let itemsHtml = data.items.map(i => `<tr><td style="text-align: left; padding: 8px 0; border-bottom: 1px dashed #ccc;">${i.name}</td><td style="text-align: center; padding: 8px 0; border-bottom: 1px dashed #ccc;">${i.qty}</td><td style="text-align: right; padding: 8px 0; border-bottom: 1px dashed #ccc;">Rp ${(i.price * i.qty).toLocaleString('id-ID')}</td></tr>`).join('');
    const dateStr = new Date(data.date).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const printWindow = window.open('', '', 'height=600,width=400');
    printWindow.document.write(`<html><head><title>Invoice</title><style>body { font-family: monospace; padding: 20px; font-size: 14px; } h2 { text-align: center; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px;} th { border-bottom: 2px solid #000; padding-bottom: 8px; } .total { display: flex; justify-content: space-between; font-weight: bold; border-top: 2px solid #000; padding-top: 10px; }</style></head><body><h2>PLATESCAPE POS</h2><div style="text-align:center;">Receipt</div><p><strong>Cust:</strong> ${data.customer}<br><strong>Date:</strong> ${dateStr}<br><strong>Type:</strong> ${data.table}</p><table><thead><tr><th style="text-align: left;">Item</th><th>Qty</th><th style="text-align: right;">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>${data.notes && data.notes !== "-" ? `<div><b>Notes:</b> ${data.notes}</div>` : ''}<div class="total"><span>TOTAL:</span><span>Rp ${data.total.toLocaleString('id-ID')}</span></div><div style="text-align:center; margin-top: 30px;">Thank you!</div><script>window.onload=function(){window.print();}</script></body></html>`);
    printWindow.document.close();
}

/* =========================================================
   FITUR TABEL PRODUK TERJUAL (DIPERBARUI)
========================================================= */
async function renderSoldProducts() {
    const products = await getAllProducts();
    let soldProducts = products.filter(p => p.sold && p.sold > 0);
    soldProducts.sort((a, b) => b.sold - a.sold);

    const tbody = document.getElementById('sold-table-body');
    if(soldProducts.length === 0) { 
        // Colspan diubah menjadi 5 karena ada tambahan kolom aksi
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Belum ada data penjualan.</td></tr>'; 
        return; 
    }

    tbody.innerHTML = soldProducts.map(p => {
        let revenue = p.price * p.sold; 
        return `
        <tr>
            <td class="fw-semibold">
                <img src="${p.img}" class="rounded me-2" width="30" height="30" style="object-fit:cover;">
                ${p.name}
            </td>
            <td><span class="badge bg-secondary">${p.category}</span></td>
            <td class="text-center fw-bold">${p.sold}</td>
            <td class="text-end fw-bold text-success">Rp ${revenue.toLocaleString('id-ID')}</td>
            <td class="text-center">
                <button class="btn btn-sm btn-outline-secondary me-1" onclick="editSoldProduct(${p.id})" title="Edit Jumlah"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteSoldProduct(${p.id})" title="Reset / Hapus dari Laporan"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// FUNGSI BARU: Edit Jumlah Terjual
async function editSoldProduct(id) {
    const products = await getAllProducts();
    let p = products.find(x => x.id == id);
    
    if(!p) return;

    Swal.fire({
        title: 'Edit Penjualan',
        text: `Koreksi total terjual untuk ${p.name}:`,
        input: 'number',
        inputValue: p.sold,
        showCancelButton: true,
        confirmButtonColor: '#677E61',
        confirmButtonText: 'Simpan',
        inputValidator: (value) => {
            if (!value || value < 0) {
                return 'Jumlah tidak boleh kosong atau bernilai negatif!';
            }
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            p.sold = parseInt(result.value);
            await updateSingleProductInIDB(p); // Simpan ke IndexedDB lokal
            triggerSyncWarning();              // Munculkan notifikasi "Belum Tersimpan"
            renderSoldProducts();              // Refresh tabel
            Swal.fire('Tersimpan', 'Data penjualan diperbarui.', 'success');
        }
    });
}

// FUNGSI BARU: Hapus (Reset) dari Laporan
function deleteSoldProduct(id) {
    Swal.fire({ 
        title: 'Hapus dari Laporan?', 
        text: 'Total terjual untuk produk ini akan di-reset menjadi 0.', 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#d33',
        confirmButtonText: 'Ya, Reset Data!' 
    }).then(async (result) => {
        if (result.isConfirmed) {
            const products = await getAllProducts();
            let p = products.find(x => x.id == id);
            
            if(p) {
                p.sold = 0; // Mengembalikan jumlah terjual ke 0
                await updateSingleProductInIDB(p);
                triggerSyncWarning();
                renderSoldProducts();
                Swal.fire('Di-reset!', 'Data penjualan dikembalikan ke 0.', 'success');
            }
        }
    });
}

// FUNGSI EXPORT KE CSV BERDASARKAN FILTER AKTIF
function exportHistoryToCSV() {
    if (!filteredHistoryData || filteredHistoryData.length === 0) {
        return Swal.fire('Kosong', 'Tidak ada data riwayat yang tersedia untuk diexport.', 'warning');
    }

    let csvContent = "data:text/csv;charset=utf-8,ID Pesanan,Tanggal,Nama Pemesan,Meja/Tipe,Catatan,Detail Item,Total Harga (Rp)\r\n";

    filteredHistoryData.forEach(({ json }) => {
        let date = new Date(json.date).toLocaleString('id-ID');
        let customer = `"${json.customer}"`;
        let table = `"${json.table}"`;
        let notes = `"${(json.notes || '-').replace(/"/g, '""')}"`;
        let items = `"${json.items.map(i => `${i.name} (${i.qty}x)`).join('; ')}"`;
        let total = json.total;

        let row = [json.id, date, customer, table, notes, items, total].join(",");
        csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Laporan_Pesanan_Platescape_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    Swal.fire({
        icon: 'success',
        title: 'Berhasil Export!',
        text: 'File CSV laporan berhasil diunduh.',
        timer: 2000,
        showConfirmButton: false
    });
}

// function toggleSidebar(id) { document.getElementById(id).classList.toggle('show'); }

function toggleSidebar(id) { document.getElementById(id).classList.toggle('show'); }