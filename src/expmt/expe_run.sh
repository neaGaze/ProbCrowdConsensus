#!/bin/bash

#############################################################################################
# Experimental shell command
##############################################################################################

# To run try -> `./run.sh 387420489 387420 1000 58a621fbbe5761064ace4444`
WORLDS=$1
SUB_WORLD_SIZE=$2
iter=$3
inputFName=$4

SUB_WORLD=$((WORLDS/iter))

startDate=$date
printf "%.*f\n" 0 $SUB_WORLD
for i in `seq -f "%.0f" 0 $SUB_WORLD $((WORLDS-1))`
do
  START_INDEX="$i" SUBWORLD_SIZE="$SUB_WORLD_SIZE" iter="$iter" ID="$inputFName" PORT=3002 node src/expmt/executor.js >> src/expmt/output.log &
  actualNumber=$(echo $((i/SUB_WORLD_SIZE)) | awk '{ print sprintf("%.9f", $1); }')
  count=$(printf "%.*f\n" 0 $actualNumber)
  filename="src/expmt/ranks_$count.json"
  echo "rank page: $filename"

  while [ ! -f "$filename" ]; do
    sleep 20
    echo "Still waiting"
  done

  cat "src/expmt/data/$i.dat" >> src/expmt/data/the_new_0.dat

  killall -9 node
done

endDate=$date
diff=$endDate-$startDate
echo "$diff" >> timer.txt
