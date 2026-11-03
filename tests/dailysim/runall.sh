#!/bin/bash
D=${1:-/tmp/dailysim}; mkdir -p $D
cd /home/claude/llv-dailysim
run() { DAILYSIM=1 SIM_START=$1 SIM_SEED=$2 SIM_YEARS=$3 SIM_OUT=$D/$1_$2.json NODE_OPTIONS=--max-old-space-size=2500 nice npx vitest run tests/dailysim/dailySim.test.ts --maxWorkers=1 2>&1 | grep -E "dailysim\]|FAIL|Error|✓|×" ; }
for st in classic olddon rise associate; do for sd in a b c; do Y=3; [ $sd = a ] && Y=5; run $st $sd $Y; done; done
echo ALLDONE
