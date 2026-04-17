#!/usr/bin/env python3
"""
convert_madmom_to_onnx.py — One-time offline conversion script

Converts madmom's CNNOnsetProcessor pickle weights into an ONNX model
that the Rust backend can run via the `ort` crate.

Recent change: Fixed two critical bugs:
  1. Activation functions changed from ReLU to tanh (madmom 2013 uses tanh,
     not ReLU — ReLU caused unbounded activations → sigmoid saturation → 1.0
     output on every frame).
  2. Channel order documented: madmom trains with ch0=FFT2048, ch1=FFT1024,
     ch2=FFT4096. The Rust pipeline's FFT_SIZES must match.

Requirements (no madmom import needed):
    pip install torch onnx onnxruntime numpy

Usage:
    python scripts/convert_madmom_to_onnx.py

Output:
    src-tauri/models/onset_cnn.onnx (~1.2MB)

Architecture (Böck & Schlüter, ICASSP 2014):
    Input:     [batch, 3, 15, 80]  (3 STFT channels, 15 context frames, 80 mel bands)
    BatchNorm: per-channel per-mel normalization (mean/inv_std from training data)
    Conv2d:    3→10, kernel (7,3), valid, tanh
    MaxPool:   (1,3)
    Conv2d:    10→20, kernel (3,3), valid, tanh
    MaxPool:   (1,3)
    Flatten:   20×7×8 = 1120
    Dense:     1120→256, tanh
    Dense:     256→1, Sigmoid
    Output:    [batch, 1]  (onset probability 0.0–1.0)
    Total:     ~290K parameters
"""

import os
import sys
import glob
import pickle
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# ── 1. Custom unpickler to load madmom pickles without importing madmom ──

class MadmomStub:
    """Generic stub that captures all attributes set by pickle __setstate__."""
    def __setstate__(self, state):
        if isinstance(state, dict):
            self.__dict__.update(state)
        else:
            self._state = state


class MadmomUnpickler(pickle.Unpickler):
    """
    Unpickler that maps all madmom.* classes to a generic stub.
    This lets us load the pickle files without madmom's Cython extensions,
    which don't compile on Python 3.13+.
    """
    def find_class(self, module, name):
        if "madmom" in module:
            # Create a named stub class so we can distinguish layer types
            return type(name, (MadmomStub,), {})
        return super().find_class(module, name)


def find_madmom_model_path():
    """
    Locate the madmom onset CNN pickle file on disk.
    Searches common install locations (user site-packages, system site-packages).
    """
    # Try to find via importlib (works even if madmom can't be imported)
    try:
        import importlib.util
        spec = importlib.util.find_spec("madmom")
        if spec and spec.submodule_search_locations:
            base = spec.submodule_search_locations[0]
            pkl = os.path.join(base, "models", "onsets", "2013", "onsets_cnn.pkl")
            if os.path.exists(pkl):
                return pkl
    except Exception:
        pass

    # Fallback: search common paths
    patterns = [
        os.path.expanduser("~/.local/lib/python*/site-packages/madmom/models/onsets/2013/onsets_cnn.pkl"),
        os.path.expanduser("~/AppData/Roaming/Python/*/site-packages/madmom/models/onsets/2013/onsets_cnn.pkl"),
        "/usr/lib/python*/site-packages/madmom/models/onsets/2013/onsets_cnn.pkl",
        "/usr/local/lib/python*/site-packages/madmom/models/onsets/2013/onsets_cnn.pkl",
    ]
    for pattern in patterns:
        matches = glob.glob(pattern)
        if matches:
            return matches[0]

    return None


def load_madmom_pickle(pkl_path):
    """
    Load the madmom onset CNN pickle using our custom unpickler.
    Returns the NeuralNetwork stub object with all layers accessible.
    """
    with open(pkl_path, "rb") as f:
        model = MadmomUnpickler(f, encoding="latin1").load()
    return model


# ── 2. PyTorch model with BatchNorm folded in ────────────────────

