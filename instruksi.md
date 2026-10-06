# Panduan Deployment GCP: Compute Engine & Cloud SQL (PostgreSQL)

Dokumen ini berisi panduan langkah demi langkah untuk melakukan *deployment* **Forum API** ke **Google Cloud Platform (GCP)** menggunakan **Compute Engine (VM)**, **Cloud SQL PostgreSQL**, dan **GitHub Actions (CD)** dengan Workload Identity Federation (WIF).

---

## 🏛️ Arsitektur Singkat

```
[ Client / Browser ] 
        │ (HTTPS Port 443)
        ▼
[ NGINX Reverse Proxy + SSL Certbot ] ──► [ Forum API (Node.js Port 3000) ]
                                                       │ (Port 5432)
                                                       ▼
                                            [ Cloud SQL Auth Proxy ]
                                                       │ (Encrypted Connection)
                                                       ▼
                                            [ Cloud SQL PostgreSQL ]
```

---

## 🚀 Langkah 1: Setup Cloud SQL (PostgreSQL)

1. **Aktifkan API Cloud SQL**:
   ```bash
   gcloud services enable sqladmin.googleapis.com compute.googleapis.com
   ```

2. **Buat Instance Cloud SQL PostgreSQL**:
   ```bash
   gcloud sql instances create forum-db-instance \
     --database-version=POSTGRES_16 \
     --edition=ENTERPRISE \
     --tier=db-custom-1-3840 \
     --region=asia-southeast2 \
     --root-password="GANTI_PASSWORD_ROOT_DB_ANDA"
   ```

3. **Buat Database Production**:
   ```bash
   gcloud sql databases create forumapi --instance=forum-db-instance
   ```

4. **Buat User Database Aplikasi**:
   ```bash
   gcloud sql users create forum_user \
     --instance=forum-db-instance \
     --password="GANTI_PASSWORD_USER_DB_ANDA"
   ```

5. **Catat Cloud SQL Instance Connection Name**:
   Dapatkan connection name instance Anda (format: `PROJECT_ID:REGION:INSTANCE_NAME`):
   ```bash
   gcloud sql instances describe forum-db-instance --format='value(connectionName)'
   ```
   *Contoh output:* `my-gcp-project:asia-southeast2:forum-db-instance`

---

## 💻 Langkah 2: Setup Compute Engine (VM)

1. **Buat Service Account untuk VM**:
   ```bash
   gcloud iam service-accounts create forum-vm-sa \
     --display-name="Forum VM Service Account"

   # Berikan izin ke Cloud SQL Client
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="serviceAccount:forum-vm-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --role="roles/cloudsql.client"
   ```

2. **Buat Instance Compute Engine (Ubuntu 24.04 LTS)**:
   ```bash
   gcloud compute instances create forum-api-vm \
     --zone=asia-southeast2-a \
     --machine-type=e2-small \
     --image-family=ubuntu-2404-lts-amd64 \
     --image-project=ubuntu-os-cloud \
     --service-account="forum-vm-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
     --scopes=cloud-platform \
     --tags=http-server,https-server
   ```

3. **Buka Port HTTP (80) dan HTTPS (443) di Firewall**:
   ```bash
   gcloud compute firewall-rules create allow-http-https \
     --allow tcp:80,tcp:443 \
     --target-tags=http-server,https-server
   ```

---

## 🛠️ Langkah 3: Konfigurasi di dalam VM

Masuk ke dalam VM melalui SSH:
```bash
gcloud compute ssh forum-api-vm --zone=asia-southeast2-a
```

Jalankan perintah berikut di dalam VM:

### 3.1. Install Dependensi Dasar & Node.js 22
```bash
# Update sistem
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx certbot python3-certbot-nginx

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3.2. Install & Konfigurasi Cloud SQL Auth Proxy
Cloud SQL Auth Proxy mengamankan koneksi dari VM ke Cloud SQL tanpa perlu membuat IP publik database terbuka.

```bash
# Download Cloud SQL Auth Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/

