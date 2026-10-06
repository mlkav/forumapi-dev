# Forum API — Proyek 2

Forum API dibangun dengan Node.js, Express, PostgreSQL, dan Clean Architecture. API menyediakan autentikasi, thread, comment, reply, soft delete, serta endpoint like/unlike comment dengan jumlah like pada detail thread.

## Fitur dan route

| Method | Route | Access |
| --- | --- | --- |
| `POST` | `/users` | Public |
| `POST` | `/authentications` | Public |
| `PUT` | `/authentications` | Refresh token |
| `DELETE` | `/authentications` | Authenticated |
| `POST` | `/threads` | Authenticated |
| `GET` | `/threads/{threadId}` | Public |
| `POST` | `/threads/{threadId}/comments` | Authenticated |
| `DELETE` | `/threads/{threadId}/comments/{commentId}` | Authenticated, owner |
| `PUT` | `/threads/{threadId}/comments/{commentId}/likes` | Authenticated |
| `POST` | `/threads/{threadId}/comments/{commentId}/replies` | Authenticated |
| `DELETE` | `/threads/{threadId}/comments/{commentId}/replies/{replyId}` | Authenticated, owner |
| `GET` | `/health` | Public liveness check |

`PUT .../likes` men-toggle state untuk user pada access token: request pertama membuat like dan request berikutnya menghapusnya. Like terikat pada pasangan user/comment yang unik. Transaksi mengunci comment aktif agar toggle berurutan dengan aman. `GET /threads/{threadId}` mengembalikan `likeCount` integer yang dihitung dari PostgreSQL untuk setiap comment, termasuk comment yang di-soft-delete.

## Persyaratan lokal

- Node.js 22 atau versi LTS yang kompatibel.
- PostgreSQL 16 (versi lokal yang didukung project juga dapat digunakan).
- npm.

## Environment variables

Salin `.env.example` ke `.env`, lalu isi nilai lokal. Jangan commit `.env` atau credential.

| Variable | Keterangan |
| --- | --- |
| `NODE_ENV` | `development`, `test`, atau `production` |
| `PORT` | Port HTTP aplikasi |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Koneksi database environment aktif |
| `TEST_PGDATABASE` | Nama database terisolasi untuk test; wajib berakhiran `_test` |
| `ACCESS_TOKEN_KEY`, `REFRESH_TOKEN_KEY` | Signing key berbeda dan rahasia |
| `ACCESS_TOKEN_AGE` | Lifetime access token, misalnya `1h` |

Untuk production, atur variable tersebut di file environment yang hanya tersedia pada VM, bukan di image, workflow, atau repository. Gunakan database production terpisah dari `forumapi_test`.

## Development dan migration

```bash
npm ci
cp .env.example .env
# Isi .env dengan konfigurasi development dan secret lokal yang baru.
npm run migrate -- up
npm run start:dev
```

Aplikasi berjalan di `http://localhost:3000` secara default. `GET /health` mengembalikan `{"status":"success"}` sebagai liveness check.

Jalankan migration test hanya pada database test:

```bash
npm run migrate:test -- up
```

Script test dikunci ke `forumapi_test`. File konfigurasi kredensial database test lokal berada di `config/database/test.json` dan sengaja diabaikan Git. Untuk instalasi bersih, buat file itu dari environment lokal/CI dengan `user`, `password`, `host`, `port`, dan `database: forumapi_test`. Jangan mengarahkan test ke database development atau production.

## Test, coverage, dan lint

```bash
npm run test
npm run test:coverage
npm run lint
npm audit
```

Vitest menjalankan unit test, integration test repository PostgreSQL, dan functional test HTTP. Coverage diberi threshold 100% untuk statements, branches, functions, dan lines. Sebelum menjalankan test pada database baru, buat database terisolasi lalu jalankan migration test.

## Postman

Collection dan environment assignment Proyek 2 berada di folder `../Forum API V2 Test/`. Siapkan database test, lalu jalankan server khusus Postman agar request tidak menyentuh database development/production:

```bash
npm run migrate:test -- up
NODE_ENV=test TEST_PGDATABASE=forumapi_test PORT=5000 npm run start
newman run "../Forum API V2 Test/Forum API V2 Test.postman_collection.json" \
  --environment "../Forum API V2 Test/Forum API V2 Test.postman_environment.json"
```

