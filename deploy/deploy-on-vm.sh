#!/usr/bin/env bash
set -euo pipefail

app_dir=/opt/forum-api
environment_file=/etc/forum-api/forum-api.env
deploy_branch=${DEPLOY_BRANCH:-main}

git config --global --add safe.directory "$app_dir" || true
cd "$app_dir"
git fetch origin "$deploy_branch"
git merge --ff-only FETCH_HEAD
npm ci --omit=dev
chown -R forum-api:forum-api "$app_dir"
chmod -R 755 "$app_dir"

set -a
# This file is provisioned on the VM and is never stored in the repository.
. "$environment_file"
set +a
export NODE_ENV=production
export DATABASE_URL
DATABASE_URL="$(node --input-type=module -e "
  const url = new URL('postgresql://localhost');
  url.username = process.env.PGUSER;
  url.password = process.env.PGPASSWORD;
  url.hostname = process.env.PGHOST;
  url.port = process.env.PGPORT;
  url.pathname = \`/\${process.env.PGDATABASE}\`;
  process.stdout.write(url.toString());
")"
npm run migrate -- up
unset DATABASE_URL

sudo -n /usr/bin/systemctl restart forum-api.service

for attempt in {1..10}; do
  if curl --fail --silent --show-error http://127.0.0.1:3000/health >/dev/null; then
    exit 0
  fi
  sleep 3
done

echo 'Forum API health check failed after restart.' >&2
exit 1
