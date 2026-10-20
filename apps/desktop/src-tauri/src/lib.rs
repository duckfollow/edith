mod system_monitor;
use serde::Serialize;
use std::sync::Mutex;
use system_monitor::{SystemSampler, SystemSnapshot};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkInterface {
    name: String,
    description: Option<String>,
    addresses: Vec<String>,
}

// Read-only discovery. Capturing is intentionally not exposed until the
// privileged helper and its restricted IPC lifecycle have been implemented.
#[tauri::command]
fn list_interfaces() -> Result<Vec<NetworkInterface>, String> {
    pcap::Device::list()
        .map(|devices| {
            devices
                .into_iter()
                .map(|device| NetworkInterface {
                    name: device.name,
                    description: device.desc,
                    addresses: device.addresses.into_iter().map(|a| a.addr.to_string()).collect(),
                })
                .collect()
        })
        .map_err(|error| format!("Unable to enumerate capture interfaces: {error}. Check your platform's libpcap/Npcap installation and capture permissions."))
}

#[tauri::command]
fn sample_system_metrics(
    reset_baseline: bool,
    state: tauri::State<'_, Mutex<SystemSampler>>,
) -> Result<SystemSnapshot, String> {
    state
        .lock()
        .map_err(|_| "System sampler is unavailable".to_owned())?
        .sample(reset_baseline)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(SystemSampler::default()))
        .invoke_handler(tauri::generate_handler![
            list_interfaces,
            sample_system_metrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running EDITH");
}
