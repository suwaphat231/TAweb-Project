#!/usr/bin/env bash
# Prepares the gitignored .env files a fresh clone/Codespace doesn't have, so
# login works out of the box. Safe to re-run: existing values are kept except
# the dev-login settings below.
# Usage: ./setup-env.sh   (run automatically on Codespace create and by labassist-backend/dev.sh)
set -euo pipefail
cd "$(dirname "$0")"

# set_kv FILE KEY VALUE: replace or append KEY=VALUE.
set_kv() {
	sed -i "/^$2=/d" "$1"
	echo "$2=$3" >> "$1"
}

# Google Sign-In: the backend must verify tokens against the same client ID
# the frontend uses (labassist-frontend/.env.development is committed).
client_id=$(sed -n 's/^VITE_GOOGLE_CLIENT_ID=//p' labassist-frontend/.env.development 2>/dev/null || true)

for env in labassist-backend/.env .env; do
	if [ ! -f "$env" ]; then
		cp "${env}.example" "$env"
		echo "Created $env"
	fi
	# Without a JWT secret the backend refuses to start.
	if ! grep -q '^JWT_SECRET=.\{32,\}' "$env"; then
		set_kv "$env" JWT_SECRET "$(openssl rand -hex 32)"
	fi
	# Dev-login buttons and demo passwords on the login page need these:
	# DEV_LOGIN enables the endpoint, SEED_DEMO_DATA creates demo_std01
	# (student) and parinya (staff).
	set_kv "$env" DEV_LOGIN true
	set_kv "$env" SEED_DEMO_DATA true
	if [ -n "$client_id" ]; then
		set_kv "$env" GOOGLE_CLIENT_ID "$client_id"
	fi
done

# The frontend (.env.development, vite proxy) expects the API on :8080.
set_kv labassist-backend/.env PORT 8080
