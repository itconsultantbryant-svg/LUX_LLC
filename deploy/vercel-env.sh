#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-config/environments/production.env.local}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_PATH="$ROOT_DIR/$ENV_FILE"

if [ ! -f "$ENV_PATH" ]; then
  echo "ERROR: Env file not found: $ENV_PATH"
  echo "Create it from: config/environments/production.env.example"
  echo "Usage: $0 [path/to/production.env.local]"
  exit 1
fi

echo "Using env file: $ENV_PATH"
cd "$ROOT_DIR"

# Ensure npx/vercel is available
if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: npx not found"
  exit 1
fi

python3 -c "
import os, sys

env_path = sys.argv[1]
required = [
  'APP_ENV',
  'PORT',
  'HOST',
  'DATABASE_URL',
  'CORS_ORIGIN',
  'AI_ADAPTER',
  'PAYMENT_ADAPTER',
  'MESSAGING_ADAPTER',
  'STORAGE_ADAPTER',
  'LOG_LEVEL',
]

with open(env_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        k, v = line.split('=', 1)
        k = k.strip()
        v = v.strip()
        # strip surrounding quotes if present
        if len(v) >= 2 and ((v[0]==v[-1]=='\"') or (v[0]==v[-1]=='\'')):
            v = v[1:-1]
        os.environ[f'VERCEL_{k}'] = v  # pass via env

missing = [r for r in required if f'VERCEL_{r}' not in os.environ]
if missing:
    print('ERROR: Missing required keys:', ', '.join(missing))
    sys.exit(1)
" "$ENV_PATH"

# Read key-value pairs robustly via python and apply
python3 <<'PY'
import os, subprocess, sys

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config/environments/production.env.local')
# default; allow override via ENV_FILE? but script passes as arg; easier to re-read
# fallback: script already validated; just reparse
pass
PY

# Apply each var: rm -y (ignore) then add piping stdin
python3 - <<PY
import os, subprocess, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.environ.get('VERCEL_ENV_FILE') or os.path.join(root, sys.argv[1]) if len(sys.argv) > 1 else os.path.join(root, 'config/environments/production.env.local')
# but better to take from first arg; script sets? easier: parse from $ENV_PATH
env_path = "$ENV_PATH"

pairs = []
with open(env_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        k, v = line.split('=', 1)
        k = k.strip()
        v = v.strip()
        if len(v) >= 2 and ((v[0]==v[-1]=='"') or (v[0]==v[-1]=="'")):
            v = v[1:-1]
        pairs.append((k,v))

for k, v in pairs:
    # remove existing (ignore failures)
    try:
        subprocess.run(['npx', 'vercel', 'env', 'rm', k, 'production', '-y'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
    # add
    try:
        p = subprocess.Popen(['npx', 'vercel', 'env', 'add', k, 'production'], cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, err = p.communicate(input=v.encode('utf-8'), timeout=120)
        if p.returncode == 0:
            print(f"OK {k}")
        else:
            print(f"ERR {k}: {err.decode('utf-8', errors='replace')}")
            sys.exit(1)
    except subprocess.TimeoutExpired:
        print(f"TIMEOUT {k}")
        sys.exit(1)
PY
