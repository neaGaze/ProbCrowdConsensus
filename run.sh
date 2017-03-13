#!/bin/bash
#WORLDS=387420489
WORLDS=531441
SUB_WORLD=$((WORLDS / 5))
printf "%.*f\n" 0 $SUB_WORLD
a=10
for i in `seq -f "%.0f" 0 $SUB_WORLD $WORLDS`
do
  START_INDEX="$i" node app.js &
  actualNumber=$(echo $((i/106288)) | awk '{ print sprintf("%.9f", $1); }')
  count=$(printf "%.*f\n" 0 $actualNumber)
  filename="ranks_$count.json"
  echo "rank page: $filename"

  while [ ! -f "$filename" ]; do
    sleep 20
    echo "Still waiting"
  done

  killall -9 node
done
[ -f run.sha ] && echo "Found" || echo "Not found"