Untuk menjalankan terhadap deployment, gunakan salinan environment Postman dengan protocol `https`, host domain production, port kosong/default HTTPS, dan token yang diperoleh dari alur register/login. Jangan simpan token atau credential di collection yang di-commit. Jalankan request seperti berikut untuk memeriksa toggle:

1. Login dan buat thread/comment menggunakan request authenticated.
2. `PUT /threads/{threadId}/comments/{commentId}/likes` dengan token user pertama.
3. `GET /threads/{threadId}` tanpa token dan pastikan `likeCount` naik.
4. Ulangi `PUT` dengan user yang sama dan pastikan count turun.
5. Ulangi dengan user kedua untuk memeriksa count multi-user.

## GitHub Actions CI

Workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) berjalan untuk Pull Request dan push ke `main`/`master`. Workflow membuat PostgreSQL service khusus test, membuat konfigurasi koneksi sementara dari environment runner, menjalankan migration, lint, serta seluruh test dengan coverage. Signing keys dibuat secara ephemeral pada runner; tidak menggunakan secret production.

## Google Cloud Platform deployment

Deployment yang disediakan menargetkan Compute Engine dengan systemd, NGINX reverse proxy, dan PostgreSQL terkelola Cloud SQL. Database production dan test harus terpisah. Tidak ada credential, nama project, alamat IP, domain, atau URL produksi yang disimpan dalam source code.

### 1. Siapkan project, database, dan VM

1. Buat/pilih GCP project dan aktifkan Compute Engine, Cloud SQL Admin, dan Identity-Aware Proxy API.
2. Buat VPC dan Cloud SQL for PostgreSQL. Utamakan private IP dan konektivitas internal dari VM; jangan membuka port PostgreSQL ke internet. Buat database dan database user production yang terpisah dari `forumapi_test`.
3. Buat VM Ubuntu LTS pada Compute Engine dengan service account khusus deployment/runtime berizin minimum. Tetapkan reserved external IP untuk HTTP(S) dan arahkan record DNS domain API ke IP tersebut.
4. Firewall ingress hanya membuka TCP `80`/`443` ke VM. Untuk SSH melalui IAP, batasi TCP `22` ke rentang IAP TCP forwarding `35.235.240.0/20`; jangan membuka port aplikasi `3000` atau PostgreSQL ke publik.
5. Aktifkan OS Login. Beri service account GitHub Actions hanya izin yang diperlukan untuk koneksi IAP/OS Login ke VM (misalnya IAP tunnel access dan OS Login), tanpa Owner/Editor project.
6. Pasang Node.js 22, NGINX, Git, dan Certbot pada VM. Buat akun sistem `forum-api` dan akun deployment terpisah; jadikan akun deployment anggota group `forum-api` agar dapat membaca environment/runtime files yang dibatasi group. Batasi direktori aplikasi ke akun/group tersebut.
7. Pasang Cloud SQL Auth Proxy v2 pada VM sebagai service systemd terpisah. Jalankan proxy dengan service account runtime yang hanya memiliki `roles/cloudsql.client`, private IP, dan listener lokal `127.0.0.1:5432`; gunakan nama koneksi instance Cloud SQL yang tepat. Jangan memberi VM public IP database atau membuka port database pada firewall.

### 2. Siapkan aplikasi dan secret pada VM

1. Clone repository ke `/opt/forum-api` dengan deploy key read-only untuk akun GitHub, lalu atur ownership/group agar akun deploy dapat melakukan fast-forward update dan akun `forum-api` dapat membaca source.
2. Buat `/etc/forum-api/forum-api.env` dengan format `KEY=value`, permission `root:forum-api` dan mode `0640`. Isinya mencakup `PGHOST=127.0.0.1` (Cloud SQL Auth Proxy), `PGPORT=5432`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `ACCESS_TOKEN_KEY`, `REFRESH_TOKEN_KEY`, `ACCESS_TOKEN_AGE`, serta `PORT=3000`. Generate signing keys secara acak dan simpan password/keys di Secret Manager atau mekanisme secret GCP yang disetujui.
3. Pastikan database dapat dijangkau dari VM dan jalankan migration pertama sebagai user deployment dengan environment production:

   ```bash
   set -a
   . /etc/forum-api/forum-api.env
   set +a
   NODE_ENV=production npm --prefix /opt/forum-api run migrate -- up
   ```

