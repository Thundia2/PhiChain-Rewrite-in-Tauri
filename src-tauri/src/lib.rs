// ============================================================
// Tauri application entry point.
//
// Recent change (bug audit #15): the final `.expect("error while
// running Phichain")` was replaced with an explicit error print +
// `std::process::exit(1)`. If Tauri fails to start (missing webview
// runtime, bad capability config, port conflict), the old code
// panicked with a one-line message that hid the real error. Now we
// print the full Debug formatting of the error before exiting so
// the user (or a CI log) can see what actually went wrong.
// ============================================================

mod commands;
mod ai_proxy;
mod onset_ml;

/// Starts the Tauri application.
///
/// This wires up:
/// - The Tauri plugins (dialog for file pickers, fs for file access)
/// - The IPC commands that the React frontend calls to interact with
///   the Rust chart/compiler crates
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Project commands — load/save chart files using the
            // existing phichain-chart serialization code
            commands::load_project,
            commands::save_project,
            commands::create_project,

            // Export commands — compile and convert charts using
            // the existing phichain-compiler and format converters
            commands::export_as_official,

            // Utility commands
            commands::get_app_version,

            // AI proxy — forwards requests to local inference server
            ai_proxy::ai_generate,
            ai_proxy::ai_generate_stream,

            // ML onset detection — CNN inference via ONNX Runtime
            onset_ml::detect_onsets_ml,
            onset_ml::write_temp_audio,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        // Print the actionable error (Debug formatting shows the full
        // error chain) and exit non-zero. Using eprintln so CI /
        // launchers can pick it up; stdout is less reliable in the
        // GUI context.
        eprintln!("Tauri startup failed: {:?}", e);
        std::process::exit(1);
    }
}