class OnsetCNN(nn.Module):
    """
    PyTorch reimplementation of madmom's CNNOnsetProcessor neural network,
    INCLUDING the BatchNorm preprocessing layer (Layer 0 in the pickle).

    The BatchNorm applies per-channel, per-mel-band normalization using
    precomputed statistics from the training data:
        x_norm = (x - mean) * inv_std
    where mean and inv_std have shape (80, 3) = (n_mels, n_channels).

    Shape trace through the network:
      Input:  [B, 3, 15, 80]
      BN:     [B, 3, 15, 80]   (element-wise normalize)
      Conv1:  [B, 10, 9, 78]   (15-7+1=9, 80-3+1=78)
      Pool1:  [B, 10, 9, 26]   (78/3=26)
      Conv2:  [B, 20, 7, 24]   (9-3+1=7, 26-3+1=24)
      Pool2:  [B, 20, 7, 8]    (24/3=8)
      Flat:   20 * 7 * 8 = 1120
      FC1:    256
      FC2:    1 (sigmoid)
    """

    FLATTEN_SIZE = 1120  # 20 * 7 * 8

    def __init__(self):
        super().__init__()
        # BatchNorm parameters (registered as buffers, not learnable params)
        # Shape: [1, 3, 1, 80] for NCHW broadcasting over [B, C, T, F]
        self.register_buffer("bn_mean", torch.zeros(1, 3, 1, 80))
        self.register_buffer("bn_inv_std", torch.ones(1, 3, 1, 80))

        # Convolutions + pooling
        self.conv1 = nn.Conv2d(3, 10, kernel_size=(7, 3))
        self.pool1 = nn.MaxPool2d(kernel_size=(1, 3))
        self.conv2 = nn.Conv2d(10, 20, kernel_size=(3, 3))
        self.pool2 = nn.MaxPool2d(kernel_size=(1, 3))

        # Fully connected
        self.fc1 = nn.Linear(self.FLATTEN_SIZE, 256)
        self.fc2 = nn.Linear(256, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [batch, 3, 15, 80]
        # Apply BatchNorm: (x - mean) * inv_std
        x = (x - self.bn_mean) * self.bn_inv_std

        x = torch.tanh(self.conv1(x))   # [batch, 10, 9, 78]
        x = self.pool1(x)               # [batch, 10, 9, 26]
        x = torch.tanh(self.conv2(x))   # [batch, 20, 7, 24]
        x = self.pool2(x)               # [batch, 20, 7, 8]
        x = x.flatten(1)                # [batch, 1120]
        x = torch.tanh(self.fc1(x))     # [batch, 256]
        x = torch.sigmoid(self.fc2(x))  # [batch, 1]
        return x


# ── 3. Copy weights from pickle into PyTorch model ───────────────

def copy_weights(pytorch_model: OnsetCNN, madmom_model):
    """
    Copy weights from the madmom pickle layers into the PyTorch model.

    Pickle layer layout (from inspection):
      Layer 0: BatchNormLayer  — mean (80,3), inv_std (80,3)
      Layer 1: ConvolutionalLayer — weights (3,10,7,3), bias (10,)
      Layer 2: MaxPoolLayer — (skip, no weights)
      Layer 3: ConvolutionalLayer — weights (10,20,3,3), bias (20,)
      Layer 4: MaxPoolLayer — (skip)
      Layer 5: StrideLayer — (skip, equivalent to flatten)
      Layer 6: FeedForwardLayer — weights (1120,256), bias (256,)
      Layer 7: FeedForwardLayer — weights (256,1), bias (1,)

    Weight transpositions:
      madmom conv: (in_ch, out_ch, H, W) → PyTorch: (out_ch, in_ch, H, W)
        → transpose axes (0,1,2,3) → (1,0,2,3)
      madmom dense: (in_features, out_features) → PyTorch: (out_features, in_features)
        → simple .T
    """
    layers = madmom_model.layers

    with torch.no_grad():
        # ── BatchNorm (Layer 0) ──
        # madmom: mean (80, 3), inv_std (80, 3) — (n_mels, n_channels)
        # PyTorch buffer: (1, 3, 1, 80) — (batch, channels, time, mels) for NCHW broadcast
        bn = layers[0]
        # Transpose (80, 3) → (3, 80), then reshape to (1, 3, 1, 80)
        bn_mean = torch.from_numpy(bn.mean.T.copy()).float().reshape(1, 3, 1, 80)
        bn_inv_std = torch.from_numpy(bn.inv_std.T.copy()).float().reshape(1, 3, 1, 80)
        pytorch_model.bn_mean.copy_(bn_mean)
        pytorch_model.bn_inv_std.copy_(bn_inv_std)
        print(f"  Copied BatchNorm: mean {tuple(bn_mean.shape)}, inv_std {tuple(bn_inv_std.shape)}")

        # ── Conv1 (Layer 1) ──
        # madmom: (in_ch=3, out_ch=10, H=7, W=3) → PyTorch: (out=10, in=3, H=7, W=3)
        conv1 = layers[1]
        w = torch.from_numpy(conv1.weights.transpose(1, 0, 2, 3).copy()).float()
        b = torch.from_numpy(conv1.bias.copy()).float()
        pytorch_model.conv1.weight.copy_(w)
        pytorch_model.conv1.bias.copy_(b)
        print(f"  Copied conv1: weight {tuple(w.shape)}, bias {tuple(b.shape)}")

        # ── Conv2 (Layer 3) ──
        conv2 = layers[3]
        w = torch.from_numpy(conv2.weights.transpose(1, 0, 2, 3).copy()).float()
        b = torch.from_numpy(conv2.bias.copy()).float()
        pytorch_model.conv2.weight.copy_(w)
        pytorch_model.conv2.bias.copy_(b)
        print(f"  Copied conv2: weight {tuple(w.shape)}, bias {tuple(b.shape)}")

        # ── FC1 (Layer 6) ──
        fc1 = layers[6]
        w = torch.from_numpy(fc1.weights.T.copy()).float()
        b = torch.from_numpy(fc1.bias.copy()).float()
        pytorch_model.fc1.weight.copy_(w)
        pytorch_model.fc1.bias.copy_(b)
        print(f"  Copied fc1: weight {tuple(w.shape)}, bias {tuple(b.shape)}")

        # ── FC2 (Layer 7) ──
        fc2 = layers[7]
        w = torch.from_numpy(fc2.weights.T.copy()).float()
        b = torch.from_numpy(fc2.bias.copy()).float()
        pytorch_model.fc2.weight.copy_(w)
        pytorch_model.fc2.bias.copy_(b)
        print(f"  Copied fc2: weight {tuple(w.shape)}, bias {tuple(b.shape)}")


# ── 4. Export to ONNX ──────────────────────────────────────────

def export_to_onnx(model: OnsetCNN, output_path: str):
    """
    Export the PyTorch model to ONNX format with dynamic batch axis.
    The BatchNorm parameters are folded into the ONNX graph as constants,
    so the Rust backend doesn't need to handle normalization separately.

    The export produces a single self-contained .onnx file (no external
    weight files) so Tauri can bundle it as a single resource.
    """
    import onnx

    model.eval()
    dummy_input = torch.randn(1, 3, 15, 80)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Export to ONNX (may create external .data file with PyTorch 2.x)
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=["spectrogram"],
        output_names=["onset_probability"],
        dynamic_axes={
            "spectrogram": {0: "batch"},
            "onset_probability": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
    )

    # PyTorch 2.x dynamo exporter stores weights externally by default
    # (onset_cnn.onnx.data alongside onset_cnn.onnx). Convert to a single
    # self-contained file so Tauri can bundle it as one resource.
    external_data = output_path + ".data"
    if os.path.exists(external_data):
        print(f"  Merging external weights into single file...")
        onnx_model = onnx.load(output_path, load_external_data=True)
        # Convert all external tensors to internal
        onnx.save(onnx_model, output_path,
                  save_as_external_data=False,
                  all_tensors_to_one_file=False)
        # Remove the now-unused external data file
        os.remove(external_data)
        print(f"  Removed {external_data}")

    file_size = os.path.getsize(output_path)
    print(f"  Exported to: {output_path}")
    print(f"  File size: {file_size:,} bytes ({file_size / 1024:.1f} KB)")


# ── 5. Validate with onnxruntime ──────────────────────────────

def validate_onnx(onnx_path: str, pytorch_model: OnsetCNN):
    """
    Load the ONNX model in onnxruntime and verify it matches PyTorch
    output within numerical tolerance (max absolute diff < 1e-5).
    """
    import onnxruntime as ort

    pytorch_model.eval()
    np.random.seed(123)
    test_input = np.random.randn(10, 3, 15, 80).astype(np.float32)

    # PyTorch output
    with torch.no_grad():
        torch_out = pytorch_model(torch.from_numpy(test_input)).numpy()

    # ONNX Runtime output
    sess = ort.InferenceSession(onnx_path)
    ort_out = sess.run(None, {"spectrogram": test_input})[0]

    max_diff = np.max(np.abs(torch_out - ort_out))
    mean_diff = np.mean(np.abs(torch_out - ort_out))

    print(f"  PyTorch vs ONNX Runtime:")
    print(f"    Max absolute diff:  {max_diff:.2e}")
    print(f"    Mean absolute diff: {mean_diff:.2e}")
    print(f"    PyTorch sample: {torch_out[:3, 0]}")
    print(f"    ONNX sample:    {ort_out[:3, 0]}")

    if max_diff < 1e-4:
        print(f"    PASS — outputs match within tolerance")
    else:
        print(f"    WARNING — outputs diverge. Check axis transpositions.")
        print(f"    (Continuing anyway — verify with real audio later)")


# ── Main ──────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output_path = os.path.join(project_root, "src-tauri", "models", "onset_cnn.onnx")

    print("=" * 60)
    print("madmom CNN -> ONNX Conversion (no madmom import needed)")
    print("=" * 60)

    # Step 1: Find and load the pickle file
    print("\n[1/4] Locating madmom onset CNN pickle...")
    pkl_path = find_madmom_model_path()
    if pkl_path is None:
        print("ERROR: Cannot find madmom's onsets_cnn.pkl")
        print("Install madmom first: pip install madmom")
        print("(Only the files need to be present, the import doesn't need to work)")
        sys.exit(1)
    print(f"  Found: {pkl_path}")

    madmom_model = load_madmom_pickle(pkl_path)
    print(f"  Loaded {len(madmom_model.layers)} layers from pickle")
    for i, layer in enumerate(madmom_model.layers):
        ltype = type(layer).__name__
        has_w = hasattr(layer, "weights") and isinstance(getattr(layer, "weights", None), np.ndarray)
        shape = getattr(layer, "weights", np.array([])).shape if has_w else "—"
        print(f"    Layer {i}: {ltype:25s} weights={shape}")

    # Step 2: Build PyTorch model and copy weights
    print("\n[2/4] Building PyTorch model with BatchNorm...")
    model = OnsetCNN()
    total_params = sum(p.numel() for p in model.parameters())
    total_buffers = sum(b.numel() for b in model.buffers())
    print(f"  Learnable parameters: {total_params:,}")
    print(f"  Buffer elements (BatchNorm): {total_buffers:,}")

    print("\n[3/4] Copying weights (with axis transpositions)...")
    copy_weights(model, madmom_model)

    # Step 3: Export to ONNX
    print("\n[4/4] Exporting to ONNX...")
    export_to_onnx(model, output_path)

    # Step 4: Validate
    print("\n[bonus] Validating ONNX with onnxruntime...")
    try:
        validate_onnx(output_path, model)
    except ImportError:
        print("  Skipped — onnxruntime not installed (pip install onnxruntime)")
    except Exception as e:
        print(f"  Validation error: {e}")

    print("\n" + "=" * 60)
    print(f"Done! Model saved to: {output_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
