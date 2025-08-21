# qr_absensi_app/app.py

from flask import Flask, render_template, request, redirect, url_for, flash, jsonify, send_from_directory
import pymysql.cursors
import qrcode
from PIL import Image
import os
from datetime import datetime
from config import Config

app = Flask(__name__)
app.config.from_object(Config)

# Pastikan folder untuk QR codes ada
QR_CODE_FOLDER = os.path.join(app.root_path, 'static', 'qr_codes')
if not os.path.exists(QR_CODE_FOLDER):
    os.makedirs(QR_CODE_FOLDER)

# Context processor untuk membuat objek datetime tersedia di semua template
@app.context_processor
def inject_datetime():
    return dict(datetime=datetime)

# Fungsi untuk menghubungkan ke database MySQL
def get_db_connection():
    return pymysql.connect(host=app.config['MYSQL_HOST'],
                           user=app.config['MYSQL_USER'],
                           password=app.config['MYSQL_PASSWORD'],
                           database=app.config['MYSQL_DB'],
                           cursorclass=pymysql.cursors.DictCursor)

@app.route('/')
def index():
    """Rute untuk halaman utama."""
    return render_template('index.html')

@app.route('/admin')
def admin_dashboard():
    """Rute untuk dashboard admin."""
    return render_template('admin_dashboard.html')

@app.route('/admin/add_student', methods=('GET', 'POST'))
def add_student():
    """Rute untuk menambah data mahasiswa."""
    if request.method == 'POST':
        nama = request.form['nama']
        nis = request.form['nis']

        if not nama or not nis:
            flash('Nama dan NIM wajib diisi!', 'error')
        else:
            conn = get_db_connection()
            try:
                with conn.cursor() as cursor:
                    # Cek apakah NIS sudah ada
                    cursor.execute("SELECT * FROM siswa WHERE nis = %s", (nis,))
                    existing_student = cursor.fetchone()
                    if existing_student:
                        flash('NIM sudah terdaftar!', 'error')
                    else:
                        cursor.execute("INSERT INTO siswa (nama, nis) VALUES (%s, %s)", (nama, nis))
                        conn.commit()
                        siswa_id = cursor.lastrowid

                        # Generate QR Code
                        qr_data = f"{nis}" # Menggunakan NIS sebagai data QR
                        qr = qrcode.QRCode(
                            version=1,
                            error_correction=qrcode.constants.ERROR_CORRECT_L,
                            box_size=10,
                            border=4,
                        )
                        qr.add_data(qr_data)
                        qr.make(fit=True)
                        img = qr.make_image(fill_color="black", back_color="white")
                        qr_filename = f"qr_{siswa_id}_{nis}.png"
                        img.save(os.path.join(QR_CODE_FOLDER, qr_filename))
                        flash('Mahasiswa berhasil ditambahkan dan QR code dibuat!', 'success')
                        return redirect(url_for('student_list'))
            except pymysql.Error as e:
                flash(f"Terjadi kesalahan database: {e}", 'error')
                conn.rollback()
            finally:
                conn.close()
    return render_template('add_student.html')

@app.route('/admin/students')
def student_list():
    """Rute untuk menampilkan daftar mahasiswa."""
    conn = get_db_connection()
    students = []
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM siswa")
            students = cursor.fetchall()
    except pymysql.Error as e:
        flash(f"Terjadi kesalahan saat mengambil data mahasiswa: {e}", 'error')
    finally:
        conn.close()

    # Tambahkan path QR code ke setiap siswa
    for student in students:
        student['qr_code_path'] = url_for('static', filename=f'qr_codes/qr_{student["id"]}_{student["nis"]}.png')
    return render_template('student_list.html', students=students)

