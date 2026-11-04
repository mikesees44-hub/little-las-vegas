#!/bin/bash
# Decade runs, ONE AT A TIME (2 CPUs, other agents): tests/dailysim/rundecade.sh <outdir> [years]
# Each run writes <outdir>/<start>_<seed>_<policy>.json (+ .weeks.jsonl) as it goes; finished runs are skipped.
D=${1:-/tmp/decadesim}; Y=${2:-10}; mkdir -p $D
cd "$(dirname "$0")/../.."
run() {
  f=$D/$1_$2_$3
  if [ -f $f.json ] && grep -q '"final":true' $f.json; then echo "skip $f"; return; fi
  DECADESIM=1 SIM_START=$1 SIM_SEED=$2 SIM_POLICY=$3 SIM_YEARS=$Y SIM_OUT=$f NODE_OPTIONS=--max-old-space-size=3000 \
    nice npx vitest run tests/dailysim/decadeSim.test.ts --maxWorkers=1 2>&1 | grep -E "decadesim\]|FAIL|Error|✓|×" ; }
for p in reasonable passive; do for st in olddon classic rise associate; do run $st a $p; done; done
for st in olddon classic rise associate; do run $st b reasonable; done
for st in olddon classic rise associate; do run $st b passive; done
echo ALLDONE
