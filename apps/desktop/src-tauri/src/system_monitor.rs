use serde::Serialize;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use sysinfo::System;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    timestamp: u64,
    cpu_percent: Option<f32>,
    cores: Vec<Option<f32>>,
    memory_total_bytes: u64,
    memory_free_bytes: u64,
    memory_used_bytes: u64,
    memory_percent: f64,
    cpu_model: String,
    logical_cores: usize,
    platform: &'static str,
    arch: &'static str,
    source: &'static str,
}

pub struct SystemSampler {
    system: System,
    previous: Option<Instant>,
    cached: Option<SystemSnapshot>,
}
impl Default for SystemSampler {
    fn default() -> Self {
        Self {
            system: System::new(),
            previous: None,
            cached: None,
        }
    }
}
impl SystemSampler {
    pub fn sample(&mut self, reset: bool) -> Result<SystemSnapshot, String> {
        if !sysinfo::IS_SUPPORTED_SYSTEM {
            return Err("System metrics are unsupported on this platform".into());
        }
        if !reset
            && self
                .previous
                .is_some_and(|time| time.elapsed() < Duration::from_millis(900))
        {
            if let Some(cached) = &self.cached {
                return Ok(cached.clone());
            }
        }
        let warmed = !reset && self.previous.is_some();
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        let total = self.system.total_memory();
        let free = self.system.free_memory().min(total);
        let used = total.saturating_sub(free);
        let snapshot = SystemSnapshot {
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| error.to_string())?
                .as_millis() as u64,
            cpu_percent: warmed.then(|| self.system.global_cpu_usage().clamp(0.0, 100.0)),
            cores: self
                .system
                .cpus()
                .iter()
                .map(|cpu| warmed.then(|| cpu.cpu_usage().clamp(0.0, 100.0)))
                .collect(),
            memory_total_bytes: total,
            memory_free_bytes: free,
            memory_used_bytes: used,
            memory_percent: if total > 0 {
                used as f64 / total as f64 * 100.0
            } else {
                0.0
            },
            cpu_model: self
                .system
                .cpus()
                .first()
                .map(|cpu| cpu.brand().to_owned())
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| "Unavailable".into()),
            logical_cores: self.system.cpus().len(),
            platform: std::env::consts::OS,
            arch: std::env::consts::ARCH,
            source: "rust-sysinfo",
        };
        self.previous = Some(Instant::now());
        self.cached = Some(snapshot.clone());
        Ok(snapshot)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn primes_cpu_and_returns_consistent_host_memory() {
        let mut sampler = SystemSampler::default();
        let first = sampler.sample(true).unwrap();
        assert!(first.cpu_percent.is_none());
        assert_eq!(
            first.memory_used_bytes + first.memory_free_bytes,
            first.memory_total_bytes
        );
        assert!((0.0..=100.0).contains(&first.memory_percent));
        assert!(first.logical_cores > 0);
        let cached = sampler.sample(false).unwrap();
        assert_eq!(cached.timestamp, first.timestamp);
        std::thread::sleep(Duration::from_millis(1000));
        let next = sampler.sample(false).unwrap();
        assert!(next.timestamp > first.timestamp);
        assert!((0.0..=100.0).contains(&next.cpu_percent.unwrap()));
        assert!(next
            .cores
            .iter()
            .all(|usage| usage.is_some_and(|value| (0.0..=100.0).contains(&value))));
    }
}
