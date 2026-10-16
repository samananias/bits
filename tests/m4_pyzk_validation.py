"""
Milestone 4: Independent-Client Validation using pyzk (0.9)
Validates that our virtual ZKTeco attendance terminal interoperates with an
independent open-source client implementation without proprietary dependencies.

Covers:
  1. Connection handshake (CMD_CONNECT / CMD_ACK_OK)
  2. Device Information (CMD_OPTIONS_RRQ, CMD_GET_VERSION)
  3. Memory & Sizing (CMD_GET_FREE_SIZES)
  4. Time query & update (CMD_GET_TIME, CMD_SET_TIME)
  5. User listing (CMD_DATA_WRRQ with fct=9)
  6. User creation (CMD_USER_WRQ)
  7. User deletion (CMD_DELETE_USER)
  8. Attendance listing (CMD_DATA_WRRQ with fct=13)
  9. Session termination (CMD_EXIT)
"""

import sys
import os
import time
import subprocess
import datetime
from zk import ZK

TEST_PORT = 24370
TEST_HTTP_PORT = 23030

def start_simulator():
    print(f"[*] Starting simulator on TCP port {TEST_PORT}, HTTP {TEST_HTTP_PORT}...")
    env = os.environ.copy()
    env["ZK_TCP_PORT"] = str(TEST_PORT)
    env["ZK_HTTP_PORT"] = str(TEST_HTTP_PORT)
    env["PORT"] = str(TEST_PORT)
    env["HTTP_PORT"] = str(TEST_HTTP_PORT)
    env["NODE_ENV"] = "test"
    env["ENABLE_DEVICE_SIMULATOR"] = "true"
    
    # Run node simulator/dist/index.js
    proc = subprocess.Popen(
        ["node", "simulator/dist/index.js"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
    )
    # Wait for startup
    time.sleep(2.5)
    if proc.poll() is not None:
        out, err = proc.communicate()
        print(f"[-] Simulator failed to start. Stdout: {out.decode('utf-8', errors='ignore')}")
        print(f"[-] Stderr: {err.decode('utf-8', errors='ignore')}")
        sys.exit(1)
    print("[+] Simulator process running (PID: {})".format(proc.pid))
    return proc

def run_tests():
    proc = start_simulator()
    results = []

    def record(step_id, feature, status, details):
        results.append({
            "id": step_id,
            "feature": feature,
            "status": status,
            "details": details
        })
        icon = "[PASS]" if status == "PASS" else "[FAIL]"
        print(f"  {icon} {step_id}: {feature} -> {details}")

    zk = ZK(
        "127.0.0.1",
        port=TEST_PORT,
        timeout=10,
        ommit_ping=True,
        verbose=False
    )

    try:
        # 1. Connect
        try:
            conn = zk.connect()
            record("M4-01", "Connect Handshake", "PASS", f"Connected, session_id={zk._ZK__session_id}")
        except Exception as e:
            record("M4-01", "Connect Handshake", "FAIL", str(e))
            return results

        # 2. Device info: Serial Number
        try:
            sn = zk.get_serialnumber()
            record("M4-02", "Get Serial Number (~SerialNumber)", "PASS", f"SN='{sn}'")
        except Exception as e:
            record("M4-02", "Get Serial Number (~SerialNumber)", "FAIL", str(e))

        # 3. Device info: Platform
        try:
            platform = zk.get_platform()
            record("M4-03", "Get Platform (~Platform)", "PASS", f"Platform='{platform}'")
        except Exception as e:
            record("M4-03", "Get Platform (~Platform)", "FAIL", str(e))

        # 4. Device info: Device Name
        try:
            dev_name = zk.get_device_name()
            record("M4-04", "Get Device Name (~DeviceName)", "PASS", f"Name='{dev_name}'")
        except Exception as e:
            record("M4-04", "Get Device Name (~DeviceName)", "FAIL", str(e))

        # 5. Device info: Firmware Version
        try:
            fw = zk.get_firmware_version()
            record("M4-05", "Get Firmware Version (CMD_GET_VERSION)", "PASS", f"Firmware='{fw}'")
        except Exception as e:
            record("M4-05", "Get Firmware Version (CMD_GET_VERSION)", "FAIL", str(e))

        # 6. Device info: Fingerprint Algorithm Version
        try:
            fp_ver = zk.get_fp_version()
            record("M4-06", "Get FP Version (~ZKFPVersion)", "PASS", f"FP Version={fp_ver}")
        except Exception as e:
            record("M4-06", "Get FP Version (~ZKFPVersion)", "FAIL", str(e))

        # 7. Memory / Capacity Sizing
        try:
            zk.read_sizes()
            record("M4-07", "Read Sizes (CMD_GET_FREE_SIZES)", "PASS",
                   f"Users={zk.users}, Cap={zk.users_cap}, Logs={zk.records}, LogCap={zk.rec_cap}")
        except Exception as e:
            record("M4-07", "Read Sizes (CMD_GET_FREE_SIZES)", "FAIL", str(e))

        # 8. Time Query
        try:
            dev_time = zk.get_time()
            record("M4-08", "Get Device Time (CMD_GET_TIME)", "PASS", f"Time={dev_time}")
        except Exception as e:
            record("M4-08", "Get Device Time (CMD_GET_TIME)", "FAIL", str(e))

        # 9. Time Set
        try:
            target_time = datetime.datetime(2026, 10, 16, 14, 30, 0)
            zk.set_time(target_time)
            read_back = zk.get_time()
            diff_sec = abs((read_back - target_time).total_seconds())
            if diff_sec <= 2:
                record("M4-09", "Set Device Time (CMD_SET_TIME)", "PASS", f"Set={target_time}, Read={read_back}")
            else:
                record("M4-09", "Set Device Time (CMD_SET_TIME)", "FAIL", f"Set={target_time}, Read={read_back}, diff={diff_sec}s")
        except Exception as e:
            record("M4-09", "Set Device Time (CMD_SET_TIME)", "FAIL", str(e))

        # 10. List Users
        try:
            users = zk.get_users()
            record("M4-10", "List Users (CMD_DATA_WRRQ users)", "PASS", f"Found {len(users)} users")
        except Exception as e:
            record("M4-10", "List Users (CMD_DATA_WRRQ users)", "FAIL", str(e))

        # 11. Write User
        test_uid = 998
        test_user_id = "998"
        try:
            zk.set_user(uid=test_uid, name="Pyzk Test User", privilege=0, password="", group_id="1", user_id=test_user_id, card=0)
            users_after = zk.get_users()
            found = any(u.user_id == test_user_id or u.uid == test_uid for u in users_after)
            if found:
                record("M4-11", "Write User (CMD_USER_WRQ)", "PASS", f"Created user {test_user_id} successfully")
            else:
                record("M4-11", "Write User (CMD_USER_WRQ)", "FAIL", f"User {test_user_id} not in user list")
        except Exception as e:
            record("M4-11", "Write User (CMD_USER_WRQ)", "FAIL", str(e))

        # 12. Delete User
        try:
            zk.delete_user(uid=test_uid, user_id=test_user_id)
            users_del = zk.get_users()
            still_exists = any(u.user_id == test_user_id or u.uid == test_uid for u in users_del)
            if not still_exists:
                record("M4-12", "Delete User (CMD_DELETE_USER)", "PASS", f"Deleted user {test_user_id} successfully")
            else:
                record("M4-12", "Delete User (CMD_DELETE_USER)", "FAIL", f"User {test_user_id} still exists after deletion")
        except Exception as e:
            record("M4-12", "Delete User (CMD_DELETE_USER)", "FAIL", str(e))

        # 13. List Attendance Records
        try:
            attendances = zk.get_attendance()
            record("M4-13", "List Attendance (CMD_DATA_WRRQ attlog)", "PASS", f"Read {len(attendances)} records")
        except Exception as e:
            record("M4-13", "List Attendance (CMD_DATA_WRRQ attlog)", "FAIL", str(e))

        # 14. Disconnect
        try:
            zk.disconnect()
            record("M4-14", "Disconnect (CMD_EXIT)", "PASS", "Disconnected cleanly")
        except Exception as e:
            record("M4-14", "Disconnect (CMD_EXIT)", "FAIL", str(e))

    finally:
        print("[*] Terminating simulator process...")
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("[+] Simulator process terminated.")

    return results

if __name__ == "__main__":
    print("=" * 70)
    print("Milestone 4: Independent-Client Validation (pyzk 0.9 on Python 3.14)")
    print("=" * 70)
    test_results = run_tests()
    passed = sum(1 for r in test_results if r["status"] == "PASS")
    total = len(test_results)
    print("\n" + "=" * 70)
    print(f"Results Summary: {passed}/{total} Passed")
    print("=" * 70)
    if passed < total:
        sys.exit(1)
