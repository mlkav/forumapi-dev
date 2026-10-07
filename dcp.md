======================================================================
NILAI UNTUK GITHUB REPOSITORY (SETTINGS -> ENVIRONMENTS -> production)
======================================================================

ENVIRONMENT SECRET:
GCP_WIF_PROVIDER : projects/187732965900/locations/global/workloadIdentityPools/github-pool/providers/github-provider

ENVIRONMENT VARIABLES:
GCP_DEPLOY_SERVICE_ACCOUNT : github-deploy-sa@rnlkav-forumapi.iam.gserviceaccount.com
GCP_PROJECT_ID : rnlkav-forumapi
GCE_INSTANCE : forum-api-vm
GCE_ZONE : asia-southeast2-a
GCE_DEPLOY_USER : ubuntu
FORUM_API_HTTPS_URL : https://api.domainanda.com
======================================================================

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
ExecStart=/usr/local/bin/cloud-sql-proxy rnlkav-forumapi:asia-southeast2:forum-db-instance --port 5432
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOT

sudo systemctl daemon-reload
sudo systemctl enable --now cloud-sql-proxy.service

sudo useradd -r -s /bin/false forum-api || true
sudo git clone https://github.com/mlkav/forumapi-dev.git /opt/forum-api
sudo chown -R $USER:$USER /opt/forum-api
git config --global --add safe.directory /opt/forum-api
cd /opt/forum-api

sudo mkdir -p /etc/forum-api
sudo tee /etc/forum-api/forum-api.env > /dev/null <<EOT
NODE_ENV=production
PORT=3000
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=forum_user
PGPASSWORD=261e9cc335746019c0ca2c6b60ccf69a
PGDATABASE=forumapi
ACCESS_TOKEN_KEY=f88062ab1c93274bc9f441433b457f80c897bc5008b93dfc6796422c6aba1e8d
REFRESH_TOKEN_KEY=73e997660acb1c9a4736a673acab9b4882e11f83cd8eeec240b99fd9178926ad
ACCESS_TOKEN_AGE=1h
EOT

sudo chgrp forum-api /etc/forum-api/forum-api.env
sudo chmod 640 /etc/forum-api/forum-api.env

sudo cp /opt/forum-api/deploy/forum-api.service /etc/systemd/system/forum-api.service
sudo systemctl daemon-reload
sudo systemctl enable forum-api.service

sudo tee /etc/sudoers.d/forum-api-deploy > /dev/null <<EOT
$USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart forum-api.service, /opt/forum-api/deploy/deploy-on-vm.sh
EOT

sudo /opt/forum-api/deploy/deploy-on-vm.sh
