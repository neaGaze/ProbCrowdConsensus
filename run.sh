#!/bin/bash
#WORLDS=387420489
WORLDS=3874205
SUB_WORLD=$((WORLDS / 5))
printf "%.*f\n" 0 $SUB_WORLD
a=10
for i in `seq -f "%.0f" 0 $SUB_WORLD $WORLDS`
do
  START_INDEX="$i" node app.js &
  actualNumber=$(echo $((i/774841)) | awk '{ print sprintf("%.9f", $1); }')
  count=$(printf "%.*f\n" 0 $actualNumber)
  filename="ranks_$count.json"
  echo "count: $actualNumber"

  while [ ! -f "$filename" ]; do
    sleep 35
    echo "Still waiting"
  done

  killall -9 node
done
[ -f run.sha ] && echo "Found" || echo "Not found"
