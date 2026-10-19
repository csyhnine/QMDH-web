"""Offline CSR signing; never creates or copies a Windows private key.

Use only after independently confirming the requesting machine/CSR fingerprint.
The CA directory must be an access-restricted, Git-external directory.
"""
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def sign(ca_dir: Path, csr_path: Path, output: Path):
    csr = x509.load_pem_x509_csr(csr_path.read_bytes())
    public = csr.public_key()
    strong = (isinstance(public, rsa.RSAPublicKey) and public.key_size >= 2048) or (
        isinstance(public, ec.EllipticCurvePublicKey) and public.key_size >= 256)
    if not csr.is_signature_valid or not strong:
        raise ValueError("Invalid CSR signature or public key")
    ca = x509.load_pem_x509_certificate((ca_dir / "client-ca.crt").read_bytes())
    key = serialization.load_pem_private_key((ca_dir / "client-ca.key").read_bytes(), password=None)
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder()
            .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "qmdh-windows")]))
            .issuer_name(ca.subject).public_key(csr.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(now - timedelta(minutes=5))
            .not_valid_after(min(now + timedelta(days=90), ca.not_valid_after_utc))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH]), critical=False)
            .sign(key, hashes.SHA256()))
    # Refuse to overwrite an earlier signed artifact.
    with output.open("xb") as stream:
        stream.write(cert.public_bytes(serialization.Encoding.PEM))
    print("Signed certificate:", output)
    print("SHA256:", cert.fingerprint(hashes.SHA256()).hex())
    print("Expires:", cert.not_valid_after_utc.isoformat())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ca-dir", required=True, type=Path)
    parser.add_argument("--csr", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    sign(args.ca_dir, args.csr, args.output)
