use serde::Serialize;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_interfaces])
        .run(tauri::generate_context!())
        .expect("error while running EDITH");
}
