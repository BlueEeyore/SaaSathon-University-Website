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
| `small` | 601s | 333s | 1.8x | 1727 MB | 91 | 1303 |

Model load was 50s (`base`) and 42s (`small`) on first run — a one-off, cached afterwards.

Every segment carried word-level timings in both runs (71/71 and 91/91), and language detection
returned `en` at p=1.00 for both.

`small` also segments more finely (91 segments vs 71 for identical audio), which suits a
follow-along transcript better.

## Accuracy

`base` on the JFK clip, against known text:

```
expected: ask not what your country can do for you, ask what you can do for your country
got:      And so my fellow Americans ask not what your country can do for you, ask what you can do for your country.
```

Exact match, with per-word timings precise to ~0.1s (`Americans` 1.56 → 2.10).

On the 10-minute sample the two models differ visibly in the same passage:

| `base` | `small` |
|---|---|
| "the **squallad** quarter of the brothels" | "the **squalid** quarter of the brothels" |
| "flour-fatten sauce" | "flour-fattened sauce" |
| "some **basic** and legendary rumours were put down" | "in the half-summerged branches revolved some birds of chimeric and legendary plumage" |

The first two are clear corrections. The third is a different kind of error in both — the sample
repeats short unrelated clips, which produces unnatural transitions and confuses both models. Treat
that row as noise rather than evidence, but the first two are real.

## Model choice

**Use `small` for anything pre-transcribed, `base` for live or on-demand.**

`small` is meaningfully more accurate and the recorded demo lecture will be transcribed ahead of
time, so there is no reason to accept `base`'s errors for it. It costs 2.3x the time and roughly
doubles peak memory.

`base` stays the default for any transcription a user waits on, because 4.1x realtime means a
15-minute lecture finishes in 3.7 minutes, while `small` would take 8.3 — too slow to sit through
and, at 1.8x, no longer comfortable to do on stage.

The model is therefore per-job and configurable via `TRANSCRIBER_MODEL`, defaulting to `small`
for seeded content.

## Consequences for the plan

1. **Live transcription is viable, with `base`.** 4.1x realtime means a 15-minute lecture finishes
   in roughly 3.7 minutes. The plan had assumed the host was too slow to transcribe on stage; that
   assumption was wrong and has been corrected.
2. **Still pre-transcribe by default.** A failed live transcription during a demo is unrecoverable.
   Live is a credible fallback, not the primary path.
3. **Memory is not a constraint on this host** — 1727 MB peak leaves ample headroom beside
   Next.js. It becomes a real constraint only if the project moves to a 2GB VPS, where `base`
   (~890 MB) is the ceiling and `small` would not fit.
4. **Word-level timings are confirmed viable** on both models, which was the main technical risk
   behind the follow-along player and jump-to-highlight features.

## Caveat

The audio is synthetic (concatenated repeats), not a real lecture recording. Re-run the benchmark
against the actual recorded lecture before trusting the extrapolation, since real lectures contain
longer pauses, more varied acoustics and no unnatural clip-to-clip transitions.


## Caveat

The audio is synthetic (concatenated repeats), not a real lecture recording.
Re-run the benchmark against the actual recorded lecture before trusting the
extrapolation for demo-length content, since real lectures contain longer pauses
and more varied acoustics.
