//! Explicit, macOS-only system proxy changes. Recovery is persisted before mutation.
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

pub struct ProxyLock(pub Mutex<()>);
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Setting { enabled: bool, server: String, port: u16, authenticated: bool }
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup { service: String, http: Setting, https: Setting }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status { supported: bool, services: Vec<String>, recovery: Option<Backup> }

fn network(args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("/usr/sbin/networksetup")
        .env("LC_ALL", "C").args(args).output().map_err(|e| e.to_string())?;
    if !out.status.success() { return Err(String::from_utf8_lossy(&out.stderr).into_owned()); }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}
fn parse_setting(value: &str) -> Result<Setting, String> {
    let get = |key: &str| value.lines().find_map(|line| line.strip_prefix(key));
    Ok(Setting {
        enabled: get("Enabled: ").ok_or("Missing proxy state")? == "Yes",
        server: get("Server: ").ok_or("Missing proxy server")?.to_owned(),
        port: get("Port: ").ok_or("Missing proxy port")?.parse().map_err(|_| "Invalid proxy port")?,
        authenticated: get("Authenticated Proxy Enabled: ").ok_or("Missing authentication state")? != "0",
    })
}
fn restored(actual: &Setting, previous: &Setting) -> bool {
    actual.enabled == previous.enabled &&
        (previous.server.is_empty() && previous.port == 0 && !previous.enabled || actual == previous)
}
fn settings(service: &str) -> Result<Backup, String> {
    Ok(Backup { service: service.into(), http: parse_setting(&network(&["-getwebproxy", service])?)?,
        https: parse_setting(&network(&["-getsecurewebproxy", service])?)? })
}
fn services() -> Result<Vec<String>, String> {
    Ok(network(&["-listallnetworkservices"] )?.lines().skip(1)
        .filter(|s| !s.starts_with('*') && !s.is_empty()).map(str::to_owned).collect())
}
fn file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("system-proxy-recovery.json"))
}
fn read_backup(app: &tauri::AppHandle) -> Result<Option<Backup>, String> {
    let path = file(app)?;
    match std::fs::read(path) {
        Ok(data) => serde_json::from_slice(&data).map(Some).map_err(|e| format!("Cannot read proxy recovery: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
fn quote(value: &str) -> String { format!("'{}'", value.replace('\'', "'\\''")) }
fn command(service: &str, kind: &str, s: &Setting) -> String {
    let mut parts = Vec::new();
    // Empty/unconfigured proxies only need their state restored.
    if !s.server.is_empty() && s.port > 0 {
        parts.push(format!("/usr/sbin/networksetup -set{kind} {} {} {} off", quote(service), quote(&s.server), s.port));
    }
    parts.push(format!("/usr/sbin/networksetup -set{kind}state {} {}", quote(service), if s.enabled { "on" } else { "off" }));
    parts.join(" && ")
}
fn apply(config: &Backup) -> Result<(), String> {
    let shell = format!("{} && {}", command(&config.service, "webproxy", &config.http), command(&config.service, "securewebproxy", &config.https));
    let script = format!("do shell script {} with administrator privileges", serde_json::to_string(&shell).map_err(|e| e.to_string())?);
    let out = std::process::Command::new("/usr/bin/osascript").args(["-e", &script]).output().map_err(|e| e.to_string())?;
    if out.status.success() { Ok(()) } else { Err(format!("System proxy change cancelled or failed: {}", String::from_utf8_lossy(&out.stderr))) }
}
#[tauri::command]
pub async fn system_proxy_status(app: tauri::AppHandle, state: tauri::State<'_, ProxyLock>) -> Result<Status, String> {
    let _guard = state.0.lock().map_err(|_| "System proxy is busy")?;
    if !cfg!(target_os = "macos") { return Ok(Status { supported: false, services: vec![], recovery: None }); }
    Ok(Status { supported: true, services: services()?, recovery: read_backup(&app)? })
}
#[tauri::command]
pub async fn system_proxy_read(service: String, state: tauri::State<'_, ProxyLock>) -> Result<Backup, String> {
    let _guard = state.0.lock().map_err(|_| "System proxy is busy")?;
    if !cfg!(target_os = "macos") || !services()?.contains(&service) { return Err("Choose an available macOS network service".into()); }
    settings(&service)
}
#[tauri::command]
pub async fn system_proxy_change(app: tauri::AppHandle, service: String, port: u16, enable: bool, state: tauri::State<'_, ProxyLock>) -> Result<(), String> {
    let _guard = state.0.lock().map_err(|_| "System proxy is busy")?;
    if !cfg!(target_os = "macos") { return Err("System proxy is supported on macOS desktop only".into()); }
    if !enable {
        let backup = read_backup(&app)?.ok_or("No saved proxy settings to restore")?;
        apply(&backup)?;
        let actual = settings(&backup.service)?;
        if !restored(&actual.http, &backup.http) || !restored(&actual.https, &backup.https) { return Err("Restore verification failed; recovery settings retained".into()); }
        std::fs::remove_file(file(&app)?).map_err(|e| e.to_string())?;
        return Ok(());
    }
    if port < 1024 || !services()?.contains(&service) { return Err("Invalid network service or proxy port".into()); }
    if read_backup(&app)?.is_some() { return Err("Restore the previous system proxy settings first".into()); }
    let backup = settings(&service)?;
    if backup.http.authenticated || backup.https.authenticated { return Err("Authenticated system proxies must be managed in macOS Settings".into()); }
    // Confirm a listener is available before routing the system through it.
    std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127,0,0,1], port)), std::time::Duration::from_secs(2)).map_err(|_| "Start the local proxy first")?;
    let path = file(&app)?;
    std::fs::create_dir_all(path.parent().ok_or("Missing app directory")?).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut handle = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
    handle.write_all(&serde_json::to_vec(&backup).map_err(|e| e.to_string())?).and_then(|_| handle.sync_all()).map_err(|e| e.to_string())?;
    let target = Setting { enabled: true, server: "127.0.0.1".into(), port, authenticated: false };
    apply(&Backup { service: service.clone(), http: target.clone(), https: target.clone() })?;
    let actual = settings(&service)?;
    if actual.http != target || actual.https != target { return Err("Proxy verification failed; use Restore saved settings".into()); }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn parses_macos_proxy() {
        let s = parse_setting("Enabled: Yes\nServer: 127.0.0.1\nPort: 8899\nAuthenticated Proxy Enabled: 0\n").unwrap();
        assert!(s.enabled); assert_eq!(s.port, 8899); assert!(!s.authenticated);
        assert!(parse_setting("unexpected output").is_err());
    }
    #[test] fn verifies_restore_of_unconfigured_proxy() {
        let previous = Setting { enabled: false, server: String::new(), port: 0, authenticated: false };
        let actual = Setting { enabled: false, server: "127.0.0.1".into(), port: 8899, authenticated: false };
        assert!(restored(&actual, &previous));
        assert!(!restored(&Setting { enabled: true, ..actual }, &previous));
    }
    #[test] fn quotes_service_names() {
        assert_eq!(quote("Wi-Fi 'test'"), "'Wi-Fi '\\''test'\\''' ".trim_end());
    }
}
