# ASR fine-tuning (offline, dedicated GPU box)

Fine-tunes the Whisper checkpoints in `models/asr-registry.yaml` on Dialect
Library's own labelled recordings, and can train a first model for a dialect
that has none (e.g. Ibibio, `ibb`, ~11k recordings, no public model).

This is **offline tooling**, like `tools/asr-benchmark/`. Nothing under
`services/` imports it, CI does not run it, and it adds no GPU code path to
the cluster. Production keeps serving on CPU; the only thing that ever
reaches production is a merged checkpoint you choose to register.

```
 where kubectl works            GPU box (Windows, P600)                    production
 ───────────────────            ───────────────────────                    ──────────
 export_manifest.py  ─rows.jsonl─▶ fetch_audio.py ─▶ train.py ─▶ merge.py ─▶ HF repo (private)
 (read-only Postgres)             (read-only Spaces)  baseline vs             │
                                                      tuned report            ▼
                                                                  asr-registry.yaml checkpoint:
```

## What fits on a 2 GB Quadro P600

| Base | Params | LoRA | Full fine-tune |
|---|---|---|---|
| whisper-tiny / base | 39M / 74M | yes | yes |
| **whisper-small** (ig, yo, ha, rw, pcm, xh, am, st, ak, sw, arz, tn) | 244M | **yes**, `--batch-size 1-2` | no |
| whisper-medium (zu, ary, ar-dz) | 769M | no -- weights alone exceed 2 GB | no |

`train.py` refuses a medium base on a small GPU rather than dying halfway.
Everything trains in fp32: Pascal runs fp16 far slower than fp32 and has no
bf16. Speed on this card is not measured yet; `train.py` prints the real
clips/s and ETA after the first 10 steps. Expect hours per epoch for
whisper-small on ~10k clips, and several times faster with `--freeze-encoder`.

Don't plug a monitor into the P600, because the display takes some of its
2 GB of memory. Use Remote Desktop instead.

## One-time setup on the GPU box

```powershell
# 1. NVIDIA driver: the current production driver that lists the Quadro P600.
nvidia-smi                                   # must show the P600

# 2. Python 3.11 (torch 2.4 has no 3.13 wheels), git, ffmpeg
winget install Python.Python.3.11 Git.Git Gyan.FFmpeg

# 3. The repo and an isolated environment
git clone https://github.com/<org>/dialectiva.git
cd dialectiva\tools\asr-finetune
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install torch==2.4.1 --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

# 4. Confirm the GPU is usable from torch
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0)); print((torch.randn(512,512,device='cuda')@torch.randn(512,512,device='cuda')).sum().item())"

# 5. Tests (no GPU or network needed)
pytest test_common.py
```

Credentials on this box, kept to the minimum:

- **Spaces:** a read-only key scoped to the recordings bucket, set as `SPACES_ENDPOINT`, `SPACES_ACCESS_KEY` and `SPACES_SECRET_KEY`. Don't use the cluster's read-write key.
- **Hugging Face:** set `HF_TOKEN`. It needs read access, because the NCAIR1 checkpoints are gated, and write access to push merged models.
- **Database:** none. The export runs on the machine that already has kubectl.

## Train a dialect

**1. Export labels (on the machine with kubectl):**

```bash
kubectl port-forward -n dai svc/postgres 5432:5432 &
DATABASE_URL=postgres://...@localhost:5432/... python export_manifest.py --dialect ha
# prints clips / speakers / hours per split; copy data/ha/rows.jsonl to the GPU box
```

**2. Fetch audio (GPU box):**

```powershell
python fetch_audio.py --data-dir data\ha
```

**3. Train (GPU box):**

```powershell
python train.py --dialect ha --data-dir data\ha --batch-size 1 --grad-accum 16
# after a crash or a Windows Update reboot, run the same command with --resume
```

**4. Read `runs\ha-lora\report.json`.** Only a run whose verdict is `IMPROVED` is a candidate. Also read `test_predictions_*.jsonl`. Many "errors" turn out to be spelling variants rather than misrecognitions, and that changes how you should judge the number.

**5. Merge and publish:**

```powershell
python merge.py --run runs\ha-lora --push-to-hub <hf-user>/dl-hausa-asr-v1
```

### A dialect with no model yet (Ibibio)

Start from stock Whisper and force a language token. Whisper has no Ibibio
token, so pick the closest language and keep the **same** choice for every
later run of that dialect. Also give LoRA the feed-forward layers too, since
the base has never heard the language:

```powershell
python train.py --dialect ibb --data-dir data\ibb --base openai/whisper-small `
  --language yo --lora-targets q_proj,k_proj,v_proj,out_proj,fc1,fc2 --epochs 5
```

## What counts as a label

`export_manifest.py` keeps only clips with a reliable transcript. Its
docstring explains each rule. In short:

- Only `ENGLISH_TO_DIALECT` rows, whose `translationText` is the dialect text the audio contains. This includes the redo rows created by reverse validation.
- Only terminal, accepted rows: not admin-INVALID, no WRONG_DIALECT flags, not voted down by word validators, and liveness ≥ 50.
- `asrMatchScore` is **not** a filter. It measures agreement with the model being replaced, so filtering on it would train only on clips the current model already gets right.

Train, dev and test are split **by speaker**, so the test score reflects voices the model has never heard. That's the situation it faces with each new trainer.

## Deploying a fine-tune

This is a production change, so do it like one:

1. Make sure the production Hugging Face token (Admin Settings → API Access Tokens) can read the new private repo.
2. Probe it on a real `whisper-worker` pod before registering it (see the notes in `models/asr-registry.yaml`). A whisper-small fine-tune is about 1 GB resident, the same as the checkpoint it replaces.
3. Change that dialect's `checkpoint:` in `models/asr-registry.yaml`, commit, and deploy with `k8s/deploy.sh`. The registry ships in both the `api` and `whisper-worker` images, so both must come from the same SHA.
4. To roll back, revert that one line and redeploy.

## Data handling

`data/` holds trainers' voices. It is gitignored. Keep it on this box and
delete a dialect's `data/` folder once its run is finished.
`audio-retention-job` purges audio on a schedule, so re-export before each
new run. That way recordings purged since the last export never get trained
on.
