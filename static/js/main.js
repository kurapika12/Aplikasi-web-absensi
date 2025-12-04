// qr_absensi_app/static/js/main.js

document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('preview');
    const scanResultDiv = document.getElementById('scanResult');
    const statusPopup = document.getElementById('statusPopup');
    const popupContent = document.getElementById('popupContent');
    const popupTitle = document.getElementById('popupTitle');
    const popupMessage = document.getElementById('popupMessage');
    const loadingMessage = document.getElementById('loadingMessage');
    const startScanButton = document.getElementById('startScanButton');

    let scanner = null;
    let scanTimeout = null; // Untuk mencegah pemindaian berulang dalam waktu singkat

    // Fungsi untuk menampilkan pop-up
    function showPopup(title, message, type = 'success', duration = 1500) {
        popupTitle.textContent = title;
        popupMessage.textContent = message;

        // Reset classes
        popupContent.className = 'bg-white p-8 rounded-xl shadow-2xl z-10 text-center transform transition-all duration-300';

        if (type === 'success') {
            popupContent.classList.add('bg-green-100', 'text-green-800');
            popupTitle.classList.add('text-green-700');
            popupMessage.classList.add('text-green-600');
        } else if (type === 'error') {
            popupContent.classList.add('bg-red-100', 'text-red-800');
            popupTitle.classList.add('text-red-700');
            popupMessage.classList.add('text-red-600');
        } else if (type === 'warning') {
            popupContent.classList.add('bg-yellow-100', 'text-yellow-800');
            popupTitle.classList.add('text-yellow-700');
            popupMessage.classList.add('text-yellow-600');
        } else {
            popupContent.classList.add('bg-blue-100', 'text-blue-800'); // Default blue
            popupTitle.classList.add('text-blue-700');
            popupMessage.classList.add('text-blue-600');
        }

        statusPopup.classList.remove('hidden');
        setTimeout(() => {
            popupContent.classList.add('scale-100', 'opacity-100');
        }, 10); // Sedikit delay untuk transisi

        setTimeout(() => {
            popupContent.classList.remove('scale-100', 'opacity-100');
            popupContent.classList.add('scale-0', 'opacity-0');
            setTimeout(() => {
                statusPopup.classList.add('hidden');
            }, 300); // Sembunyikan setelah transisi selesai
        }, duration);
    }

    // Fungsi untuk memulai pemindaian
    function startScanner() {
        // Cek apakah scanner sudah aktif
        if (scanner && scanner.isScanning) {
            return;
        }

        loadingMessage.classList.remove('hidden');
        if (startScanButton) { // Check if button exists before hiding
            startScanButton.classList.add('hidden'); // Sembunyikan tombol saat memindai
        }


        scanner = new Instascan.Scanner({
            video: video,
            scanPeriod: 5, // Pindai setiap 5ms
            mirror: false // Camera will be mirrored in CSS
        });

        scanner.addListener('scan', function (content) {
            if (scanTimeout) return; // Jangan proses jika masih dalam cooldown

            scanResultDiv.textContent = `Memproses QR code: ${content}`;
            
            // Set cooldown untuk 2 detik (2000 ms)
            scanTimeout = setTimeout(() => {
                scanTimeout = null; // Reset setelah cooldown
            }, 2000);

            // Kirim data QR ke Flask backend
            fetch('/scan_qr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ qr_data: content })
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    showPopup('Berhasil!', `Absensi ${data.nama} dicatat.`, 'success');
                    scanResultDiv.textContent = `Absensi ${data.nama} berhasil dicatat pada ${data.waktu}`;
                } else if (data.status === 'warning') {
                    showPopup('Perhatian!', data.message, 'warning');
                    scanResultDiv.textContent = data.message;
                } else {
                    showPopup('Gagal!', data.message, 'error');
                    scanResultDiv.textContent = `Gagal: ${data.message}`;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showPopup('Error!', 'Terjadi kesalahan jaringan atau server.', 'error');
                scanResultDiv.textContent = 'Terjadi kesalahan saat berkomunikasi dengan server.';
            });
        });

        Instascan.Camera.getCameras().then(function (cameras) {
            console.log('Kamera yang terdeteksi:', cameras); // Log kamera yang ditemukan di konsol browser
            if (cameras.length > 0) {
                // Instascan.Camera.getCameras() mengembalikan array objek kamera.
                // cameras[0] adalah kamera default (seringkali webcam internal).
                // Jika Anda punya webcam eksternal atau virtual, mungkin ada di cameras[1] atau seterusnya.
                // Anda bisa mencoba cameras[1] jika cameras[0] tidak berfungsi.
                scanner.start(cameras[0]).then(() => {
                    console.log('Kamera berhasil dimulai.');
                    loadingMessage.classList.add('hidden');
                    scanResultDiv.textContent = 'Arahkan QR code ke kamera.';
                }).catch(e => {
                    console.error('Gagal memulai kamera:', e);
                    loadingMessage.textContent = `Gagal memulai kamera: ${e.name}. Coba kamera lain atau periksa izin.`;
                    showPopup('Error Kamera', 'Gagal memulai kamera yang dipilih.', 'error', 5000);
                });
            } else {
                console.error('Tidak ada kamera yang ditemukan.');
                loadingMessage.textContent = 'Tidak ada kamera yang ditemukan. Pastikan kamera terhubung dan diizinkan.';
                showPopup('Error Kamera', 'Tidak ada kamera yang ditemukan.', 'error', 5000);
            }
        }).catch(function (e) {
            console.error('Gagal mendapatkan akses kamera:', e);
            loadingMessage.textContent = `Akses kamera ditolak atau terjadi kesalahan: ${e.name}`;
            showPopup('Error Kamera', 'Akses kamera ditolak. Harap izinkan akses kamera di browser Anda.', 'error', 5000);
        });
    }

    // Event listener untuk tombol "Mulai Pindai QR"
    if (startScanButton) {
        startScanButton.addEventListener('click', startScanner);
    }

    // Jika ini halaman absensi, otomatis mulai pemindai ketika halaman dimuat
    // agar pengguna tidak perlu mengklik tombol lagi.
    // Cek apakah video element ada untuk memastikan kita di halaman yang benar
    if (video && window.location.pathname === '/absen') {
        startScanner();
    }
});
