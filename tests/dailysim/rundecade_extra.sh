#!/bin/bash
# Extra decade runs after rundecade.sh: the low start worked by a climber, and reruns. One at a time.
D=${1:-/tmp/decadesim}; Y=${2:-10}; mkdir -p $D
cd "$(dirname "$0")/../.."
run() {
  f=$D/$1_$2_$3
  if [ -f $f.json ] && grep -q '"final":true' $f.json && [ "$4" != force ]; then echo "skip $f"; return; fi
  DECADESIM=1 SIM_START=$1 SIM_SEED=$2 SIM_POLICY=$3 SIM_YEARS=$Y SIM_OUT=$f NODE_OPTIONS=--max-old-space-size=3000 \
    nice npx vitest run tests/dailysim/decadeSim.test.ts --maxWorkers=1 2>&1 | grep -E "decadesim\]|FAIL|Error|✓|×" ; }
run olddon a passive force
run associate a climber
run associate b climber
echo EXTRADONE
