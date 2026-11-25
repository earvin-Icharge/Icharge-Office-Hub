#!/usr/bin/env bash
# Builder only: run one SQL file on the Supabase project through the Management API.
# Usage: bash scripts/db-apply.sh supabase/migrations/<file>.sql
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-dgxzdrrhcyjbomcadunu}"
python3 -c "import json,sys;print(json.dumps({'query':open(sys.argv[1]).read()}))" "$1" \
 | curl -s -w '\nHTTP %{http_code}\n' -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN:-proxy-injected}" -H "Content-Type: application/json" \
   -X POST "https://api.supabase.com/v1/projects/$REF/database/query" --data @-
