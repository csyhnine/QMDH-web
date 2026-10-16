# Optional Linux ODA installer

Put the official Linux amd64 ODA File Converter `.deb` here on the deployment host.
Installers are ignored by Git and must not be committed or redistributed here.

Set `QMDH_CAD_ODA_PACKAGE` to the basename and `QMDH_CAD_ODA_SHA256` to the verified
SHA256 in the server `.env`. Compose supplies both as Docker build arguments.
Without a package argument, normal builds do not install ODA.

Runtime command:
`QMDH_CAD_DWG_CONVERTER_CMD=python -m app.scripts.convert_dwg_oda --input {input} --output-dir {output_dir}`

Rebuild backend/worker after changing the installer. Keep the official installer,
its source URL, version and hash in the release backup, outside the repository.
