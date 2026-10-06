#!/usr/bin/env bash
# Local development runner: prepares .env and MySQL, then starts the API.
# Usage: ./dev.sh
set -euo pipefail
cd "$(dirname "$0")"

# .env is gitignored, so a fresh clone/codespace never has one. Create it from
# the example with a random JWT secret and dev login enabled.
if [ ! -f .env ]; then
	cp .env.example .env
	sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
	echo "Created .env with a random JWT_SECRET"
fi
# Older .env files may predate these keys or have them empty.
if ! grep -q '^JWT_SECRET=.\{32,\}' .env; then
	sed -i '/^JWT_SECRET=/d' .env
	echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
fi
# The frontend (.env.development, vite proxy) expects the API on :8080.
if grep -q '^PORT=' .env; then
	sed -i 's/^PORT=.*/PORT=8080/' .env
else
	echo "PORT=8080" >> .env
fi
# Dev-login buttons on the login page need these: DEV_LOGIN enables the
# endpoint, SEED_DEMO_DATA creates demo_std01 (student) and parinya (staff).
for kv in DEV_LOGIN=true SEED_DEMO_DATA=true; do
	if grep -q "^${kv%%=*}=" .env; then
		sed -i "s/^${kv%%=*}=.*/$kv/" .env
	else
		echo "$kv" >> .env
	fi
done
# Google Sign-In: the backend must verify tokens against the same client ID
# the frontend uses.
client_id=$(sed -n 's/^VITE_GOOGLE_CLIENT_ID=//p' ../labassist-frontend/.env.development 2>/dev/null || true)
if [ -n "$client_id" ]; then
	sed -i '/^GOOGLE_CLIENT_ID=/d' .env
	echo "GOOGLE_CLIENT_ID=$client_id" >> .env
fi

# Start MySQL (database/docker-compose.yml) and wait until it is healthy.
docker compose -f database/docker-compose.yml up -d db
echo -n "Waiting for MySQL"
for _ in $(seq 1 60); do
	if [ "$(docker inspect -f '{{.State.Health.Status}}' TA_mysql 2>/dev/null)" = healthy ]; then
		echo " ready"
		break
	fi
	echo -n .
	sleep 2
done

exec go run main.go
