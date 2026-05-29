import os
import subprocess
import tempfile

host_path = "/opt/data/skills/.bundled_manifest"
remote_path = "/home/YOUR_VM_USER/.hermes/skills/.bundled_manifest"

with tempfile.TemporaryDirectory(prefix="hermes-sync-") as staging:
    rel = os.path.relpath(remote_path, "/")
    staged_file = os.path.join(staging, rel)
    os.makedirs(os.path.dirname(staged_file), exist_ok=True)
    os.symlink(host_path, staged_file)
    
    tar_cmd = ["tar", "-chf", "-", "-C", staging, "."]
    tar_proc = subprocess.Popen(
        tar_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    stdout, stderr = tar_proc.communicate()
    print("rc:", tar_proc.returncode)
    print("stderr:", stderr.decode())
