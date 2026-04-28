#!/usr/bin/env python3
"""
convert_ddc_to_onnx.py — One-time offline conversion script.

Converts Chris Donahue's ddc_onset PyTorch model + SpectrogramExtractor/Normalizer
into three artifacts the Rust backend (src-tauri/src/onset_ml.rs) loads:

    src-tauri/models/ddc_onset_placement.onnx   (~1.3 MB — placement CNN)
    src-tauri/models/ddc_onset_extractor.bin    (~1.1 MB — windows + mel matrices)
    src-tauri/models/ddc_onset_normalizer.bin   (~1.9 KB — per-bin z-score moments)

Why this exists (and not a smaller mel-filterbank reimplementation in Rust):
ddc_onset uses librosa.filters.mel with unique-filter deduplication — it does not
compute a standard triangular filterbank on the fly. Reimplementing that exact
filter construction in Rust is error-prone; dumping the filter matrices once at
build time and loading the bytes at runtime is cheaper and correct by construction.

Requirements:
    pip install torch onnx onnxruntime numpy
    pip install git+https://github.com/chrisdonahue/ddc_onset

Usage:
    python scripts/convert_ddc_to_onnx.py

Recent change (Phase B of onset plan, 2026-04-20): New file. Supersedes
scripts/convert_madmom_to_onnx.py — the madmom CNN is no longer bundled. The
`PlacementCNNExport` class rewrites ddc_onset's forward() to remove three
dynamic control-flow loops that block torch.onnx.export, and bakes the CHALLENGE
difficulty (the author's default) as a registered buffer so the exported graph
has a single input. Rust chooses pick density via the peak-picker's density
budget (onsetTargetDensity), not by passing a difficulty vector to the model.

Architecture (Donahue et al., ISMIR 2017):
    Input:     [num_frames, 80, 3]  (normalized log-mel, 3 FFT window sizes, dynamic frames)
    SpectrogramNormalizer: per-bin (80×3) zero-mean / unit-variance z-score
    Conv2d:    3→10, kernel (7,3), valid, ReLU
    MaxPool:   (1,3)
    Conv2d:    10→20, kernel (3,3), valid, ReLU
    MaxPool:   (1,3)
    Flatten:   20 × (7 conv-out frames) × 8 mel = 1120
    + 5-dim CHALLENGE one-hot (baked as buffer) → 1125
    Dense:     1125→256, ReLU
    Dense:     256→128, ReLU
    Dense:     128→1, Sigmoid
    Output:    [num_frames]  (onset probability 0.0-1.0 per 10 ms frame)
"""

import json
import sys
import time
from pathlib import Path
from typing import List

import numpy as np
import onnx
import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    import ddc_onset
    from ddc_onset.cnn import PlacementCNN, SpectrogramNormalizer
    from ddc_onset.constants import Difficulty
    from ddc_onset.spectral import SpectrogramExtractor
except ImportError:
    sys.exit(
        "ddc_onset is not installed. Run:\n"
        "    pip install git+https://github.com/chrisdonahue/ddc_onset\n"
    )


# ── Paths ──────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
MODELS_DIR = REPO_ROOT / "src-tauri" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

PLACEMENT_ONNX = MODELS_DIR / "ddc_onset_placement.onnx"
EXTRACTOR_BIN = MODELS_DIR / "ddc_onset_extractor.bin"
NORMALIZER_BIN = MODELS_DIR / "ddc_onset_normalizer.bin"

# ── Constants mirrored in Rust ─────────────────────────────────────
# The FFT window sizes, in the order the placement CNN expects as channels.
# Rust preprocessing MUST produce log-mel spectrograms in exactly this order,
# and MUST use the window + mel matrices dumped to `ddc_onset_extractor.bin`
# in the same order. The file layout is documented in write_extractor_bin().
FFT_SIZES = [1024, 2048, 4096]
NUM_MEL_BANDS = 80

# Feature-context radii from ddc_onset.cnn (unchanged; see cnn.py).
CTX_R1 = 7  # ±7 input frames → 15-frame receptive field before the first conv
CTX_R2 = 3  # ±3 conv-out frames → 7-frame slide into the dense layers


