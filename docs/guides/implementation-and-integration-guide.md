# Guide: ZKTeco Simulator Implementation & Integration

This guide provides end-to-end instructions for implementing, configuring, and testing the ZKTeco biometric simulator alongside the BITS full-stack platform.

---

## 1. Prerequisites

- **Node.js**: v20 or higher
- **Git**: Ensure submodules are checked out:
  ```bash
  git submodule update --init --recursive
  ```
- **PostgreSQL**: PostgreSQL 15 (running locally or via Docker)

---

## 2. Option A: Local Bare-Metal Setup (Fastest for Development)

### Step 1: Install Simulator Dependencies
Open a terminal in the `simulator/` directory:
```bash
cd simulator
npm install
```

### Step 2: Configure Environment Variables
To prevent port collision with the Next.js frontend (which uses port 3000), set `ZK_HTTP_PORT=3030`:

Create a `.env` file in `simulator/.env`:
```env
ZK_TCP_PORT=4370
ZK_HTTP_PORT=3030
ZK_HTTP_HOST=0.0.0.0
ZK_DEVICE_NAME="Virtual ZKTeco Terminal"
ZK_SERIAL="CJ7X202660399"
ZK_STORE=memory
ZK_SEED=standard
ZK_LOG_LEVEL=info
```

### Step 3: Start the Simulator
```bash
npm run dev
```

You should see:
```text
[info] protocol engine listening {"port": 4370}
[info] http server listening {"port": 3030}
```

### Step 4: Verify the Simulator Device-Face UI
Open your browser to [http://localhost:3030](http://localhost:3030).
You will see the bezel-framed ZKTeco terminal simulation with an active LCD clock and a **SCAN** button.

---

## 3. Option B: Docker Compose Setup (Unified Stack)

To run the simulator automatically with the rest of the BITS stack in `docker-compose.yml`, add the following service definition:

```yaml
  simulator:
    build:
      context: ./simulator
      dockerfile: Dockerfile
    container_name: bits_simulator
    environment:
      ZK_TCP_PORT: 4370
      ZK_HTTP_PORT: 3000
      ZK_DEVICE_NAME: "Virtual ZKTeco Terminal"
      ZK_SERIAL: "CJ7X202660399"
      ZK_STORE: memory
      ZK_SEED: standard
      ZK_LOG_LEVEL: info
    ports:
      - "4370:4370"     # ZKTeco binary protocol port
      - "3030:3000"     # Device-face web UI exposed on host port 3030
    networks:
      - bits_network
```

> **Note**: Inside the Docker network, the backend accesses the simulator at host `simulator` on port `4370`.

---

## 4. Registering the Simulator in BITS

### Step 1: Log in to BITS Admin Portal
1. Open [http://localhost:3000](http://localhost:3000) (or your configured frontend port).
2. Log in with default seed credentials:
   - **Email**: `admin@avegabros.com`
   - **Password**: `password123`

### Step 2: Add the Simulator as a Device
1. Navigate to **Admin** $\rightarrow$ **Biometrics** $\rightarrow$ **Devices** (`/admin/devices`).
2. Click **Add Device** (or Register New Device).
3. Fill in the device registration modal:
   - **Name**: `Virtual ZKTeco Terminal`
   - **IP Address**: `127.0.0.1` (or `simulator` if running via Docker Compose)
   - **Port**: `4370`
   - **Location**: `Main Lobby Simulator`
4. Click **Save**.

### Step 3: Test Device Connection
1. In the device list, click the **Test Connection** button on your new virtual device.
2. The BITS backend will execute `testDeviceConnection()`:
   - Initiates TCP handshake (`CMD_CONNECT`)
   - Queries free sizes (`CMD_GET_FREE_SIZES`)
   - Queries enrolled users (`CMD_DATA_WRRQ` 0x09)
3. You will receive a success banner:
   ```
   ✓ Device is online and responding (Users: 5, Serial: CJ7X202660399)
   ```
4. The device status pill will switch from Offline to **Online (Active)**.

---

## 5. Employee Alignment & Synchronization

To enable punches to record correctly into attendance records, BITS employees must have `zkId`s matching the simulator's users.

### Step 1: Assign zkIds to Employees
Run the assignment CLI from `backend/`:
```bash
cd backend
npm run assign-zkids
```
This script assigns sequential `zkId`s (starting at 2, preserving 1 for device admin) to all active employees.

### Step 2: Push Employees from BITS to Simulator
Push active employees from your database to the simulator:
```bash
npm run sync-employees
```
You will see output confirming:
```text
📤 EMPLOYEE SYNC TO ZKTECO DEVICE
📋 Found employees to sync...
🔄 Starting sync process...
✅ SYNC SUCCESSFUL!
📊 12 employees pushed to device.
```

If you open the simulator Web UI at [http://localhost:3030](http://localhost:3030) or query `GET http://localhost:3030/api/users`, your BITS employees will now appear on the device!

---

## 6. Triggering Punches & Verifying Attendance

### Method 1: Via the Simulator Device-Face UI
1. Go to [http://localhost:3030](http://localhost:3030).
2. Select an employee from the dropdown list (e.g., `1001` or any synced BITS employee ID).
3. Click the **SCAN / PUNCH** button.
4. The terminal LCD will display:
   ```
   VERIFIED
   THANK YOU
   ```

### Method 2: Via REST API (Automated / Scripted)
Send a `POST` request to the simulator's punch endpoint:
```bash
# Check-in (state = 0)
curl -X POST http://localhost:3030/api/punch \
  -H "Content-Type: application/json" \
  -d '{"userId": "1001", "state": 0}'

# Check-out (state = 1)
curl -X POST http://localhost:3030/api/punch \
  -H "Content-Type: application/json" \
  -d '{"userId": "1001", "state": 1}'
```

### Method 3: Via CLI Script
From inside the `simulator/` directory:
```bash
node scripts/punch.mjs 1001
```

---

## 7. Verifying Attendance in BITS

1. **Automatic Sync**: By default, BITS's `SyncScheduler` polls the device every 30 seconds.
2. **Immediate Sync (Reconciliation)**:
   - In BITS Admin $\rightarrow$ **Devices**, click **Reconcile Attendance** (or trigger `POST /api/devices/:id/reconcile`).
   - The backend pulls the latest attendance logs from the simulator.
3. **Verify in Attendance Dashboard**:
   - Go to **Admin** $\rightarrow$ **Attendance** (`/admin/attendance`).
   - Observe the new check-in or check-out record linked to the employee.
   - Confirm late minutes, undertime, and anomaly detection calculations executed according to the employee's assigned shift.

---

## 8. Common Troubleshooting Scenarios

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **`EADDRINUSE: 3000` on Simulator** | Next.js frontend is already bound to port 3000 | Set `ZK_HTTP_PORT=3030` in simulator `.env` |
| **Connection Test Fails (Connection Refused)** | Simulator is not running or wrong IP | Verify `npm run dev` is active in `simulator/`; check IP (`127.0.0.1` locally, `simulator` in Docker) |
| **Punches logged on Simulator but skipped in BITS** | Employee with that `zkId` does not exist in DB | Run `npm run assign-zkids` and verify `Employee.zkId` matches the punched `userId` |
| **"Device is busy" warning in BITS logs** | Prior sync or enrollment task holds the mutex lock | Use **Force Unlock** in BITS Admin UI or call `POST /api/devices/unlock` |
| **Submodule directory empty** | Submodule not initialized after clone | Run `git submodule update --init --recursive` |