@app.route('/admin/delete_student/<int:student_id>', methods=['POST'])
def delete_student(student_id):
    """Rute untuk menghapus mahasiswa."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Hapus terlebih dahulu data absen yang terkait dengan siswa ini
            cursor.execute("DELETE FROM absen WHERE siswa_id = %s", (student_id,))
            # Dapatkan NIS siswa untuk menghapus file QR
            cursor.execute("SELECT nis FROM siswa WHERE id = %s", (student_id,))
            student_data = cursor.fetchone()
            if student_data:
                nis = student_data['nis']
                qr_filename = f"qr_{student_id}_{nis}.png"
                qr_filepath = os.path.join(QR_CODE_FOLDER, qr_filename)
                if os.path.exists(qr_filepath):
                    os.remove(qr_filepath)
            
            # Hapus data siswa
            cursor.execute("DELETE FROM siswa WHERE id = %s", (student_id,))
            conn.commit()
            flash('Mahasiswa berhasil dihapus!', 'success')
    except pymysql.Error as e:
        flash(f"Terjadi kesalahan saat menghapus mahasiswa: {e}", 'error')
        conn.rollback()
    finally:
        conn.close()
    return redirect(url_for('student_list'))


@app.route('/absen')
def attendance_scanner():
    """Rute untuk halaman pemindaian absensi."""
    return render_template('attendance_scanner.html')

@app.route('/scan_qr', methods=['POST'])
def scan_qr():
    """API endpoint untuk menerima data QR yang dipindai."""
    qr_data = request.json.get('qr_data')
    if not qr_data:
        return jsonify({'status': 'error', 'message': 'Data QR tidak ditemukan.'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Cari siswa berdasarkan NIS (data QR)
            cursor.execute("SELECT id, nama FROM siswa WHERE nis = %s", (qr_data,))
            siswa = cursor.fetchone()

            if siswa:
                siswa_id = siswa['id']
                nama_siswa = siswa['nama']

                # Cek apakah siswa sudah absen hari ini
                today = datetime.now().date()
                cursor.execute(
                    "SELECT * FROM absen WHERE siswa_id = %s AND DATE(waktu) = %s",
                    (siswa_id, today)
                )
                already_absen = cursor.fetchone()

                if already_absen:
                    return jsonify({
                        'status': 'warning',
                        'message': f'{nama_siswa} sudah absen hari ini.',
                        'nama': nama_siswa
                    })
                else:
                    # Catat absensi
                    cursor.execute("INSERT INTO absen (siswa_id, waktu) VALUES (%s, %s)", (siswa_id, datetime.now()))
                    conn.commit()
                    return jsonify({
                        'status': 'success',
                        'message': f'Absensi {nama_siswa} berhasil dicatat!',
                        'nama': nama_siswa,
                        'waktu': datetime.now().strftime('%H:%M:%S')
                    })
            else:
                return jsonify({'status': 'error', 'message': 'Mahasiswa tidak ditemukan.'})
    except pymysql.Error as e:
        conn.rollback()
        return jsonify({'status': 'error', 'message': f'Terjadi kesalahan database: {e}'}), 500
    finally:
        conn.close()

@app.route('/admin/attendance_records', methods=['GET'])
def attendance_records():
    """Rute untuk menampilkan halaman daftar absensi (tidak lagi memuat data langsung)."""
    selected_date = request.args.get('filter_date', datetime.now().strftime('%Y-%m-%d'))
    return render_template('attendance_records.html', selected_date=selected_date)

@app.route('/api/attendance_data', methods=['GET'])
def api_attendance_data():
    """API endpoint untuk mengambil data absensi dalam format JSON."""
    selected_date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
    conn = get_db_connection()
    records = []
    try:
        with conn.cursor() as cursor:
            query = """
                SELECT
                    a.id AS absen_id,
                    s.nama,
                    s.nis,
                    a.waktu
                FROM
                    absen a
                JOIN
                    siswa s ON a.siswa_id = s.id
                WHERE DATE(a.waktu) = %s
                ORDER BY a.waktu DESC
            """
            cursor.execute(query, (selected_date,))
            records_raw = cursor.fetchall()
            # Format waktu ke string agar bisa di-serialize ke JSON
            records = [
                {
                    'absen_id': r['absen_id'],
                    'nama': r['nama'],
                    'nis': r['nis'],
                    'waktu': r['waktu'].strftime('%d-%m-%Y %H:%M:%S')
                }
                for r in records_raw
            ]
    except pymysql.Error as e:
        return jsonify({'error': f'Terjadi kesalahan database: {e}'}), 500
    finally:
        conn.close()
    return jsonify(records)


@app.route('/admin/delete_attendance/<int:absen_id>', methods=['POST'])
def delete_attendance(absen_id):
    """Rute untuk menghapus catatan absensi."""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM absen WHERE id = %s", (absen_id,))
            conn.commit()
            flash('Catatan absensi berhasil dihapus!', 'success')
    except pymysql.Error as e:
        flash(f"Terjadi kesalahan saat menghapus catatan absensi: {e}", 'error')
        conn.rollback()
    finally:
        conn.close()
    return redirect(url_for('attendance_records'))


if __name__ == '__main__':
    app.run(debug=True)
