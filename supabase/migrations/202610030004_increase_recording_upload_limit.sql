-- Allow five-minute mono WAV recordings with headroom, using binary units.
update storage.buckets
set file_size_limit = 12582912 -- 12 * 1024 * 1024 bytes (12 MiB)
where id = 'word-game-recordings';
