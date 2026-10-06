#!/usr/bin/env bash
set -e

# ==============================================================================
# KONFIGURASI PERSISI DARI DOKUMEN & USER INPUT
# ==============================================================================
export PROJECT_ID="rnlkav-forumapi"
export GITHUB_REPO="mlkav/forumapi-dev"
export REGION="asia-southeast2"
export ZONE="asia-southeast2-a"

export VM_NAME="forum-api-vm"
export VM_USER="ubuntu"

export DB_INSTANCE_NAME="forum-db-instance"
export DB_NAME="forumapi"
export DB_USER="forum_user"

# Password acak yang aman untuk Root & Database User
export DB_ROOT_PASSWORD=$(openssl rand -hex 16)
export DB_USER_PASSWORD=$(openssl rand -hex 16)

export VM_SA_NAME="forum-vm-sa"
export DEPLOY_SA_NAME="github-deploy-sa"
export POOL_NAME="github-pool"
export PROVIDER_NAME="github-provider"

echo "======================================================================"
echo " Memulai Otomasi Setup GCP Deployment Forum API"
echo " Project ID : $PROJECT_ID"
echo " Repo GitHub: $GITHUB_REPO"
echo "======================================================================"

gcloud config set project "$PROJECT_ID"

# ------------------------------------------------------------------------------
# LANGKAH 1: Aktifkan API GCP yang Dibutuhkan
# ------------------------------------------------------------------------------
echo "==> [1/6] Mengaktifkan Service API GCP..."
gcloud services enable sqladmin.googleapis.com \
                       compute.googleapis.com \
                       iam.googleapis.com \
                       cloudresourcemanager.googleapis.com \
                       iamcredentials.googleapis.com \
                       servicenetworking.googleapis.com

# ------------------------------------------------------------------------------
# LANGKAH 2: Setup Cloud SQL (PostgreSQL)
# ------------------------------------------------------------------------------
echo "==> [2/6] Membuat Instance Cloud SQL ($DB_INSTANCE_NAME)..."
if ! gcloud sql instances describe "$DB_INSTANCE_NAME" &>/dev/null; then
  gcloud sql instances create "$DB_INSTANCE_NAME" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier=db-custom-1-3840 \
    --region="$REGION" \
    --root-password="$DB_ROOT_PASSWORD"
else
  echo "Cloud SQL Instance '$DB_INSTANCE_NAME' sudah ada."
fi

echo "==> Membuat Database Production ($DB_NAME)..."
if ! gcloud sql databases describe "$DB_NAME" --instance="$DB_INSTANCE_NAME" &>/dev/null; then
  gcloud sql databases create "$DB_NAME" --instance="$DB_INSTANCE_NAME"
fi

echo "==> Membuat/Update User Database ($DB_USER)..."
if ! gcloud sql users describe "$DB_USER" --instance="$DB_INSTANCE_NAME" &>/dev/null; then
  gcloud sql users create "$DB_USER" \
    --instance="$DB_INSTANCE_NAME" \
    --password="$DB_USER_PASSWORD"
else
  gcloud sql users set-password "$DB_USER" \
    --instance="$DB_INSTANCE_NAME" \
    --password="$DB_USER_PASSWORD"
fi

INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe "$DB_INSTANCE_NAME" --format='value(connectionName)')

# ------------------------------------------------------------------------------
# LANGKAH 3: Setup Compute Engine (VM) & Firewall
# ------------------------------------------------------------------------------
echo "==> [3/6] Membuat Service Account untuk VM..."
VM_SA_EMAIL="${VM_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$VM_SA_EMAIL" &>/dev/null; then
  gcloud iam service-accounts create "$VM_SA_NAME" \
    --display-name="Forum VM Service Account"
  echo "Menunggu propagasi IAM Service Account (5 detik)..."
  sleep 20
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${VM_SA_EMAIL}" \
  --role="roles/cloudsql.client"

echo "==> Membuat Instance Compute Engine ($VM_NAME)..."
if ! gcloud compute instances describe "$VM_NAME" --zone="$ZONE" &>/dev/null; then
  gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --machine-type=e2-small \
    --image-family=ubuntu-2404-lts-amd64 \
    --image-project=ubuntu-os-cloud \
    --service-account="$VM_SA_EMAIL" \
    --scopes=cloud-platform \
    --tags=http-server,https-server
fi

echo "==> Membuat Firewall Rules untuk HTTP & HTTPS..."
if ! gcloud compute firewall-rules describe allow-http-https &>/dev/null; then
  gcloud compute firewall-rules create allow-http-https \
    --allow tcp:80,tcp:443 \
    --target-tags=http-server,https-server
fi

