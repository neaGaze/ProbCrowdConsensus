#!/bin/bash

# Reading from only 1 input "data/0.dat"
####################################

START=$(date +%s)
count=0
cd data

i=newdata2.dat

#for i in `ls *.dat | sort -n`;
#do
  cd ..
  START_INDEX="$count" SUBWORLD_SIZE="data/$i" iter=5 PORT=3001 node newapp3.js &
  filename="ranks_$count.json"
  count=$((count+1))
  while [ ! -f "$filename" ]; do
    sleep 4
    echo "Still waiting"
  done

#  killall -9 node
  cd data
#  break
#done
END=$(date +%s)
DIFF=$(echo "$END - $START" | bc)
echo "actual time diff: $DIFF secs"
