use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, io::{BufRead, BufReader, Read}, process::{Child, ChildStdin, Command, Stdio}, sync::{Arc, Mutex}, time::Duration};
use tauri::Manager;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo { pub port: u16, pub mode: String, pub setup_token: Option<String> }
#[derive(Deserialize)]
pub struct RuntimeRequest { path: String, method: String, headers: BTreeMap<String, String>, body: Option<String> }
#[derive(Serialize)]
pub struct RuntimeResponse { status: u16, headers: BTreeMap<String, String>, body: Vec<u8> }
pub struct Backend {
    child: Mutex<Child>, stdin: Mutex<Option<ChildStdin>>, client: reqwest::blocking::Client,
    secret: String, pub info: RuntimeInfo,
}
#[derive(Default)]
pub struct DesktopRuntime(pub Mutex<Option<Arc<Backend>>>);
fn valid_request(request: &RuntimeRequest) -> bool {
    let path = request.path.split('?').next().unwrap_or("");
    request.path.len() <= 4096 && !request.path.chars().any(char::is_control)
        && !request.path.contains('#') && !path.contains('%') && !path.contains("..")
        && ["/__edith_auth/", "/__edith_access/", "/__edith_gateway/", "/__edith_proxy/", "/__edith_sdk/", "/__edith_system/"].iter().any(|prefix| path.starts_with(prefix))
        && ["GET", "POST"].contains(&request.method.as_str())
        && request.body.as_ref().map_or(true, |body| body.len() <= 65536)
        && request.headers.keys().all(|key| ["content-type", "x-edith-token"].contains(&key.to_lowercase().as_str()))
}
impl Backend {
    fn request(&self, request: RuntimeRequest) -> Result<RuntimeResponse, String> {
        if !valid_request(&request) { return Err("Unsupported desktop service request".into()); }
        let url = format!("http://127.0.0.1:{}{}", self.info.port, request.path);
        let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|e| e.to_string())?;
        let mut builder = self.client.request(method, url).header("X-Edith-Runtime-Secret", &self.secret);
        for (key, value) in request.headers { builder = builder.header(key, value); }
        if let Some(body) = request.body { builder = builder.body(body); }
        let response = builder.send().map_err(|_| "The local desktop service is unavailable. Restart EDITH.")?;
        let status = response.status().as_u16();
        let headers = response.headers().iter().filter(|(key, _)| ["content-type", "content-disposition"].contains(&key.as_str()))
            .filter_map(|(key, value)| value.to_str().ok().map(|value| (key.to_string(), value.to_owned()))).collect();
        let mut body = Vec::new();
        response.take(16 * 1024 * 1024 + 1).read_to_end(&mut body).map_err(|e| e.to_string())?;
        if body.len() > 16 * 1024 * 1024 { return Err("Desktop response exceeded the size limit".into()); }
        Ok(RuntimeResponse { status, headers, body })
    }
    fn stop(&self) {
        if let Ok(mut input) = self.stdin.lock() { input.take(); }
        if let Ok(mut child) = self.child.lock() {
            for _ in 0..60 {
                if child.try_wait().ok().flatten().is_some() { return; }
                std::thread::sleep(Duration::from_millis(100));
            }
            let _ = child.kill(); let _ = child.wait();
        }
    }
}
impl Drop for Backend { fn drop(&mut self) { self.stop(); } }
impl DesktopRuntime {
    pub fn start(&self, app: &tauri::AppHandle) -> Result<RuntimeInfo, String> {
        let mut slot = self.0.lock().map_err(|_| "Desktop runtime is busy")?;
        if let Some(backend) = slot.as_ref() { return Ok(backend.info.clone()); }
        let resources = app.path().resource_dir().map_err(|e| e.to_string())?.join("runtime");
        let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let mode = std::fs::read_to_string(directory.join("workspace-mode.txt")).unwrap_or_else(|_| "local".into());
        let mode = mode.trim();
        if !["local", "team"].contains(&mode) { return Err("Invalid saved workspace mode".into()); }
        let mut bytes = [0u8; 32]; getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let secret: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        let log = std::fs::OpenOptions::new().create(true).append(true).open(directory.join("desktop-runtime.log")).map_err(|e| e.to_string())?;
        let mut command = Command::new(resources.join("node"));
        command.arg(resources.join("server/desktop-runtime.mjs")).current_dir(&directory)
            .env("EDITH_DATA_DIR", &directory).env("EDITH_MODE", mode).env("EDITH_RUNTIME_SECRET", &secret)
            .env_remove("NODE_OPTIONS").env_remove("NODE_PATH").env_remove("NODE_EXTRA_CA_CERTS")
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::from(log));
        #[cfg(target_os = "macos")]
        command.env("EDITH_OPENSSL", "/usr/bin/openssl");
        let mut child = command.spawn().map_err(|e| format!("Unable to start bundled service: {e}"))?;
        let input = child.stdin.take();
        let output = child.stdout.take().ok_or("Missing runtime readiness channel")?;
        let (send, receive) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(output).lines().map_while(Result::ok) {
                if let Ok(info) = serde_json::from_str::<RuntimeInfo>(&line) { let _ = send.send(info); }
            }
        });
        let info = match receive.recv_timeout(Duration::from_secs(20)) {
            Ok(info) if info.port > 0 && info.mode == mode => info,
            _ => { let _ = child.kill(); let _ = child.wait(); return Err("Bundled service did not become ready. Check desktop-runtime.log in the app data folder.".into()); }
        };
        let client = reqwest::blocking::Client::builder().no_proxy().cookie_store(true)
            .redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(65)).build().map_err(|e| e.to_string())?;
        *slot = Some(Arc::new(Backend { child: Mutex::new(child), stdin: Mutex::new(input), client, secret, info: info.clone() }));
        Ok(info)
    }
    fn backend(&self) -> Result<Arc<Backend>, String> {
        self.0.lock().map_err(|_| "Desktop runtime is busy")?.clone().ok_or_else(|| "Desktop service is not running".into())
    }
    pub fn is_running(&self) -> bool { self.0.lock().map(|slot| slot.is_some()).unwrap_or(false) }
    pub fn stop(&self) {
        if let Ok(mut slot) = self.0.lock() { if let Some(backend) = slot.take() { backend.stop(); } }
    }
}
#[tauri::command]
pub async fn desktop_runtime_info(app: tauri::AppHandle) -> Result<RuntimeInfo, String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<DesktopRuntime>().start(&app)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn desktop_runtime_request(app: tauri::AppHandle, request: RuntimeRequest) -> Result<RuntimeResponse, String> {
    let backend = app.state::<DesktopRuntime>().backend()?;
    tauri::async_runtime::spawn_blocking(move || backend.request(request)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn desktop_save_public_ca(app: tauri::AppHandle) -> Result<String, String> {
    let backend = app.state::<DesktopRuntime>().backend()?;
    tauri::async_runtime::spawn_blocking(move || {
        let response = backend.request(RuntimeRequest { path: "/__edith_proxy/ca".into(), method: "GET".into(), headers: BTreeMap::new(), body: None })?;
        let pem = String::from_utf8(response.body).map_err(|e| e.to_string())?;
        if response.status != 200 || pem.len() > 32768 || !pem.starts_with("-----BEGIN CERTIFICATE-----") || pem.contains("PRIVATE KEY") { return Err("Create a public certificate before downloading".into()); }
        let directory = app.path().download_dir().map_err(|e| e.to_string())?;
        let id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_secs();
        let path = directory.join(format!("EDITH-debug-ca-{id}.crt"));
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
        file.write_all(pem.as_bytes()).map_err(|e| e.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    }).await.map_err(|e| e.to_string())?
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn rejects_arbitrary_urls_and_headers() {
        let req = |path: &str| RuntimeRequest { path: path.into(), method: "GET".into(), headers: BTreeMap::new(), body: None };
        assert!(valid_request(&req("/__edith_proxy/status")));
        for path in ["https://example.com", "//example.com", "/__edith_proxy/../secret", "/__edith_proxy/%2e%2e/secret", "/__edith_proxy/status#bad"] { assert!(!valid_request(&req(path))); }
        let mut r = req("/__edith_auth/status"); r.headers.insert("X-Edith-Runtime-Secret".into(), "override".into()); assert!(!valid_request(&r));
    }
}

#[tauri::command]
pub async fn desktop_set_workspace_mode(app: tauri::AppHandle, mode: String) -> Result<RuntimeInfo, String> {
    if !["local", "team"].contains(&mode.as_str()) { return Err("Invalid workspace mode".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<DesktopRuntime>();
        let backend = state.backend()?;
        let response = backend.request(RuntimeRequest { path: "/__edith_access/policy".into(), method: "GET".into(), headers: BTreeMap::new(), body: None })?;
        let policy: serde_json::Value = serde_json::from_slice(&response.body).map_err(|e| e.to_string())?;
        if response.status != 200 || policy.get("role").and_then(|role| role.as_str()) != Some("admin") { return Err("Admin access is required to switch workspace mode".into()); }
        crate::system_proxy::restore_for_runtime_change(&app)?;
        let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let temporary = directory.join("workspace-mode.txt.next");
        std::fs::write(&temporary, &mode).map_err(|e| e.to_string())?;
        std::fs::rename(temporary, directory.join("workspace-mode.txt")).map_err(|e| e.to_string())?;
        state.stop();
        state.start(&app)
    }).await.map_err(|e| e.to_string())?
}