# ------------------------------------------------------------------------------
# LANGKAH 4: Workload Identity Federation (WIF) untuk GitHub Actions
# ------------------------------------------------------------------------------
echo "==> [4/6] Mengonfigurasi Workload Identity Federation (WIF)..."
DEPLOY_SA_EMAIL="${DEPLOY_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$DEPLOY_SA_EMAIL" &>/dev/null; then
  gcloud iam service-accounts create "$DEPLOY_SA_NAME" \
    --display-name="GitHub Actions Deployer"
  echo "Menunggu propagasi IAM Service Account Deployer (15 detik)..."
  sleep 15
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/compute.instanceAdmin.v1"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA_EMAIL}" \
  --role="roles/iap.tunnelResourceAccessor"

if ! gcloud iam workload-identity-pools describe "$POOL_NAME" --location="global" &>/dev/null; then
  gcloud iam workload-identity-pools create "$POOL_NAME" \
    --location="global" \
    --display-name="GitHub Actions Pool"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" --location="global" --workload-identity-pool="$POOL_NAME" &>/dev/null; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
    --location="global" \
    --workload-identity-pool="$POOL_NAME" \
    --display-name="GitHub Actions Provider" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
fi

PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA_EMAIL" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}"

WIF_PROVIDER_RESOURCE=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --format="value(name)")

VM_PUBLIC_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format="value(networkInterfaces[0].accessConfigs[0].natIP)")

# ------------------------------------------------------------------------------
# MENGHASILKAN PERINTAH KONFIGURASI LANGSUNG UNTUK VM
# ------------------------------------------------------------------------------
echo "======================================================================"
echo " PROSES PERSIAPAN GCP SELESAI DENGAN SUKSES!"
echo "======================================================================"
echo ""
echo "👉 Buka SSH ke VM Anda dengan menjalankan perintah ini:"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo ""
echo "👉 Setelah masuk ke dalam VM, salin dan jalankan blok perintah berikut:"
echo "----------------------------------------------------------------------"
cat << EOF
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx certbot python3-certbot-nginx

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
sudo mv cloud-sql-proxy /usr/local/bin/

sudo tee /etc/systemd/system/cloud-sql-proxy.service > /dev/null <<EOT
[Unit]
Description=Google Cloud SQL Auth Proxy
After=network.target

[Service]
Type=simple
User=nobody
ExecStart=/usr/local/bin/cloud-sql-proxy $INSTANCE_CONNECTION_NAME --port 5432
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOT

sudo systemctl daemon-reload
sudo systemctl enable --now cloud-sql-proxy.service

sudo useradd -r -s /bin/false forum-api || true
sudo git clone https://github.com/$GITHUB_REPO.git /opt/forum-api
sudo chown -R \$USER:\$USER /opt/forum-api
git config --global --add safe.directory /opt/forum-api
cd /opt/forum-api

sudo mkdir -p /etc/forum-api
sudo tee /etc/forum-api/forum-api.env > /dev/null <<EOT
NODE_ENV=production
PORT=3000
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=$DB_USER
PGPASSWORD=$DB_USER_PASSWORD
PGDATABASE=$DB_NAME
ACCESS_TOKEN_KEY=$(openssl rand -hex 32)
REFRESH_TOKEN_KEY=$(openssl rand -hex 32)
ACCESS_TOKEN_AGE=1h
EOT

sudo chgrp forum-api /etc/forum-api/forum-api.env
sudo chmod 640 /etc/forum-api/forum-api.env

sudo cp /opt/forum-api/deploy/forum-api.service /etc/systemd/system/forum-api.service
sudo systemctl daemon-reload
sudo systemctl enable forum-api.service

sudo tee /etc/sudoers.d/forum-api-deploy > /dev/null <<EOT
\$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart forum-api.service, /opt/forum-api/deploy/deploy-on-vm.sh
EOT

sudo chmod +x /opt/forum-api/deploy/deploy-on-vm.sh
sudo /opt/forum-api/deploy/deploy-on-vm.sh
EOF
echo "----------------------------------------------------------------------"
echo ""
echo "======================================================================"
echo " NILAI UNTUK GITHUB REPOSITORY (SETTINGS -> ENVIRONMENTS -> production)"
echo "======================================================================"
echo "ENVIRONMENT SECRET:"
echo "  GCP_WIF_PROVIDER           : $WIF_PROVIDER_RESOURCE"
echo ""
echo "ENVIRONMENT VARIABLES:"
echo "  GCP_DEPLOY_SERVICE_ACCOUNT : $DEPLOY_SA_EMAIL"
echo "  GCP_PROJECT_ID             : $PROJECT_ID"
echo "  GCE_INSTANCE               : $VM_NAME"
echo "  GCE_ZONE                   : $ZONE"
echo "  GCE_DEPLOY_USER            : $VM_USER"
echo "  FORUM_API_HTTPS_URL        : https://api.domainanda.com"
echo "======================================================================"