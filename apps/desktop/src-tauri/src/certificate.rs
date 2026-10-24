//! Opens only a public certificate in Keychain Access; never changes trust.
use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateResult { trusted: Option<bool> }
fn validate_public_pem(pem: &str) -> Result<(), String> {
    let pem = pem.trim();
    if pem.len() > 32768 || !pem.starts_with("-----BEGIN CERTIFICATE-----")
        || !pem.ends_with("-----END CERTIFICATE-----")
        || pem.matches("-----BEGIN").count() != 1 || pem.contains("PRIVATE KEY") {
        return Err("Expected one public PEM certificate".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn local_certificate_action(app: tauri::AppHandle, pem: String, action: String) -> Result<CertificateResult, String> {
    if !cfg!(target_os = "macos") { return Err("Use the download and manual trust steps on this platform".into()); }
    validate_public_pem(&pem)?;
    if action != "open" && action != "verify" { return Err("Unknown certificate action".into()); }
    let directory = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("public-certificates");
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let id = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let path = directory.join(format!("edith-debug-ca-{id}.crt"));
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
        file.write_all(pem.as_bytes()).map_err(|e| e.to_string())?;
        // Decode before opening; a PEM-looking string is not enough.
        let decoded = std::process::Command::new("/usr/bin/openssl").args(["x509", "-in"]).arg(&path).args(["-noout"]).output().map_err(|e| e.to_string())?;
        if !decoded.status.success() { let _ = std::fs::remove_file(&path); return Err("Invalid public certificate".into()); }
        if action == "open" {
            let result = std::process::Command::new("/usr/bin/open").args(["-b", "com.apple.keychainaccess"]).arg(&path).output().map_err(|e| e.to_string())?;
            if !result.status.success() { return Err("Unable to open Keychain Access. Download the public CA and open it manually.".into()); }
            // Keep the file until Keychain Access has read it.
            Ok(CertificateResult { trusted: None })
        } else {
            // -l allows a CA leaf; no -r override, so trust comes from the user's keychains.
            let result = std::process::Command::new("/usr/bin/security").args(["verify-cert", "-L", "-l", "-p", "ssl", "-c"]).arg(&path).output().map_err(|e| e.to_string());
            let _ = std::fs::remove_file(&path);
            Ok(CertificateResult { trusted: Some(result?.status.success()) })
        }
    }).await.map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_private_material_and_multiple_certs() {
        assert!(validate_public_pem("-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----").is_err());
        let cert = "-----BEGIN CERTIFICATE-----\nplaceholder\n-----END CERTIFICATE-----";
        assert!(validate_public_pem(cert).is_ok());
        assert!(validate_public_pem(&format!("{cert}\n{cert}")).is_err());
        assert!(validate_public_pem("not a certificate").is_err());
    }
}
