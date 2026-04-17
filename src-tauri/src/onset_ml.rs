// ============================================================
// ML Onset Detection Pipeline — onset_ml.rs
//
// Replaces the JS spectral-flux onset detection with a madmom
// CNN (Böck & Schlüter, ICASSP 2014) running via ONNX Runtime.
//
// Pipeline: audio decode (symphonia) → resample to 44.1kHz (rubato)
// → 3 mel spectrograms at FFT 1024/2048/4096 (realfft) → 15-frame
// context assembly → batched ONNX CNN inference (ort) → per-frame
// onset probabilities [0.0–1.0].
//
// Recent change (bug audit #1 + #2): Removed three `.expect()` calls
// in ONNX session init (Session::builder / with_optimization_level /
// commit_from_file) and one `.expect()` in the FFT hot loop. All
// failures now propagate as `Result<_, String>` — a missing or
// corrupted onset_cnn.onnx surfaces as a user-visible toast instead
// of panicking the Tauri app. ONSET_SESSION is now a cached Result
// so the error is reported on every retry, not just the first.
// ============================================================

use ndarray::Array4;
use ort::session::Session;
use ort::session::builder::GraphOptimizationLevel;
use ort::value::Tensor;
use rayon::prelude::*;
use realfft::RealFftPlanner;
use rubato::{Resampler, SincFixedIn, SincInterpolationParameters,
             SincInterpolationType, WindowFunction};
use serde::Serialize;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri::Manager; // Provides .path() on AppHandle

// ── Constants matching madmom's CNNOnsetProcessor defaults ───────

/// Target sample rate — the CNN was trained on 44.1kHz audio.
const SAMPLE_RATE: u32 = 44100;

/// Hop size in samples = 44100 / 100 = 441, giving 100 fps.
const HOP_SIZE: usize = 441;

/// Number of mel frequency bands.
const N_MELS: usize = 80;

/// Lowest mel filter frequency (Hz) — A0, lowest piano key.
const FMIN: f64 = 27.5;

/// Highest mel filter frequency (Hz).
const FMAX: f64 = 16000.0;

/// Number of context frames the CNN sees per prediction.
const CONTEXT_FRAMES: usize = 15;

/// Half-context for symmetric padding: (15 - 1) / 2 = 7.
const CONTEXT_HALF: usize = 7;

/// Three FFT window sizes in madmom's training channel order:
///   Channel 0 = FFT 2048, Channel 1 = FFT 1024, Channel 2 = FFT 4096.
/// The CNN's BatchNorm has per-channel statistics that MUST match this order.
const FFT_SIZES: [usize; 3] = [2048, 1024, 4096];

/// Max frames per ONNX inference batch.
/// 4096 frames × 3 × 15 × 80 × 4 bytes ≈ 56 MB per chunk.
const CHUNK_SIZE: usize = 4096;

/// Rubato resampler chunk size (samples per processing block).
const RESAMPLE_CHUNK: usize = 1024;

// ── Types ────────────────────────────────────────────────────────

/// Result type for ML onset detection, serialized to frontend via IPC.
#[derive(Debug, Serialize, Clone)]
pub struct OnsetResult {
    /// Time in seconds from the start of the audio file.
    pub time: f64,
    /// CNN onset probability 0.0–1.0 (higher = more confident).
    pub probability: f64,
}

/// A sparse mel filter: stores only the nonzero coefficients and the
/// FFT bin index where they begin. Triangular mel filters have roughly
/// 20-40 nonzero bins out of 513-2049 total bins, so this skips ~95%
/// of zero-multiplied operations in the spectrogram inner loop.
struct SparseFilter {
    start_bin: usize,
    weights: Vec<f64>,
}

/// Global cached ONNX session — loaded lazily on first detection call.
/// The ~200ms load cost is paid exactly once per app lifetime.
/// Wrapped in Mutex because ort v2's Session::run() requires &mut self.
///
/// Stores `Result<Mutex<Session>, String>` so that init failures
/// (missing model file, corrupted ONNX graph, unsupported CPU) are
/// cached as an error rather than panicking the process via .expect().
/// Subsequent calls see the cached error and return it to the user.
static ONSET_SESSION: OnceLock<Result<Mutex<Session>, String>> = OnceLock::new();

