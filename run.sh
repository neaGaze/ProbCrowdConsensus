#!/bin/bash
WORLDS=387420489
SUB_WORLD_SIZE=387420
iter=1000
SUB_WORLD=$((WORLDS / 1000))

printf "%.*f\n" 0 $SUB_WORLD
a=10
for i in `seq -f "%.0f" 0 $SUB_WORLD $WORLDS`
do
  START_INDEX="$i" SUBWORLD_SIZE="$SUB_WORLD_SIZE" iter="$iter" node newapp.js &
  actualNumber=$(echo $((i/SUB_WORLD_SIZE)) | awk '{ print sprintf("%.9f", $1); }')
  count=$(printf "%.*f\n" 0 $actualNumber)
  filename="ranks_$count.json"
  echo "rank page: $filename"

  while [ ! -f "$filename" ]; do
    sleep 20
    echo "Still waiting"
  done

  cat "data2/$i.dat" >> data2/the_new_0.dat

  killall -9 node
  #if [$count -eq 2]
  #then
  #  break
  #fi
done
[ -f run.sha ] && echo "Found" || echo "Not found"
