#!/usr/bin/env bash
set -euo pipefail

app_dir=/opt/forum-api
environment_file=/etc/forum-api/forum-api.env
deploy_branch=${DEPLOY_BRANCH:-main}

git config --global --add safe.directory "$app_dir" || true
cd "$app_dir"

if [ -n "${GITHUB_TOKEN:-}" ]; then
  git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/mlkav/forumapi-dev.git"
fi

git fetch origin "$deploy_branch"
git reset --hard "origin/$deploy_branch"
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

sleep 10

for attempt in {1..10}; do
  if curl --fail --silent http://127.0.0.1:3000/health >/dev/null 2>&1; then
    echo "Forum API is healthy and listening on port 3000."
    exit 0
  fi
  sleep 3
done

echo 'Forum API health check failed after restart.' >&2
exit 1
