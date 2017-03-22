#!/bin/bash
WORLDS=531441
SUB_WORLD_SIZE=106288
SUB_WORLD=$((WORLDS / 5))
#i=0
#for i in `seq -f "%.0f" 0 $SUB_WORLD $WORLDS`
#do

#START_INDEX="$i" SUBWORLD_SIZE="$SUB_WORLD_SIZE" iter=5 node app.js
#done

# NEW method
START=$(date +%s)
count=0
cd data
for i in `ls *.dat | sort -n`;
do
  cd ..
  START_INDEX="$count" SUBWORLD_SIZE="data/$i" iter=5 node newapp2.js &
  filename="ranks_$count.json"
  count=$((count+1))
  while [ ! -f "$filename" ]; do
    sleep 4
    echo "Still waiting"
  done

  killall -9 node
  cd data
done
END=$(date +%s)
DIFF=$(echo "$END - $START" | bc)
echo "actual time diff: $DIFF secs"