// ═══════════════════════════════════════════════════════════════
// 1. AUDIO DECODING
// ═══════════════════════════════════════════════════════════════

/// Decode any supported audio file to mono f32 samples at 44100 Hz.
///
/// Uses symphonia for pure-Rust decoding (mp3/ogg/flac/wav/aac).
/// If the source sample rate differs from 44100, uses rubato's
/// sinc interpolation to resample — matching the CNN's training
/// conditions and avoiding aliasing artifacts.
fn decode_audio_mono(path: &Path) -> Result<Vec<f32>, String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    // Open file and probe for format
    let file = std::fs::File::open(path)
        .map_err(|e| format!("Cannot open audio file: {}", e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // Hint the format from file extension for faster probing
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probe_result = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Cannot probe audio format: {}", e))?;

    let mut format_reader = probe_result.format;

    // Get the default (first) audio track
    let track = format_reader.default_track()
        .ok_or("No audio track found in file")?;
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate
        .ok_or("Cannot determine sample rate")?;
    let channels = track.codec_params.channels
        .map(|ch| ch.count())
        .unwrap_or(1);

    // Create decoder
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Cannot create audio decoder: {}", e))?;

    // Decode all packets into interleaved f32 samples
    let mut all_samples: Vec<f32> = Vec::new();
    loop {
        match format_reader.next_packet() {
            Ok(packet) => {
                if packet.track_id() != track_id {
                    continue;
                }
                match decoder.decode(&packet) {
                    Ok(decoded) => {
                        let mut sample_buf = SampleBuffer::<f32>::new(
                            decoded.capacity() as u64,
                            *decoded.spec(),
                        );
                        sample_buf.copy_interleaved_ref(decoded);
                        all_samples.extend_from_slice(sample_buf.samples());
                    }
                    // Some packets may be undecodable (padding, etc.) — skip
                    Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
                    Err(e) => return Err(format!("Decode error: {}", e)),
                }
            }
            // End of stream
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(e) => return Err(format!("Read error: {}", e)),
        }
    }

    if all_samples.is_empty() {
        return Err("No audio samples decoded".to_string());
    }

    // Downmix to mono by averaging channels
    let mono: Vec<f32> = if channels > 1 {
        all_samples.chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    } else {
        all_samples
    };

    // Resample to 44100 Hz if needed
    if sample_rate != SAMPLE_RATE {
        resample_to_44100(&mono, sample_rate)
    } else {
        Ok(mono)
    }
}

/// Resample audio from `source_rate` to 44100 Hz using sinc interpolation.
///
/// Uses rubato's `SincFixedIn` resampler which processes fixed-size
/// input chunks and produces variable-size output. Sinc interpolation
/// avoids the aliasing artifacts that linear interpolation introduces.
fn resample_to_44100(samples: &[f32], source_rate: u32) -> Result<Vec<f32>, String> {
    let ratio = SAMPLE_RATE as f64 / source_rate as f64;

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let mut resampler = SincFixedIn::<f32>::new(
        ratio,
        2.0,           // max relative ratio
        params,
        RESAMPLE_CHUNK,
        1,             // mono
    ).map_err(|e| format!("Resampler init: {}", e))?;

    let mut output = Vec::with_capacity((samples.len() as f64 * ratio) as usize + 1024);

    // Process in fixed-size chunks
    for chunk in samples.chunks(RESAMPLE_CHUNK) {
        let mut input_chunk = vec![chunk.to_vec()];
        // Pad the last chunk to the required size
        if input_chunk[0].len() < RESAMPLE_CHUNK {
            input_chunk[0].resize(RESAMPLE_CHUNK, 0.0);
        }
        let resampled = resampler.process(&input_chunk, None)
            .map_err(|e| format!("Resample: {}", e))?;
        output.extend_from_slice(&resampled[0]);
    }

    Ok(output)
}

// ═══════════════════════════════════════════════════════════════
// 2. MEL SPECTROGRAM
// ═══════════════════════════════════════════════════════════════

/// Convert frequency in Hz to the mel scale.
fn hz_to_mel(f: f64) -> f64 {
    2595.0 * (1.0 + f / 700.0).log10()
}

/// Convert mel value back to Hz.
fn mel_to_hz(m: f64) -> f64 {
    700.0 * (10f64.powf(m / 2595.0) - 1.0)
}

/// Build a sparse triangular mel filterbank: Vec<SparseFilter>.
///
/// Parameters match madmom's defaults:
///   - norm_filters: true (each filter row sums to 1.0)
///   - unique_filters: false (keep duplicate low-frequency filters)
///
/// Each SparseFilter stores only the nonzero coefficients of its
/// triangular filter, plus the starting FFT bin index. This turns
/// the spectrogram inner loop from 80×2049 = 163K ops/frame into
/// 80×~30 = 2.4K ops/frame (~68x reduction for FFT 4096).
fn build_mel_filterbank(n_fft: usize, sample_rate: u32, n_mels: usize,
                        fmin: f64, fmax: f64) -> Vec<SparseFilter> {
    let n_bins = n_fft / 2 + 1;
    let mel_min = hz_to_mel(fmin);
    let mel_max = hz_to_mel(fmax);

    // n_mels + 2 points (including left and right edges)
    let mel_points: Vec<f64> = (0..=(n_mels + 1))
        .map(|i| mel_min + (mel_max - mel_min) * i as f64 / (n_mels + 1) as f64)
        .collect();

    // Convert mel points to fractional FFT bin indices
    let bin_points: Vec<f64> = mel_points.iter()
        .map(|&m| mel_to_hz(m) * n_fft as f64 / sample_rate as f64)
        .collect();

    // Build triangular filters — compute dense first, then extract sparse
    let mut filterbank = Vec::with_capacity(n_mels);

    for i in 0..n_mels {
        let left = bin_points[i];
        let center = bin_points[i + 1];
        let right = bin_points[i + 2];

        // Build dense row (temporary)
        let mut row = vec![0.0f64; n_bins];
        for j in 0..n_bins {
            let bin = j as f64;
            if bin >= left && bin <= center && center > left {
                // Rising slope
                row[j] = (bin - left) / (center - left);
            } else if bin > center && bin <= right && right > center {
                // Falling slope
                row[j] = (right - bin) / (right - center);
            }
        }

        // Normalize: each filter sums to 1.0 (matches madmom norm_filters=True)
        let sum: f64 = row.iter().sum();
        if sum > 0.0 {
            for val in row.iter_mut() {
                *val /= sum;
            }
        }

        // Extract sparse representation — only nonzero bins
        let first_nz = row.iter().position(|&v| v > 0.0);
        let last_nz = row.iter().rposition(|&v| v > 0.0);

        match (first_nz, last_nz) {
            (Some(start), Some(end)) => {
                filterbank.push(SparseFilter {
                    start_bin: start,
                    weights: row[start..=end].to_vec(),
                });
            }
            // Edge case: filter entirely outside [fmin, fmax] → empty
            _ => {
                filterbank.push(SparseFilter {
                    start_bin: 0,
                    weights: vec![],
                });
            }
        }
    }

    filterbank
}

/// Compute a log-mel spectrogram for the given FFT size.
///
/// Applies a Hann window, computes magnitude spectrum via realfft,
/// projects onto mel bands, and applies log compression with
/// ε = f64::EPSILON (≈ 2.22e-16, matching madmom's np.spacing(1)).
///
/// Returns `Ok(Vec<frame>)` on success, or `Err(String)` if the FFT
/// fails (length mismatch, internal realfft error). Changed from
/// panicking `.expect()` in the hot loop so malformed or extremely
/// short audio can't take down the whole detection task.
fn compute_mel_spectrogram(
    samples: &[f32],
    fft_size: usize,
    filterbank: &[SparseFilter],
) -> Result<Vec<Vec<f32>>, String> {
    let n_mels = filterbank.len();
    let n_bins = fft_size / 2 + 1;

    // Precompute Hann window
    let window: Vec<f64> = (0..fft_size)
        .map(|n| {
            0.5 * (1.0 - (2.0 * std::f64::consts::PI * n as f64
                          / (fft_size - 1) as f64).cos())
        })
        .collect();

    // Plan FFT (realfft operates on real-valued input, returns complex)
    let mut planner = RealFftPlanner::<f64>::new();
    let fft = planner.plan_fft_forward(fft_size);

    // Number of complete frames
    let num_frames = if samples.len() >= fft_size {
        (samples.len() - fft_size) / HOP_SIZE + 1
    } else {
        0
    };

    let mut spectrogram = Vec::with_capacity(num_frames);
    let mut input_buf = vec![0.0f64; fft_size];
    let mut spectrum = fft.make_output_vec();

    for frame_idx in 0..num_frames {
        let start = frame_idx * HOP_SIZE;

        // Apply Hann window to input frame
        for i in 0..fft_size {
            let idx = start + i;
            input_buf[i] = if idx < samples.len() {
                samples[idx] as f64 * window[i]
            } else {
                0.0
            };
        }

        // Forward FFT (real → complex, only positive frequencies).
        // realfft returns Err on length mismatches; propagate instead of
        // panicking so malformed audio can't crash the detection task.
        fft.process(&mut input_buf, &mut spectrum)
            .map_err(|e| format!("FFT process failed at frame {}: {}", frame_idx, e))?;

        // Compute magnitude spectrum |X[k]|
        let magnitudes: Vec<f64> = spectrum.iter()
            .take(n_bins)
            .map(|c| (c.re * c.re + c.im * c.im).sqrt())
            .collect();

        // Apply sparse mel filterbank and log compression.
        // Each SparseFilter has only ~20-40 nonzero weights instead of
        // iterating all 2049 bins — ~68x fewer multiply-adds per frame.
        let mut mel_frame = vec![0.0f32; n_mels];
        for (mel_idx, filter) in filterbank.iter().enumerate() {
            let mut energy = 0.0f64;
            for (i, &w) in filter.weights.iter().enumerate() {
                energy += magnitudes[filter.start_bin + i] * w;
            }
            // Log compression: ln(S + ε) where ε = f64::EPSILON ≈ 2.22e-16
            // This matches madmom's LogarithmicSpectrogramProcessor with
            // log=np.log, add=np.spacing(1)
            mel_frame[mel_idx] = (energy + f64::EPSILON).ln() as f32;
        }

        spectrogram.push(mel_frame);
    }

    Ok(spectrogram)
}

// ═══════════════════════════════════════════════════════════════
// 3. FRAME ASSEMBLY
// ═══════════════════════════════════════════════════════════════

/// Stack 3 mel spectrograms into CNN input frames.
///
/// For each output frame t, extracts a 15-frame context window
/// [t-7 .. t+7] from each of the 3 spectrograms and stacks them
/// as channels in NCHW order: [3, 15, 80].
///
/// Out-of-bounds context frames (before frame 0 or past the end)
/// are padded with the per-channel minimum value from the actual
/// spectrogram. This is critical because the values are in log-mel
/// space where 0.0 = ln(1.0) = moderate energy, NOT silence.
/// Padding with 0.0 would create a fake energy spike that the
/// CNN's BatchNorm amplifies into a false onset transient.
/// The per-channel minimum represents the quietest moment in the
/// actual audio — the correct "nothing here" value.
///
/// Returns (flat_data, num_frames) where flat_data is shape
/// [num_frames, 3, 15, 80] stored contiguously for ONNX input.
fn assemble_frames(
    spec_ch0: &[Vec<f32>],  // FFT 2048 (madmom channel 0)
    spec_ch1: &[Vec<f32>],  // FFT 1024 (madmom channel 1)
    spec_ch2: &[Vec<f32>],  // FFT 4096 (madmom channel 2)
) -> (Vec<f32>, usize) {
    // The 3 spectrograms may have slightly different frame counts
    // due to different FFT sizes. Use the minimum.
    let num_frames = spec_ch0.len()
        .min(spec_ch1.len())
        .min(spec_ch2.len());

    let specs: [&[Vec<f32>]; 3] = [spec_ch0, spec_ch1, spec_ch2];

    // Compute per-channel silence floor: the minimum value across all
    // frames and mel bands for each spectrogram. In log-mel space,
    // silence ≈ ln(ε) ≈ -36, while 0.0 = ln(1.0) = moderate energy.
    // Using the data-driven minimum ensures padding looks like "the
    // quietest thing in this audio" rather than "moderate energy."
    let silence_floor: [Vec<f32>; 3] = [
        compute_pad_frame(&specs[0]),
        compute_pad_frame(&specs[1]),
        compute_pad_frame(&specs[2]),
    ];

    // Each frame: 3 channels × 15 context × 80 mels = 3600 f32 values
    let frame_size = 3 * CONTEXT_FRAMES * N_MELS;
    let mut data = vec![0.0f32; num_frames * frame_size];

    for t in 0..num_frames {
        for (ch, spec) in specs.iter().enumerate() {
            for ctx in 0..CONTEXT_FRAMES {
                // Source frame index with symmetric context
                let src_idx = t as isize + ctx as isize - CONTEXT_HALF as isize;
                // Destination offset in flat array: [t][ch][ctx][0..N_MELS]
                let dst = t * frame_size
                         + ch * CONTEXT_FRAMES * N_MELS
                         + ctx * N_MELS;

                if src_idx >= 0 && (src_idx as usize) < spec.len() {
                    let src = &spec[src_idx as usize];
                    data[dst..dst + N_MELS].copy_from_slice(src);
                } else {
                    // Out-of-bounds: pad with silence floor, not 0.0
                    data[dst..dst + N_MELS].copy_from_slice(&silence_floor[ch]);
                }
            }
        }
    }

    (data, num_frames)
}

/// Compute a padding frame for one spectrogram channel: the per-mel-band
/// minimum across all frames. This represents "the quietest this channel
/// ever gets" — the correct fill for out-of-bounds context slots.
fn compute_pad_frame(spec: &[Vec<f32>]) -> Vec<f32> {
    if spec.is_empty() {
        return vec![0.0f32; N_MELS];
    }
    let mut mins = spec[0].clone();
    for frame in &spec[1..] {
        for (m, &val) in frame.iter().enumerate() {
            if val < mins[m] {
                mins[m] = val;
            }
        }
    }
    mins
}

// ═══════════════════════════════════════════════════════════════
// 4. ONNX INFERENCE
// ═══════════════════════════════════════════════════════════════

/// Run the onset CNN on assembled spectrogram frames.
///
/// Loads the ONNX model lazily on first call (~200ms), caches it
/// in ONSET_SESSION for the lifetime of the app. Processes frames
/// in chunks of CHUNK_SIZE (4096) to keep peak memory ≈ 56 MB
/// instead of ≈ 200 MB for a full song.
///
/// Returns per-frame onset probabilities in [0.0, 1.0].
fn run_onset_model(
    frames_flat: &[f32],
    num_frames: usize,
    model_path: &Path,
) -> Result<Vec<f32>, String> {
    // Initialize or retrieve cached ONNX session (Mutex for &mut self on run()).
    //
    // Bug audit #1: The previous implementation had three `.expect()` calls
    // inside this closure. If ONNX Runtime failed to init (missing VC++
    // runtime on Windows, unsupported CPU features, corrupted model file),
    // the closure panicked — which `OnceLock::get_or_init` does NOT catch,
    // so Tauri's worker task died and the app crashed.
    //
    // Now: `get_or_init` returns a `Result` that is cached. The closure
    // composes each fallible step and stores `Err(String)` on failure,
    // so every call (first and subsequent) surfaces the error to the
    // frontend as a toast instead of crashing.
    let session_result = ONSET_SESSION.get_or_init(|| {
        // Inner closure lets us use `?` to short-circuit at any failure step.
        // `commit_from_file` takes `&mut self`, so the final `builder`
        // binding must be mutable. (`with_optimization_level` takes self
        // by value and returns the builder, so the first rebinding is fine
        // without `mut`.)
        (|| -> Result<Mutex<Session>, String> {
            let builder = Session::builder()
                .map_err(|e| format!("ONNX session builder failed: {}", e))?;
            let mut builder = builder
                .with_optimization_level(GraphOptimizationLevel::Level3)
                .map_err(|e| format!("ONNX optimization level failed: {}", e))?;
            let session = builder
                .commit_from_file(model_path)
                .map_err(|e| format!(
                    "Failed to load onset CNN model from {}: {} — is onset_cnn.onnx present and valid?",
                    model_path.display(), e
                ))?;
            Ok(Mutex::new(session))
        })()
    });

    // Turn cached &Result<Mutex<Session>, String> into a usable &Mutex<Session>,
    // cloning the error String if init failed. (Mutex isn't Clone, so we
    // can't just clone the whole Result.)
    let session_mutex = session_result.as_ref().map_err(|e| e.clone())?;
    let mut session = session_mutex.lock()
        .map_err(|e| format!("Session lock poisoned: {}", e))?;

    let frame_size = 3 * CONTEXT_FRAMES * N_MELS; // 3600
    let mut all_probs = Vec::with_capacity(num_frames);

    // Process in chunks to limit peak memory
    for chunk_start in (0..num_frames).step_by(CHUNK_SIZE) {
        let chunk_end = (chunk_start + CHUNK_SIZE).min(num_frames);
        let chunk_len = chunk_end - chunk_start;

        // Slice the flat data for this chunk
        let flat_start = chunk_start * frame_size;
        let flat_end = chunk_end * frame_size;
        let chunk_data = &frames_flat[flat_start..flat_end];

        // Create ndarray array [chunk_len, 3, 15, 80] then convert to ort Tensor
        let input_array = Array4::<f32>::from_shape_vec(
            (chunk_len, 3, CONTEXT_FRAMES, N_MELS),
            chunk_data.to_vec(),
        ).map_err(|e| format!("Tensor shape error: {}", e))?;

        let input_tensor = Tensor::from_array(input_array)
            .map_err(|e| format!("ONNX tensor error: {}", e))?;

        // Run inference — inputs! returns Vec, session.run() returns Result
        let outputs = session.run(
            ort::inputs!["spectrogram" => input_tensor]
        ).map_err(|e| format!("ONNX inference error: {}", e))?;

        // Extract output probabilities — ort v2 returns (&Shape, &[f32])
        let (_shape, prob_data) = outputs["onset_probability"]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("ONNX output error: {}", e))?;

        all_probs.extend(prob_data.iter().copied());
    }

    Ok(all_probs)
}

