#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_PATH="$ROOT_DIR/config/environments/production.env.local"

if [ ! -f "$ENV_PATH" ]; then
  echo "ERROR: $ENV_PATH not found"
  exit 1
fi

cd "$ROOT_DIR"

python3 - <<'PY'
import os, subprocess, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(root, 'config/environments/production.env.local')

pairs = []
with open(env_path) as f:
    for line in f:
        s = line.strip()
        if not s or s.startswith('#'):
            continue
        if '=' not in s:
            continue
        k,v = s.split('=',1)
        k = k.strip(); v = v.strip()
        if len(v)>=2 and ((v[0]==v[-1]=='"') or (v[0]==v[-1]=="'")):
            v = v[1:-1]
        pairs.append((k,v))

for k,v in pairs:
    # remove then add
    try:
        subprocess.run(['npx','vercel','env','rm',k,'production','-y'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
    p = subprocess.Popen(['npx','vercel','env','add',k,'production'], cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out,err = p.communicate(input=v.encode('utf-8'))
    if p.returncode != 0:
        print('ERR', k, err.decode('utf-8','replace')); sys.exit(1)
    else:
        print('OK', k)
PY
