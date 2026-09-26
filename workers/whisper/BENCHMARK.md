# Transcription benchmark

Measured on the demo host to decide which Whisper model the project can afford.
Run `python benchmark.py <audio.wav> --model <name>` to reproduce.

## Test host

| | |
|---|---|
| CPU | Intel Core i5-8365U @ 1.6GHz, 4 cores / 8 threads (low-power laptop) |
| RAM | 15 GB |
| OS | Linux x86_64 |
| Python | 3.12.3 |
| ffmpeg | 6.1.1 |
| Threads used | 4 |
| Compute type | `int8` on CPU |

A deliberately modest CPU. Most cloud VPS cores are faster, so these numbers are
a conservative floor rather than a best case.

## Method

`word_timestamps=True` and `vad_filter=True` are both enabled, because those are
what the follow-along player, captions and jump-to-highlight need. Benchmarking
the faster segment-only path would have understated cost.

The 10-minute sample was built by concatenating short public-domain speech clips
(Narsil/asr_dummy on HuggingFace, plus whisper.cpp's `jfk.wav`) with 0.7s
silence gaps to imitate lecture cadence. Only ~38s of distinct source audio was
available, so the sample repeats material.

Whisper's cost is essentially linear in audio length, so timing is still
meaningful. Accuracy was checked separately against `jfk.wav`, which has known
text.

## Results

| Model | Audio | Time | Realtime factor | Peak RSS | Segments | Words |
|---|---|---|---|---|---|---|
| `base` | 601s | 147s | **4.1x** | 890 MB | 71 | 1291 |
| `small` | 601s | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

Model load was 50s on first run for `base` (a one-off, cached afterwards).

Every segment carried word-level timings (71 of 71), and language detection
returned `en` at p=1.00.

## Accuracy spot check

`base` on the JFK clip, against known text:

```
expected: ask not what your country can do for you, ask what you can do for your country
got:      And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.
```

Exact match, with per-word timings precise to ~0.1s (`Americans` 1.56 → 2.10).

## Consequences for the plan

1. **Live transcription is viable.** 4.1x realtime means a 15-minute lecture
   finishes in roughly 3.7 minutes. The plan had assumed the host was too slow
   to transcribe on stage; that assumption was wrong and has been corrected.
2. **Still pre-transcribe by default.** A 4x margin is not much on a slower
   machine or a longer lecture, and a failed live transcription during a demo is
   unrecoverable. Live becomes a credible fallback, not the primary path.
3. **`base` is the default model.** `small` should be preferred for the recorded
   demo lecture if its accuracy gain is worth the time cost — decide from the
   numbers above once measured.
4. **Memory is not a constraint here.** 890 MB peak leaves plenty of headroom
   alongside Next.js. This only becomes a risk if the project later moves to a
   2GB VPS, where `base` would be the floor and `small` likely infeasible.

## Caveat

The audio is synthetic (concatenated repeats), not a real lecture recording.
Re-run the benchmark against the actual recorded lecture before trusting the
extrapolation for demo-length content, since real lectures contain longer pauses
and more varied acoustics.
