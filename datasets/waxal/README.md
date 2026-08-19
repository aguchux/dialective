# WAXAL dataset (offline benchmarking)

WAXAL is an external African-language speech dataset published on Hugging Face as
[`google/WaxalNLP`](https://huggingface.co/datasets/google/WaxalNLP). It exists in this
repo purely as an **offline benchmark/evaluation subsystem** for comparing this
project's existing Vosk/Whisper ASR engines against a real, independent dataset — it
does **not** feed the live contributor scoring pipeline, and nothing under `services/`
has a runtime dependency on it. See `docs/Simplified WAXAL Integration Plan for
Dialect Library.md` for the original design and `tools/asr-benchmark/` for the
benchmark tool itself.

## License and attribution

WAXAL's ASR/TTS data is contributed by several providers, each under their own license:

| Provider | License |
|---|---|
| Makerere University, Digital Umuganda, Media Trust, Loud and Clear, AIMS Senegal | CC-BY-SA-4.0 |
| University of Ghana | CC-BY-4.0 |

Both licenses require **attribution and source citation**, and any derivative work
(including manifests or reports generated from this data) must use a compatible
license. No gated access is required to load the dataset. Cite the specific
provider(s) for whichever language(s) you actually download — check the dataset card
for the current provider table before publishing any derived results.

## Languages: no current overlap with Dialect Library

WAXAL's **ASR** portion covers 19 languages: Acholi, Luganda, Masaaba, Nyankole, Soga
(Makerere University); Akan, Ewe, Dagbani, Dagaare, Ikposo (University of Ghana);
Fula, Lingala, Shona, Malagasy, Amharic, Oromo, Sidama, Tigrinya, Wolaytta (Digital
Umuganda).

**None of these overlap Dialect Library's currently-supported dialects**
(`en-us`, `ig`, `yo`, `ha` — see `models/asr-registry.yaml`). Yoruba, Hausa, and Igbo
do exist in WAXAL, but only in its **TTS** portion, not ASR — there is no WAXAL ASR
audio for those languages to benchmark against. This subsystem is therefore
infrastructure for general WAXAL-language benchmarking and future overlap (if Dialect
Library adds a dialect matching a WAXAL ASR language), not a benchmark against
Dialect Library's own dialects today.

## Loading a language

WAXAL ASR configs are named `<language_code>_asr`, e.g. `sna_asr` for Shona:

```python
from datasets import load_dataset
asr_data = load_dataset("google/WaxalNLP", "sna_asr")
```

Fields: `id`, `speaker_id`, `audio` (16kHz numpy array), `transcription`, `language`
(ISO 639-2), `gender`. Splits: `train` (80%), `validation` (10%), `test` (10%), plus a
separate `unlabeled` split.

Which languages this repo has actually wired up (via `models/waxal-registry.yaml`) is
intentionally a small, explicit subset — add a language there only once you've
confirmed it's real and present in the current dataset release, never pre-populate
the full 19 speculatively.

## Pipeline

```bash
python datasets/waxal/scripts/download.py --language sna
python datasets/waxal/scripts/prepare.py --language sna
python datasets/waxal/scripts/validate.py --language sna
python tools/asr-benchmark/benchmark.py --dataset waxal --language sna --engine whisper
```

Produces `reports/waxal/shona.json` and `reports/waxal/summary.md`.

### `--fixture` mode

`download.py --language <tag> --fixture` synthesizes a tiny local dataset (a few
seconds of tone/silence + hand-written fake transcripts, via `numpy`/`soundfile`) with
no network access and no dependency on the real WAXAL dataset or its license. Use this
to verify the download → prepare → validate → benchmark → report pipeline mechanics
work end-to-end without downloading real WAXAL audio. WER/CER numbers from a fixture
run are meaningless (they're against synthetic silence) — only real-mode runs produce
meaningful benchmark numbers.

## What's never committed to git

Raw/downloaded audio and generated manifests under `datasets/waxal/data/` are
git-ignored (see `datasets/waxal/.gitignore`) — this repo's convention is to keep
large binaries out of the tree entirely, the same way Vosk model weights and Whisper
checkpoints are never committed either. `reports/waxal/*.json` and `summary.md` ARE
committed — they're small text files, not audio, and serve as a historical record of
benchmark runs.