# Buat systemd service untuk Cloud SQL Auth Proxy
# Ganti INSTANCE_CONNECTION_NAME dengan milik Anda (misal: my-project:asia-southeast2:forum-db-instance)
sudo bash -c 'cat <<EOF > /etc/systemd/system/cloud-sql-proxy.service
[Unit]
Description=Google Cloud SQL Auth Proxy
After=network.target

[Service]
Type=simple
User=nobody
ExecStart=/usr/local/bin/cloud-sql-proxy INSTANCE_CONNECTION_NAME --port 5432
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable --now cloud-sql-proxy.service
```

### 3.3. Persiapkan Direktori Aplikasi & User
```bash
# Buat user sistem untuk forum-api
sudo useradd -r -s /bin/false forum-api || true

# Buat direktori aplikasi dan izinkan user deployment (misal: deploy-user atau username gcloud Anda)
sudo mkdir -p /opt/forum-api
sudo chown -R $USER:$USER /opt/forum-api

# Clone repository ke /opt/forum-api
git clone https://github.com/USERNAME/forumapi.git /opt/forum-api
cd /opt/forum-api

# Berikan izin ke user forum-api
sudo chown -R forum-api:forum-api /opt/forum-api
sudo chmod -R 755 /opt/forum-api
```

### 3.4. Buat File Environment (`/etc/forum-api/forum-api.env`)
```bash
sudo mkdir -p /etc/forum-api

sudo bash -c 'cat <<EOF > /etc/forum-api/forum-api.env
NODE_ENV=production
PORT=3000

PGHOST=127.0.0.1
PGPORT=5432
PGUSER=forum_user
PGPASSWORD=GANTI_PASSWORD_USER_DB_ANDA
PGDATABASE=forumapi

ACCESS_TOKEN_KEY=$(openssl rand -hex 32)
REFRESH_TOKEN_KEY=$(openssl rand -hex 32)
ACCESS_TOKEN_AGE=1h
EOF'

# Amankan izin file environment (hanya bisa dibaca root dan group forum-api)
sudo chgrp forum-api /etc/forum-api/forum-api.env
sudo chmod 640 /etc/forum-api/forum-api.env
```

### 3.5. Pasang Systemd Service Aplikasi
```bash
# Salin file service dari folder repository
sudo cp /opt/forum-api/deploy/forum-api.service /etc/systemd/system/forum-api.service

sudo systemctl daemon-reload
sudo systemctl enable forum-api.service
```

### 3.6. Konfigurasi Sudoers untuk Deployment Tanpa Password
Agar runner CI/CD dapat merestart service tanpa prompt password:
```bash
sudo bash -c 'cat <<EOF > /etc/sudoers.d/forum-api-deploy
$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart forum-api.service, /opt/forum-api/deploy/deploy-on-vm.sh
EOF'
```

---

## 🌐 Langkah 4: Setup NGINX Reverse Proxy & HTTPS (Certbot)

1. **Buat Konfigurasi NGINX** (`/etc/nginx/sites-available/forum-api`):
   ```bash
   sudo bash -c 'cat <<EOF > /etc/nginx/sites-available/forum-api
   server {
       listen 80;
       server_name api.domainanda.com; # Ganti dengan domain/subdomain Anda

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade \$http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host \$host;
           proxy_set_header X-Real-IP \$remote_addr;
           proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto \$scheme;
       }
   }
   EOF'

   sudo ln -sf /etc/nginx/sites-available/forum-api /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl restart nginx
   ```

2. **Dapatkan Sertifikat SSL Gratis dari Certbot**:
   ```bash
   sudo certbot --nginx -d api.domainanda.com --non-interactive --agree-tos -m emailanda@example.com
   ```

---

## 🔑 Langkah 5: Setup GCP Workload Identity Federation (WIF) untuk GitHub Actions

WIF memungkinkan GitHub Actions terhubung ke GCP dengan aman tanpa meletakkan Service Account JSON Key berumur panjang.

Jalankan perintah ini di local terminal / Cloud Shell:

```bash
export PROJECT_ID="YOUR_GCP_PROJECT_ID"
export REPO="USERNAME/forumapi" # Ganti dengan owner/repo GitHub Anda

