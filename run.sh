#!/bin/bash

#############################################################################################
# merge both 'run.sh' and 'run3.sh'. Read the objects and criteria from 'objects.txt' and 'criteria.txt' respectively.
# And reading from the latest file write after each iteration
##############################################################################################

#WORLDS=387420489
#SUB_WORLD_SIZE=387420
#iter=1000

# To run try -> `./run.sh 387420489 387420 1000 58a621fbbe5761064ace4444`
WORLDS=$1
SUB_WORLD_SIZE=$2
iter=$3
id=$4

SUB_WORLD=$((WORLDS/iter))

printf "%.*f\n" 0 $SUB_WORLD

for i in `seq -f "%.0f" 0 $SUB_WORLD $WORLDS`
do
  START_INDEX="$i" SUBWORLD_SIZE="$SUB_WORLD_SIZE" iter="$iter" ID="$id" PORT=3002 node newapp.js >> output.log &
  actualNumber=$(echo $((i/SUB_WORLD_SIZE)) | awk '{ print sprintf("%.9f", $1); }')
  count=$(printf "%.*f\n" 0 $actualNumber)
  filename="ranks_$count.json"
  echo "rank page: $filename"

  while [ ! -f "$filename" ]; do
    sleep 20
    echo "Still waiting"
  done

  cat "data/$i.dat" >> data/the_new_0.dat

  killall -9 node
  #if [$count -eq 2]
  #then
  #  break
  #fi
done

#mkdir results
#output_file_name="results/$WORLDS.json"
#tail -2 output.log | head -1 > "$output_file_name"
output_file_name="results/$id.json"
RESULT="output_file_name" node runner.js
[ -f run.sha ] && echo "Found" || echo "Not found"
