## Step 0 – Prerequisites (Windows)

### 0a. Check installed tools

```powershell
git --version          # had: 2.49.0.windows.1
python --version       # had: 3.13 (need 3.11+)
node --version         # had: v24.11.0 (need 20+)
docker --version
docker compose version
```

Result: everything present except Docker.

### 0b. Install Docker Desktop

Docker Desktop on Windows runs on WSL 2.

1. Install or update WSL 2 (PowerShell **as Administrator**):

```powershell
   wsl --install      # first time; restart PC if asked
   wsl --update       # if WSL is already installed
```

2. Install Docker Desktop (normal PowerShell):

```powershell
   winget install -e --id Docker.DockerDesktop
```

   Installed version: 4.95.0. Keep "Use WSL 2 instead of Hyper-V" ticked.

3. Start **Docker Desktop** from the Start menu, accept the terms, skip sign-in,
   and wait for "Engine running".

Notes:
- A black "WSL Debug Console" window may appear. It's Docker's internal Linux VM
  boot log, harmless, and can be closed.
- "Resource Saver mode" in Docker Desktop means the engine is idle. It wakes up
  automatically when a command runs.

### 0c. Verify Docker

```powershell
docker --version
docker compose version
docker run --rm hello-world     # must print "Hello from Docker!"
```

Result: "Hello from Docker!" ✔

### Troubleshooting: `docker` is not recognized

**Cause:** VS Code (or a terminal) was already open before Docker was installed,
so it still has the old PATH.

**Fix A (recommended):** close ALL VS Code windows, reopen, and run the commands again.

**Fix B (current terminal only):** reload PATH:

```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
docker --version
```

**Check that the Docker CLI exists:**

```powershell
Test-Path "C:\Program Files\Docker\Docker\resources\bin\docker.exe"   # should print True
```