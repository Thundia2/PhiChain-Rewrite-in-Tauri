// ============================================================
// Tauri IPC Commands
//
// These are thin wrappers around the existing phichain-chart and
// phichain-compiler Rust crates. The React frontend calls these
// via `invoke("command_name", { args })`.
//
// The phichain-chart crate handles:
//   - Beat math (rational numbers for precise timing)
//   - BPM list calculations
//   - Note and LineEvent data structures
//   - Chart serialization/deserialization (JSON)
//   - Format conversion (Official, RPE, Phichain)
//   - 5 migration steps for older chart formats
//
// The phichain-compiler crate handles:
//   - Compiling charts (merging child lines, evaluating curves)
//
// None of that code is duplicated here — we just call into it.
// ============================================================

use phichain_chart::project::{Project, ProjectMeta, ProjectPath};
use phichain_chart::serialization::PhichainChart;
use phichain_chart::primitive::Format;
use phichain_chart::format::official::OfficialChart;
use phichain_chart::migration;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// The data the frontend receives when loading a project.
/// Contains the chart JSON (which the frontend parses into its own types)
/// plus the project metadata (song name, charter, etc.).
#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectData {
    /// The raw chart JSON string — the frontend parses this
    pub chart_json: String,
    /// Project metadata (song name, composer, etc.)
    pub meta: ProjectMeta,
    /// The project root directory path
    pub project_path: String,
    /// Path to the music file (relative to project root)
    pub music_path: Option<String>,
    /// Path to the illustration file (relative to project root)
    pub illustration_path: Option<String>,
}

/// Load an existing project from a directory.
///
/// The directory must contain:
/// - chart.json (the chart data)
/// - meta.json  (song metadata)
/// - music.wav/mp3/ogg/flac (the audio file)
///
/// This uses the existing `phichain_chart::project::Project::open()`
/// which handles validation and error reporting.
#[tauri::command]
pub fn load_project(path: String) -> Result<ProjectData, String> {
    let project_path = ProjectPath(PathBuf::from(&path));

    // Open the project using the existing phichain-chart code
    let project = Project::open(PathBuf::from(&path))
        .map_err(|e| format!("Failed to open project: {}", e))?;

    // Read the chart JSON file
    let chart_json = std::fs::read_to_string(project_path.chart_path())
        .map_err(|e| format!("Failed to read chart.json: {}", e))?;

    // Run migrations if needed (the chart format has evolved over
    // 5 versions — this upgrades older charts automatically)
    let chart_value: serde_json::Value = serde_json::from_str(&chart_json)
        .map_err(|e| format!("Failed to parse chart.json: {}", e))?;

    let migrated = migration::migrate(&chart_value)
        .map_err(|e| format!("Failed to migrate chart: {}", e))?;

    let migrated_json = serde_json::to_string_pretty(&migrated)
        .map_err(|e| format!("Failed to serialize migrated chart: {}", e))?;

    Ok(ProjectData {
        chart_json: migrated_json,
        meta: project.meta,
        project_path: path,
        music_path: project_path.music_path().map(|p| p.to_string_lossy().into_owned()),
        illustration_path: project_path.illustration_path().map(|p| p.to_string_lossy().into_owned()),
    })
}

/// Save the chart to disk.
///
/// The frontend sends the full chart as a JSON string, and we write
/// it to chart.json in the project directory.
#[tauri::command]
pub fn save_project(project_path: String, chart_json: String) -> Result<(), String> {
    let chart_path = PathBuf::from(&project_path).join("chart.json");

    // Validate that the JSON is a valid PhichainChart before writing
    let _chart: PhichainChart = serde_json::from_str(&chart_json)
        .map_err(|e| format!("Invalid chart data: {}", e))?;

    std::fs::write(chart_path, &chart_json)
        .map_err(|e| format!("Failed to write chart.json: {}", e))?;

    Ok(())
}

/// Create a new empty project in the given directory.
///
/// This creates:
/// - chart.json with a default chart (one line with default events)
/// - meta.json with the provided metadata
/// - Copies the music and illustration files into the project folder
#[tauri::command]
pub fn create_project(
    path: String,
    meta_json: String,
    music_source: String,
    illustration_source: Option<String>,
) -> Result<(), String> {
    let project_dir = PathBuf::from(&path);

    // Create the directory if it doesn't exist
    std::fs::create_dir_all(&project_dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Write metadata
    let meta: ProjectMeta = serde_json::from_str(&meta_json)
        .map_err(|e| format!("Invalid metadata: {}", e))?;
    let meta_path = project_dir.join("meta.json");
    std::fs::write(meta_path, serde_json::to_string_pretty(&meta).unwrap())
        .map_err(|e| format!("Failed to write meta.json: {}", e))?;

    // Write default chart
    let default_chart = PhichainChart::default();
    let chart_json = serde_json::to_string_pretty(&default_chart)
        .map_err(|e| format!("Failed to serialize default chart: {}", e))?;
    let chart_path = project_dir.join("chart.json");
    std::fs::write(chart_path, chart_json)
        .map_err(|e| format!("Failed to write chart.json: {}", e))?;

    // Copy music file
    let music_src = PathBuf::from(&music_source);
    let music_ext = music_src.extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_else(|| "wav".to_string());
    let music_dest = project_dir.join(format!("music.{}", music_ext));
    std::fs::copy(&music_src, &music_dest)
        .map_err(|e| format!("Failed to copy music file: {}", e))?;

    // Copy illustration file if provided
    if let Some(illust_source) = illustration_source {
        let illust_src = PathBuf::from(&illust_source);
        let illust_ext = illust_src.extension()
            .map(|e| e.to_string_lossy().into_owned())
            .unwrap_or_else(|| "png".to_string());
        let illust_dest = project_dir.join(format!("illustration.{}", illust_ext));
        std::fs::copy(&illust_src, &illust_dest)
            .map_err(|e| format!("Failed to copy illustration file: {}", e))?;
    }

    Ok(())
}

/// Export the chart in Official (Phigros) format.
///
/// Uses the existing phichain-compiler to compile the chart
/// (merge child lines, evaluate curve note tracks), then
/// converts to the Official format.
#[tauri::command]
pub fn export_as_official(chart_json: String) -> Result<String, String> {
    // Parse the chart
    let chart: PhichainChart = serde_json::from_str(&chart_json)
        .map_err(|e| format!("Invalid chart data: {}", e))?;

    // Compile using the existing phichain-compiler crate
    let primitive = phichain_compiler::compile(chart)
        .map_err(|e| format!("Failed to compile chart: {}", e))?;

    // Convert to Official format using existing converter
    let official = OfficialChart::from_primitive(primitive)
        .map_err(|e| format!("Failed to convert to Official format: {}", e))?;

    // Serialize to JSON
    serde_json::to_string_pretty(&official)
        .map_err(|e| format!("Failed to serialize Official chart: {}", e))
}

/// Returns the app version string.
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
