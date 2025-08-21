// qr_absensi_app/static/js/attendance_records.js

document.addEventListener('DOMContentLoaded', function() {
    const filterDateInput = document.getElementById('filter_date');
    const applyFilterButton = document.getElementById('applyFilter');
    const attendanceTableBody = document.getElementById('attendanceTableBody');
    const noRecordsMessage = document.getElementById('noRecordsMessage');

    let currentFilterDate = filterDateInput.value;
    let refreshInterval; // Variabel untuk menyimpan interval refresh

    // Fungsi untuk menampilkan pesan flash (mirip dengan Flask flash)
    function showFlashMessage(message, type = 'success') {
        const flashContainer = document.querySelector('main.container .mb-4');
        if (!flashContainer) return; // Pastikan container ada

        const div = document.createElement('div');
        div.className = `flash-message ${type} mb-4`;
        div.textContent = message;

        flashContainer.appendChild(div);

        setTimeout(() => {
            div.remove();
        }, 3000); // Pesan akan hilang setelah 3 detik
    }


    // Fungsi untuk mengambil data absensi dari API dan memperbarui tabel
    async function fetchAndRenderAttendance() {
        console.log(`Fetching attendance for date: ${currentFilterDate}`);
        try {
            const response = await fetch(`/api/attendance_data?date=${currentFilterDate}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const records = await response.json();

            attendanceTableBody.innerHTML = ''; // Kosongkan tabel sebelum mengisi ulang
            if (records.length > 0) {
                noRecordsMessage.classList.add('hidden');
                records.forEach(record => {
                    const row = document.createElement('tr');
                    row.className = 'hover:bg-gray-50';
                    row.innerHTML = `
                        <td class="px-5 py-5 border-b border-gray-200 bg-white text-sm">${record.nama}</td>
                        <td class="px-5 py-5 border-b border-gray-200 bg-white text-sm">${record.nis}</td>
                        <td class="px-5 py-5 border-b border-gray-200 bg-white text-sm">${record.waktu}</td>
                        <td class="px-5 py-5 border-b border-gray-200 bg-white text-sm">
                            <form class="delete-form" data-absen-id="${record.absen_id}" method="post">
                                <button type="submit" class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg shadow-md text-xs transition duration-300">
                                    Hapus
                                </button>
                            </form>
                        </td>
                    `;
                    attendanceTableBody.appendChild(row);
                });

                // Tambahkan event listener ke tombol hapus yang baru dibuat
                document.querySelectorAll('.delete-form').forEach(form => {
                    form.addEventListener('submit', async function(event) {
                        event.preventDefault(); // Mencegah form submit default

                        const absenId = this.dataset.absenId;
                        if (confirm('Apakah Anda yakin ingin menghapus catatan absensi ini?')) {
                            try {
                                const deleteResponse = await fetch(`/admin/delete_attendance/${absenId}`, {
                                    method: 'POST'
                                });
                                const responseText = await deleteResponse.text(); // Ambil respons teks
                                console.log('Delete response:', responseText); // Log respons untuk debugging

                                if (deleteResponse.ok) {
                                    showFlashMessage('Catatan absensi berhasil dihapus!', 'success');
                                    fetchAndRenderAttendance(); // Perbarui tabel setelah penghapusan
                                } else {
                                    showFlashMessage('Gagal menghapus catatan absensi.', 'error');
                                }
                            } catch (error) {
                                console.error('Error deleting attendance record:', error);
                                showFlashMessage('Terjadi kesalahan saat menghapus catatan absensi.', 'error');
                            }
                        }
                    });
                });

            } else {
                noRecordsMessage.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error fetching attendance records:', error);
            showFlashMessage('Gagal memuat data absensi. Silakan coba lagi.', 'error');
            attendanceTableBody.innerHTML = ''; // Kosongkan tabel jika ada error
            noRecordsMessage.classList.remove('hidden'); // Tampilkan pesan tidak ada data
        }
    }

    // Fungsi untuk memulai atau mereset interval refresh
    function startRefreshInterval() {
        if (refreshInterval) {
            clearInterval(refreshInterval); // Hentikan interval lama jika ada
        }
        refreshInterval = setInterval(fetchAndRenderAttendance, 5000); // Refresh setiap 5 detik
    }

    // Event listener untuk tombol filter
    applyFilterButton.addEventListener('click', function() {
        const newFilterDate = filterDateInput.value;
        if (newFilterDate !== currentFilterDate) {
            currentFilterDate = newFilterDate;
            fetchAndRenderAttendance(); // Ambil data dengan tanggal baru
            startRefreshInterval(); // Mulai ulang interval dengan tanggal baru
        }
    });

    // Event listener untuk perubahan input tanggal (opsional, jika ingin auto-filter)
    filterDateInput.addEventListener('change', function() {
        // Otomatis terapkan filter saat tanggal berubah
        // currentFilterDate = filterDateInput.value; // Ini akan dilakukan oleh tombol applyFilter
        // fetchAndRenderAttendance();
        // startRefreshInterval();
    });

    // Panggil fungsi pertama kali saat halaman dimuat
    fetchAndRenderAttendance();
    startRefreshInterval(); // Mulai refresh secara berkala
});
