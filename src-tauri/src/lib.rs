mod commands;

/// Starts the Tauri application.
/// 
/// This wires up:
/// - The Tauri plugins (dialog for file pickers, fs for file access)
/// - The IPC commands that the React frontend calls to interact with
///   the Rust chart/compiler crates
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Phichain");
}
