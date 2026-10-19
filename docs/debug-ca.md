# Machine-local development CA

Create a CA on each development machine:

```sh
npm run ca:create
```

The script requires OpenSSL/LibreSSL and generates a distinct RSA-3072, SHA-256 self-signed CA valid for 365 days. CA extensions include critical CA:TRUE, pathlen:0 and keyCertSign/cRLSign. It validates the certificate signature against the key's public component and checks the certificate with OpenSSL.

Files are created under the Git-ignored `.local/ca/`:

- `edith-debug-ca.cert.pem`: public certificate in PEM format.
- `edith-debug-ca.cer`: the same public certificate in DER format, suitable for certificate import tools.
- `edith-debug-ca.key.pem`: private signing key, unencrypted for a future local proxy, with owner-only filesystem permissions on this machine.
- `metadata.json`: public identity, fingerprint, validity, and generation-time status.
- `openssl.cnf`: generation configuration.

The directory is owner-only (0700) and private key is 0600 on POSIX systems. Permission-mode enforcement is not equivalent on Windows; future Windows integration needs a user-private data directory and native ACL validation before use. File permissions were verified on the current macOS machine.

Existing CA directories are never overwritten or rotated automatically. Rerunning refuses to generate another key. Do not commit, upload, copy to another developer, or distribute the private key. Public certificates can be exported separately. Metadata status fields record generation-time facts, not live operating-system trust state.

## Current boundary

Generating this CA **does not install or trust it**, and does not enable HTTPS interception. The current proxy still forwards encrypted CONNECT tunnels. A future implementation must issue server certificates for explicitly inspected hosts, use the local signing key, verify upstream TLS normally, and offer clear enable/disable and certificate removal paths. Do not disable upstream certificate verification.

There is no automatic trust-store modification in the script. The public CA import and trust decision remain a separate step. This CA is for local development testing, not a production public certificate authority.

Extension format reference: [OpenSSL x509v3 configuration](https://docs.openssl.org/3.0/man5/x509v3_config/).