# 1. Buat Service Account Deployment
gcloud iam service-accounts create github-deploy-sa \
  --project="${PROJECT_ID}" \
  --display-name="GitHub Actions Deployer"

# 2. Berikan Izin ke Service Account untuk Compute Engine & IAP Tunnel
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:github-deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/compute.instanceAdmin.v1"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:github-deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iap.tunnelResourceAccessor"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:github-deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# 3. Buat Workload Identity Pool
gcloud iam workload-identity-pools create "github-pool" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

# 4. Buat Workload Identity Provider
gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# 5. Hubungkan Repository GitHub dengan Service Account
gcloud iam service-accounts add-iam-policy-binding "github-deploy-sa@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"

# 6. Dapatkan Resource Name Provider untuk ditaruh di GitHub Secrets:
gcloud iam workload-identity-pools providers describe "github-provider" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="github-pool" \
  --format="value(name)"
```

---

## ⚙️ Langkah 6: Konfigurasi GitHub Repository (Environment, Secrets & Variables)

Buka repository GitHub Anda ➔ **Settings** ➔ **Environments** ➔ Buat Environment dengan nama **`production`**.

Isi **Environment Secret**:
| Secret Name | Value |
| :--- | :--- |
| `GCP_WIF_PROVIDER` | Output Resource Name dari langkah 5.6 (`projects/12345/locations/global/workloadIdentityPools/github-pool/providers/github-provider`) |

Isi **Environment Variables**:
| Variable Name | Value | Contoh |
| :--- | :--- | :--- |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | Email Service Account deployment | `github-deploy-sa@my-project.iam.gserviceaccount.com` |
| `GCP_PROJECT_ID` | GCP Project ID | `my-gcp-project` |
| `GCE_INSTANCE` | Nama VM Instance Compute Engine | `forum-api-vm` |
| `GCE_ZONE` | Zone Compute Engine | `asia-southeast2-a` |
| `GCE_DEPLOY_USER` | Username SSH di VM | `ubuntu` atau `ald` |
| `FORUM_API_HTTPS_URL` | Domain lengkap API HTTPS | `https://api.domainanda.com` |

---

## 🧪 Langkah 7: Pengujian & Verifikasi Deployment

1. **Trigger Manual / Automatic CD**:
   Push perubahan baru ke branch `main` atau `master`. Workflow [`.github/workflows/cd.yml`](file:///.github/workflows/cd.yml) akan otomatis berjalan:
   - Menjalankan Lint, Unit/Integration Test & Coverage 100%.
   - Mengotentikasi ke GCP via WIF.
   - Menjalankan script [`deploy/deploy-on-vm.sh`](file:///deploy/deploy-on-vm.sh) di Compute Engine via SSH IAP Tunnel.
   - Melakukan Smoke Test Health Check HTTPS (`GET /health`).

2. **Verifikasi via Terminal / cURL**:
   ```bash
   curl https://api.domainanda.com/health
   # Respon yang diharapkan: {"status":"success"}
   ```

---

## 📋 Ringkasan Berkas Deployment
* [`.github/workflows/cd.yml`](file:///.github/workflows/cd.yml) : Workflow CI/CD deployment otomatis ke GCP Compute Engine.
* [`deploy/deploy-on-vm.sh`](file:///deploy/deploy-on-vm.sh) : Script eksekusi di VM untuk mengunduh kode terbaru, menjalankan migrasi database, dan merestart service.
* [`deploy/forum-api.service`](file:///deploy/forum-api.service) : Systemd unit file untuk menjalankan Forum API di VM.