class PlacementCNNExport(nn.Module):
    """Static-shape wrapper over PlacementCNN that drops the three dynamic
    loops in the original forward() and bakes the CHALLENGE difficulty
    one-hot as a registered buffer. Exported graph has exactly one input
    (normalized log-mel spectrogram) and one output (sigmoid-scored onset
    probability per frame).

    Forward contract matches Rust's expectation in onset_ml.rs::run_onset_model:
        Input:  float32[num_frames, 80, 3]  (dynamic num_frames axis)
        Output: float32[num_frames]         (same num_frames)

    The num_frames axis is dynamic so the Rust caller can feed an entire song
    in one shot (14 125 frames = ~60 ms on CPU) or chunk if memory becomes a
    concern on very long songs.
    """

    def __init__(self, src: PlacementCNN):
        super().__init__()
        # Copy parameterized layers by reference — these keep the pretrained weights.
        self.conv0 = src.conv0
        self.maxpool0 = src.maxpool0
        self.conv1 = src.conv1
        self.maxpool1 = src.maxpool1
        self.dense0 = src.dense0
        self.dense1 = src.dense1
        self.output = src.output

        # Bake the difficulty one-hot. This is the key change vs. test/export_ddc_onnx.py —
        # by registering it as a buffer, the exported graph has it as a constant
        # initializer and does NOT expose it as an ONNX input. The peak sets across
        # difficulties are fully nested (verified in test/out_ddc/), so density-budgeting
        # CHALLENGE's output gives us access to BEGINNER/EASY/MEDIUM/HARD peaks as
        # subsets — no need to run the model at each difficulty.
        onehot = torch.zeros(len(Difficulty), dtype=torch.float32)
        onehot[Difficulty.CHALLENGE.value] = 1.0
        self.register_buffer("difficulty_onehot", onehot)

    def forward(self, spec_norm: torch.Tensor) -> torch.Tensor:
        num_frames = spec_norm.shape[0]

        # Pad ±CTX_R1 input frames along time so every output frame has full context.
        x_padded = F.pad(spec_norm, (0, 0, 0, 0, CTX_R1, CTX_R1))  # [T+14, 80, 3]

        # Rearrange to [1, 3 channels, T+14, 80 mel bins] for Conv2d (NCHW).
        x = x_padded.permute(2, 0, 1).unsqueeze(0)

        # Conv stack — mirrors PlacementCNN.conv():
        x = F.relu(self.conv0(x))    # [1, 10, T+8, 78]
        x = self.maxpool0(x)         # [1, 10, T+8, 26]
        x = F.relu(self.conv1(x))    # [1, 20, T+6, 24]
        x = self.maxpool1(x)         # [1, 20, T+6, 8]

        # Flatten channels+mel into per-frame feature vectors: [T+6, 160].
        x = x.permute(0, 2, 3, 1).reshape(-1, 160)

        # Slide a 7-wide window across the conv-out time axis → [T, 160, 7].
        # tensor.unfold(dim, window, step) is ONNX-exportable in opset ≥17.
        x = x.unfold(0, 1 + CTX_R2 * 2, 1)                         # [T, 160, 7]
        x = x.permute(0, 2, 1).contiguous()                        # [T, 7, 160]
        x = x.reshape(num_frames, 7 * 160)                         # [T, 1120]

        # Concatenate the baked CHALLENGE one-hot onto every frame: [T, 1125].
        diff = self.difficulty_onehot.unsqueeze(0).expand(num_frames, -1)
        x = torch.cat([x, diff], dim=1)

        # Dense stack — mirrors PlacementCNN.dense():
        x = F.relu(self.dense0(x))
        x = F.relu(self.dense1(x))
        x = self.output(x).view(-1)
        return torch.sigmoid(x)


