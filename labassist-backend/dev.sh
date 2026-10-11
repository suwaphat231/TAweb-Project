#!/usr/bin/env bash
# Local development runner: prepares .env and MySQL, then starts the API.
# Usage: ./dev.sh
set -euo pipefail
cd "$(dirname "$0")"

# .env is gitignored, so a fresh clone/codespace never has one.
../setup-env.sh

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
