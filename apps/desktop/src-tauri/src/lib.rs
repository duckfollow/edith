mod desktop_runtime;
mod certificate;
mod system_monitor;
mod system_proxy;
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
    #[cfg(target_os = "macos")]
    objc2_foundation::NSProcessInfo::processInfo()
        .setProcessName(objc2_foundation::ns_string!("EDITH"));
    tauri::Builder::default()
        .manage(desktop_runtime::DesktopRuntime::default())
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                if let Err(error) = app.state::<desktop_runtime::DesktopRuntime>().start(app.handle()) {
                    eprintln!("EDITH service startup: {error}");
                }
            }
            #[cfg(debug_assertions)]
            let _ = app;
            // `tauri dev` runs an unbundled executable, so macOS needs an
            // explicit Dock icon in addition to the installer bundle icons.
            #[cfg(target_os = "macos")]
            {
                use objc2::{AnyThread, MainThreadMarker};
                use objc2_app_kit::{NSApplication, NSImage};
                use objc2_foundation::NSData;
                let main_thread = MainThreadMarker::new()
                    .ok_or("App branding must be initialized on the main thread")?;
                let data = NSData::with_bytes(include_bytes!("../icons/icon.icns"));
                let image = NSImage::initWithData(NSImage::alloc(), &data)
                    .ok_or("Unable to decode the EDITH application icon")?;
                // SAFETY: AppKit is accessed on the main thread, and retains
                // the valid NSImage passed to this setter.
                unsafe {
                    NSApplication::sharedApplication(main_thread)
                        .setApplicationIconImage(Some(&image));
                }
            }
            Ok(())
        })
        .manage(Mutex::new(SystemSampler::default()))
        .manage(system_proxy::ProxyLock(Mutex::new(())))
        .invoke_handler(tauri::generate_handler![
            desktop_runtime::desktop_set_workspace_mode,
            desktop_runtime::desktop_runtime_info,
            desktop_runtime::desktop_runtime_request,
            desktop_runtime::desktop_save_public_ca,
            certificate::local_certificate_action,
            system_proxy::system_proxy_status,
            system_proxy::system_proxy_read,
            system_proxy::system_proxy_change,
            list_interfaces,
            sample_system_metrics
        ])
        .build(tauri::generate_context!())
        .expect("error while building EDITH")
        .run(|app, event| {
            use tauri::{Emitter, Manager};
            match event {
                tauri::RunEvent::ExitRequested { api, .. } => {
                    if app.state::<desktop_runtime::DesktopRuntime>().is_running() {
                        if let Err(error) = system_proxy::restore_for_runtime_change(app) {
                            api.prevent_exit();
                            let _ = app.emit("edith-runtime-error", format!("Unable to restore System Proxy before quitting: {error}"));
                        }
                    }
                }
                tauri::RunEvent::Exit => app.state::<desktop_runtime::DesktopRuntime>().stop(),
                _ => {}
            }
        });
}
