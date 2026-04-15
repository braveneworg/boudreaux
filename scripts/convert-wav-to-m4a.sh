# Run this script in a directory containing WAV files to convert them to M4A format using both AAC and ALAC codecs.

# All WAVs → AAC
for f in *.wav; do
  ffmpeg -i "$f" -c:a aac -b:a 256k "${f%.wav}.m4a"
done

# All WAVs → ALAC
for f in *.wav; do
  ffmpeg -i "$f" -c:a alac "${f:r}_alac.m4a"
done