4. Pasang `deploy/forum-api.service` sebagai `/etc/systemd/system/forum-api.service`, lalu aktifkan:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now forum-api.service
   sudo systemctl status forum-api.service
   ```

5. Pasang `deploy/deploy-on-vm.sh` sebagai `/usr/local/sbin/forum-api-deploy`, dengan owner root dan permission executable. Jalankan script sebagai user deployment (bukan root); buat aturan sudoers terbatas agar user tersebut hanya dapat me-restart service:

   ```sudoers
   forum-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart forum-api.service
   ```

   Simpan aturan dengan `visudo -f /etc/sudoers.d/forum-api-deploy` dan pastikan file mode `0440`. Script fetch/fast-forward source, instal dependency produksi, membangun `DATABASE_URL` sementara dari environment VM untuk menjalankan migration additive, restart systemd, dan menunggu health endpoint.
6. Konfigurasikan Git deploy key read-only pada VM. Jangan menyalin service account key atau production `.env` ke repository.

### 3. Pasang NGINX dan HTTPS

1. Pasang konfigurasi root [`nginx.conf`](nginx.conf) ke konfigurasi NGINX host, sesuaikan `server_name` dengan domain API, lalu validasi dan reload:

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

   Konfigurasi meneruskan request ke `127.0.0.1:3000` dan membatasi `/threads` beserta path turunannya menjadi `90 request/menit per alamat sumber`. Request yang melampaui limit mendapat HTTP `429`.
2. Terbitkan sertifikat TLS Let's Encrypt untuk domain tersebut, misalnya dengan Certbot NGINX plugin. Ikuti perubahan yang dihasilkan Certbot dan pastikan konfigurasi TLS final tetap menerapkan `limit_req_zone` dan `limit_req` pada virtual host HTTPS untuk `/threads` serta seluruh child path.
3. Atur redirect HTTP ke HTTPS setelah sertifikat aktif. Pastikan sertifikat dan private key berada di lokasi yang dikelola Certbot, bukan di repository; ulangi `sudo nginx -t` dan reload.
4. Verifikasi secara terbatas:

   ```bash
   curl --fail --show-error --silent https://<domain-api>/health
   curl --fail --show-error --silent https://<domain-api>/threads/<thread-id>
   ```

   Pastikan sertifikat valid dan detail thread tetap public. Jangan menjalankan load/flood test ke production. Gunakan beberapa request manual untuk memeriksa HTTP `429` dan pantau log NGINX; rate limit menggunakan leaky bucket sehingga request burst juga dapat ditolak sebelum satu menit penuh.

### 4. Konfigurasikan GitHub Actions CD

Workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) berjalan pada push `main`/`master`; job deployment bergantung pada job lint, migration, test, dan 100% coverage. Buat Workload Identity Federation (hindari service-account JSON key jangka panjang), dan isi:

- GitHub Environment `production` secret `GCP_WIF_PROVIDER`: resource name Workload Identity Provider.
- GitHub Environment `production` variable `GCP_DEPLOY_SERVICE_ACCOUNT`: email service account deployment.
- Variables `GCP_PROJECT_ID`, `GCE_INSTANCE`, `GCE_ZONE`, `GCE_DEPLOY_USER`, dan `FORUM_API_HTTPS_URL` (URL dasar `https://<domain-api>`).

Batasi trust WIF ke repository dan branch utama ini. Service account perlu izin minimum untuk IAP tunnel, OS Login, dan mengakses VM yang dituju. Deploy user di VM membutuhkan akses repository read-only serta izin systemd restart yang dibatasi. Setelah push yang tervalidasi ke branch utama, workflow deploy dan melakukan HTTPS health smoke test; workflow gagal jika salah satu test atau pemeriksaan deployment gagal.

### 5. URL submission dan bukti

URL HTTPS belum dapat dicantumkan secara nyata sebelum domain, project GCP, VM, database, dan sertifikat disediakan serta deployment berhasil. Setelah deployment, isi submission/student notes dengan URL aktual:

```text
Forum API: https://<domain-api>
```

Jalankan Postman terhadap URL HTTPS tersebut. Simpan tautan/screenshot GitHub Actions untuk satu run CI berhasil, satu run CI yang gagal karena check benar-benar gagal, dan satu deployment CD berhasil. Jangan membuat status run palsu atau menambahkan test yang selalu gagal; bukti run harus berasal dari PR/push nyata setelah repository memiliki remote.