// ═══════════════════════════════════════════════════════════════
// 5. TAURI COMMANDS
// ═══════════════════════════════════════════════════════════════

/// Detect musically meaningful onsets using the madmom CNN model.
///
/// Runs the full pipeline: decode audio → compute 3 mel spectrograms
/// → assemble context frames → run ONNX CNN → return probabilities.
///
/// The model is loaded lazily on first call (~200ms) and cached for
/// the lifetime of the app. For a 3-minute song, the full pipeline
/// takes ~1–3 seconds. The frontend shows an "Analyzing…" spinner.
///
/// `music_path` must be an absolute filesystem path to the audio file.
/// For disk projects, chartStore.musicPath is already absolute (the Rust
/// backend canonicalizes the project dir in validate_path(), and read_dir()
/// on an absolute path returns absolute DirEntry paths).
/// For imported charts the frontend writes the blob to a temp file
/// first via `write_temp_audio`, then passes that temp path here.
#[tauri::command]
pub async fn detect_onsets_ml(
    music_path: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<OnsetResult>, String> {
    // Resolve the model path from Tauri's resource directory
    let model_path = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot resolve resource dir: {}", e))?
        .join("models")
        .join("onset_cnn.onnx");

    if !model_path.exists() {
        return Err(format!(
            "Onset model not found at {}. Run scripts/convert_madmom_to_onnx.py first.",
            model_path.display()
        ));
    }

    // Move the entire CPU-bound pipeline to a blocking thread so we
    // don't freeze the Tauri async runtime (which handles all other
    // IPC commands like load/save project, AI chat, etc.).
    tauri::async_runtime::spawn_blocking(move || {
        let path = std::path::Path::new(&music_path);

        // 1. Decode audio to mono 44100 Hz
        let samples = decode_audio_mono(path)?;

        // 2. Build sparse mel filterbanks for each FFT size (computed
        //    once per call, ~0.1ms each — not worth caching)
        let filterbanks: Vec<Vec<SparseFilter>> = FFT_SIZES.iter()
            .map(|&fft_size| build_mel_filterbank(fft_size, SAMPLE_RATE, N_MELS, FMIN, FMAX))
            .collect();

        // 3. Compute 3 mel spectrograms in parallel with rayon.
        //    Each spectrogram is independent (own FFT planner, read-only
        //    samples slice), so they run concurrently on separate threads.
        //    Wall-clock time ≈ slowest single spectrogram instead of sum.
        //
        //    Bug audit #2: compute_mel_spectrogram now returns Result; a
        //    realfft error in any of the three parallel spectrograms
        //    propagates out of the spawn_blocking closure as a toast,
        //    instead of panicking the worker.
        let spectrograms: Vec<Vec<Vec<f32>>> = FFT_SIZES.par_iter()
            .zip(filterbanks.par_iter())
            .map(|(&fft_size, fb)| compute_mel_spectrogram(&samples, fft_size, fb))
            .collect::<Result<Vec<_>, String>>()?;

        // 4. Assemble context frames [N, 3, 15, 80]
        let (frames, num_frames) = assemble_frames(
            &spectrograms[0],
            &spectrograms[1],
            &spectrograms[2],
        );

        if num_frames == 0 {
            return Ok(Vec::new());
        }

        // 5. Run CNN inference (chunked, ~56 MB peak per chunk)
        let mut probs = run_onset_model(&frames, num_frames, &model_path)?;

        // 5.5 Silence gate — suppress CNN false positives in silent regions.
        //     The CNN's BatchNorm was trained on musical audio, so it can
        //     produce high onset probabilities for silence (where log-mel
        //     values ≈ -36 are far from the training distribution). We check
        //     the actual audio RMS energy per hop frame and zero out any
        //     probability where the audio is below the perceptible threshold.
        const SILENCE_THRESHOLD: f32 = 1e-4; // ~-80 dB, below perceptible audio
        for (i, prob) in probs.iter_mut().enumerate() {
            let start = i * HOP_SIZE;
            let end = (start + HOP_SIZE).min(samples.len());
            if start >= samples.len() || end <= start {
                *prob = 0.0;
                continue;
            }
            let mean_sq: f32 = samples[start..end].iter()
                .map(|&s| s * s)
                .sum::<f32>() / (end - start) as f32;
            if mean_sq < SILENCE_THRESHOLD {
                *prob = 0.0;
            }
        }

        // 6. Build timestamped results — one per frame at 100 fps
        let hop_seconds = HOP_SIZE as f64 / SAMPLE_RATE as f64;
        let results: Vec<OnsetResult> = probs.iter().enumerate()
            .map(|(i, &prob)| OnsetResult {
                time: i as f64 * hop_seconds,
                probability: prob as f64,
            })
            .collect();

        Ok(results)
    })
    .await
    .map_err(|e| format!("Onset detection task panicked: {}", e))?
}

/// Write audio bytes to a temporary file on disk so that detect_onsets_ml
/// can read it with symphonia.
///
/// Called by the frontend when the chart was imported (ZIP/RPE/PEC) and
/// there is no disk file — only a blob URL. The frontend fetches the
/// blob URL as an ArrayBuffer, converts to Uint8Array, and sends it here.
/// Tauri 2 IPC natively serializes Uint8Array as Vec<u8> (raw bytes).
///
/// Returns the absolute path of the temp file. The file is placed in
/// the system temp directory under "phichain-onset/". Previous temp
/// files are cleaned up on each call.
#[tauri::command]
pub async fn write_temp_audio(
    audio_bytes: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("phichain-onset");

    // Create the temp directory if it doesn't exist
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // Clean up old temp files from previous calls
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let _ = std::fs::remove_file(entry.path());
        }
    }

    // Generate a unique filename using timestamp
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let filename = format!("onset_{}.{}", nanos, extension);
    let file_path = temp_dir.join(&filename);

    // Write the audio bytes
    std::fs::write(&file_path, &audio_bytes)
        .map_err(|e| format!("Failed to write temp audio: {}", e))?;

    Ok(file_path.to_string_lossy().into_owned())
}