def write_extractor_bin(extractor: SpectrogramExtractor) -> None:
    """Dump the SpectrogramExtractor's per-FFT-size window and mel-filter
    tensors to `ddc_onset_extractor.bin` in a layout the Rust side parses
    sequentially. File format (all little-endian f32):

        for fft_size in [1024, 2048, 4096]:
            window[fft_size]        # Hann-like, baked by SpectrogramExtractor init
            mel[(fft_size // 2 + 1) × 80]  # librosa mel filterbank, row-major

    Rust reads this by tracking a byte offset and slicing fft_size × 4 bytes,
    then (fft_size // 2 + 1) × 80 × 4 bytes, three times.
    """
    chunks: List[bytes] = []
    for fft_size in FFT_SIZES:
        window = getattr(extractor, f"window_{fft_size}").detach().cpu().numpy()
        assert window.shape == (fft_size,), f"window_{fft_size} shape {window.shape}"
        chunks.append(np.ascontiguousarray(window, dtype=np.float32).tobytes())

        mel = getattr(extractor, f"mel_{fft_size}").detach().cpu().numpy()
        assert mel.shape == ((fft_size // 2) + 1, NUM_MEL_BANDS), \
            f"mel_{fft_size} shape {mel.shape}"
        chunks.append(np.ascontiguousarray(mel, dtype=np.float32).tobytes())

    EXTRACTOR_BIN.write_bytes(b"".join(chunks))


def write_normalizer_bin(normalizer: SpectrogramNormalizer) -> None:
    """Dump the per-bin normalization moments to `ddc_onset_normalizer.bin`.
    File format (little-endian f32):

        mean[80 × 3]   # row-major, shape matches [num_mel_bands, num_fft_sizes]
        std[80 × 3]    # same layout

    Rust reads 80 × 3 × 4 = 960 bytes for mean, then another 960 for std.
    """
    mean = normalizer.mean.detach().cpu().numpy()
    std = normalizer.std.detach().cpu().numpy()
    assert mean.shape == (NUM_MEL_BANDS, len(FFT_SIZES)), f"mean shape {mean.shape}"
    assert std.shape == (NUM_MEL_BANDS, len(FFT_SIZES)), f"std shape {std.shape}"
    NORMALIZER_BIN.write_bytes(
        np.ascontiguousarray(mean, dtype=np.float32).tobytes()
        + np.ascontiguousarray(std, dtype=np.float32).tobytes()
    )


def inline_external_weights(onnx_path: Path) -> None:
    """torch.onnx.export with dynamo=True writes large tensor initializers to
    a sidecar `*.onnx.data` file. Tauri bundles resources from a flat list, so
    we want a single .onnx. This post-processes the export by loading the model
    with `load_external_data=True` (which reads the sidecar into memory and
    resets `data_location` to DEFAULT), then saves to a temp file. The temp
    file gets the weights inline because `onnx.save` defaults to
    `save_as_external_data=False`. Finally we unlink the original .onnx +
    .onnx.data and rename the temp over the original.

    We write-then-rename instead of editing in place because overwriting the
    source .onnx while onnx.save is reading any still-referenced external data
    from disk races.
    """
    model = onnx.load(str(onnx_path), load_external_data=True)
    sidecar = onnx_path.with_suffix(".onnx.data")
    if not sidecar.exists():
        # Already a single-file ONNX — no work to do.
        return

    # Belt-and-suspenders: explicitly ensure no initializer is still flagged
    # external (load_external_data=True already normalizes this, but run the
    # canonical helper too in case a future onnx version changes behavior).
    from onnx.external_data_helper import convert_model_from_external_data
    convert_model_from_external_data(model)

    tmp_path = onnx_path.with_suffix(".onnx.tmp")
    onnx.save(model, str(tmp_path))

    # Remove original .onnx + .onnx.data, then rename tmp into place.
    sidecar.unlink()
    onnx_path.unlink()
    tmp_path.rename(onnx_path)


def main() -> None:
    print("[1/5] Loading ddc_onset pretrained modules")
    cnn = PlacementCNN(load_pretrained_weights=True).eval()
    normalizer = SpectrogramNormalizer(load_moments=True).eval()
    extractor = SpectrogramExtractor().eval()
    export_model = PlacementCNNExport(cnn).eval()

    print("[2/5] Exporting CHALLENGE-baked PlacementCNN to ONNX")
    # Dummy input for tracing — size is arbitrary; we mark dim 0 dynamic below.
    dummy_spec = torch.zeros(1024, NUM_MEL_BANDS, len(FFT_SIZES), dtype=torch.float32)
    t0 = time.time()
    torch.onnx.export(
        export_model,
        (dummy_spec,),
        str(PLACEMENT_ONNX),
        input_names=["spectrogram"],
        output_names=["onset_probability"],
        dynamic_axes={
            "spectrogram": {0: "num_frames"},
            "onset_probability": {0: "num_frames"},
        },
        opset_version=18,
        do_constant_folding=True,
    )
    # torch.onnx.export externalizes large weights — inline them so the Tauri
    # resource bundle is a single file.
    inline_external_weights(PLACEMENT_ONNX)
    placement_bytes = PLACEMENT_ONNX.stat().st_size
    print(f"      wrote {PLACEMENT_ONNX.name} ({placement_bytes / 1024:.1f} KB) in {time.time()-t0:.1f}s")

    print("[3/5] Dumping SpectrogramExtractor windows + mel matrices")
    write_extractor_bin(extractor)
    extractor_bytes = EXTRACTOR_BIN.stat().st_size
    print(f"      wrote {EXTRACTOR_BIN.name} ({extractor_bytes / 1024:.1f} KB)")

    print("[4/5] Dumping SpectrogramNormalizer moments")
    write_normalizer_bin(normalizer)
    normalizer_bytes = NORMALIZER_BIN.stat().st_size
    print(f"      wrote {NORMALIZER_BIN.name} ({normalizer_bytes} B)")

    print("[5/5] Sanity check — running exported ONNX and comparing to PyTorch")
    import onnxruntime as ort
    import librosa
    AUDIO = REPO_ROOT / "Sell a Friend [r3oVhBlvsto].mp3"
    if AUDIO.exists():
        audio, _ = librosa.load(str(AUDIO), sr=44100, mono=True)
        audio_t = torch.from_numpy(audio).float().unsqueeze(0)
        with torch.no_grad():
            spec_raw = extractor(audio_t).squeeze(0)
            spec_norm = normalizer(spec_raw)
            # Reference: run the original difficulty-conditioned CNN at CHALLENGE.
            ref = cnn(
                spec_norm,
                torch.tensor([Difficulty.CHALLENGE.value], dtype=torch.int64),
                output_logits=False,
            ).squeeze(0).numpy()

        sess = ort.InferenceSession(str(PLACEMENT_ONNX), providers=["CPUExecutionProvider"])
        got = sess.run(["onset_probability"], {"spectrogram": spec_norm.numpy()})[0]

        max_diff = float(np.abs(ref - got).max())
        mean_diff = float(np.abs(ref - got).mean())
        print(f"      PyTorch (CHALLENGE) vs exported ONNX: max |diff|={max_diff:.3e}, mean |diff|={mean_diff:.3e}")
        if max_diff > 1e-4:
            print("      WARNING: numerical divergence > 1e-4 — inspect the export")
    else:
        print(f"      (skipped — {AUDIO.name} not found; sanity check requires it)")

    # Summary manifest so Rust integrators and future CI can see the dump layout.
    manifest = {
        "generated_by": "scripts/convert_ddc_to_onnx.py",
        "difficulty_baked_in": "CHALLENGE",
        "files": {
            "placement_onnx": {
                "name": PLACEMENT_ONNX.name,
                "size_bytes": placement_bytes,
                "input": "spectrogram: float32[num_frames, 80, 3] (dynamic num_frames)",
                "output": "onset_probability: float32[num_frames]",
            },
            "extractor_bin": {
                "name": EXTRACTOR_BIN.name,
                "size_bytes": extractor_bytes,
                "layout": [
                    f"window_{n}: float32[{n}]" for n in FFT_SIZES
                ] + [
                    f"mel_{n}: float32[{(n // 2) + 1} x {NUM_MEL_BANDS}] (row-major)"
                    for n in FFT_SIZES
                ],
                "fft_sizes_in_channel_order": FFT_SIZES,
                "num_mel_bands": NUM_MEL_BANDS,
            },
            "normalizer_bin": {
                "name": NORMALIZER_BIN.name,
                "size_bytes": normalizer_bytes,
                "layout": [
                    f"mean: float32[{NUM_MEL_BANDS} x {len(FFT_SIZES)}] (row-major)",
                    f"std: float32[{NUM_MEL_BANDS} x {len(FFT_SIZES)}] (row-major)",
                ],
            },
        },
        "pipeline_constants": {
            "sample_rate": 44100,
            "frame_rate": 100,
            "hop_size": 441,
            "log_eps": 1e-16,
            "context_radius_frames": CTX_R1,
            "conv_context_radius_frames": CTX_R2,
        },
    }
    (MODELS_DIR / "ddc_onset_manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nAll 3 artifacts written to {MODELS_DIR}")
    print(f"Total size: {(placement_bytes + extractor_bytes + normalizer_bytes) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
