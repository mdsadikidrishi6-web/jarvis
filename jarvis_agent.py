#!/usr/bin/env python3
"""
JARVIS laptop agent (Windows / macOS / Linux)

Ye script tumhare laptop par chalti rehti hai aur JARVIS app se aaye hue
SIRF kuch tay kiye hue commands karti hai:
    lock, sleep, shutdown, restart, cancel

Kaise kaam karta hai:
  1. Ye script ntfy.sh (free pub-sub service) ke ek secret topic ko sunti rehti hai.
     Tumhare laptop par koi port khula nahi hota.
  2. JARVIS ka Cloudflare Worker PIN check karke ek SIGNED message us topic par bhejta hai.
  3. Ye script signature, samay aur nonce check karti hai. Galat ya purana message ignore hota hai.

Sirf standard Python chahiye (3.8+). Koi pip install nahi.

Istemal:
    python jarvis_agent.py --init        (pehli baar: secret values banata hai)
    python jarvis_agent.py --dry-run     (test: commands sirf dikhata hai, karta nahi)
    python jarvis_agent.py               (asli mode)
"""
import argparse
import hashlib
import hmac
import json
import os
import platform
import secrets
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from collections import deque

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_config.json")
ALLOWED = ("lock", "sleep", "shutdown", "restart", "cancel")  # isse bahar kuch nahi chalega
MAX_AGE_SECONDS = 60          # isse purana message reject
POWER_DELAY_SECONDS = 30      # shutdown/restart se pehle itna wait (cancel karne ke liye)

_pending = {"event": None, "thread": None, "label": ""}
_lock = threading.Lock()


def log(msg):
    print("[" + time.strftime("%H:%M:%S") + "] " + msg, flush=True)


def is_chromeos():
    # Chromebook ka Linux dibba (Crostini): yahan se poora laptop control nahi hota
    return os.path.exists("/dev/.cros_milestone") or "cros" in platform.release().lower()


# ---------------------------------------------------------------- config
def load_config():
    topic = os.environ.get("JARVIS_TOPIC", "")
    secret = os.environ.get("JARVIS_SECRET", "")
    if (not topic or not secret) and os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        topic = topic or data.get("topic", "")
        secret = secret or data.get("secret", "")
    return topic, secret


def do_init():
    topic = "jarvis-" + secrets.token_urlsafe(24)
    secret = secrets.token_hex(32)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump({"topic": topic, "secret": secret}, f)
    try:
        os.chmod(CONFIG_PATH, 0o600)
    except OSError:
        pass
    print("\nConfig save ho gayi:", CONFIG_PATH)
    print("\nAb Cloudflare Worker ke Variables and Secrets mein ye daalo:")
    print("  Text   control_topic  =", topic)
    print("  Secret control_secret =", secret)
    print("  Secret control_pin    = (apna khud ka lamba PIN, kam se kam 8 akshar)")
    print("\nIn values ko kisi ko mat dikhana. Phir 'python jarvis_agent.py --dry-run' se test karo.\n")


# ---------------------------------------------------------------- security
def sign(secret, action, ts, nonce):
    text = "%s|%s|%s" % (action, ts, nonce)
    return hmac.new(secret.encode("utf-8"), text.encode("utf-8"), hashlib.sha256).hexdigest()


def verify(raw, secret, seen, now=None):
    """Message sahi ho to action (str) return karta hai, warna (None, karan)."""
    now = time.time() if now is None else now
    try:
        msg = json.loads(raw)
    except (ValueError, TypeError):
        return None, "JSON nahi hai"
    if not isinstance(msg, dict):
        return None, "galat format"
    action, ts, nonce, sig = msg.get("a"), msg.get("t"), msg.get("n"), msg.get("s")
    if not (isinstance(action, str) and isinstance(ts, int) and isinstance(nonce, str) and isinstance(sig, str)):
        return None, "fields galat"
    if action not in ALLOWED:
        return None, "action allowed nahi: " + action[:20]
    if not (8 <= len(nonce) <= 64):
        return None, "nonce galat"
    if abs(now - ts) > MAX_AGE_SECONDS:
        return None, "message bahut purana ya aage ka hai"
    expected = sign(secret, action, ts, nonce)
    if not hmac.compare_digest(expected, sig):
        return None, "signature galat"
    if nonce in seen:
        return None, "ye message pehle aa chuka hai (replay)"
    seen.add(nonce)
    return action, "ok"


# ---------------------------------------------------------------- actions
def commands_for(action, system):
    if system == "Windows":
        return {
            "lock": [["rundll32.exe", "user32.dll,LockWorkStation"]],
            "sleep": [["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"]],
            "shutdown": [["shutdown", "/s", "/t", "0"]],
            "restart": [["shutdown", "/r", "/t", "0"]],
        }.get(action)
    if system == "Darwin":
        return {
            "lock": [["pmset", "displaysleepnow"]],
            "sleep": [["pmset", "sleepnow"]],
            "shutdown": [["osascript", "-e", 'tell application "System Events" to shut down']],
            "restart": [["osascript", "-e", 'tell application "System Events" to restart']],
        }.get(action)
    if system == "Linux":
        return {
            "lock": [["loginctl", "lock-session"], ["xdg-screensaver", "lock"]],
            "sleep": [["systemctl", "suspend"]],
            "shutdown": [["systemctl", "poweroff"]],
            "restart": [["systemctl", "reboot"]],
        }.get(action)
    return None


def run_action(action, dry_run):
    system = platform.system()
    options = commands_for(action, system)
    if not options:
        log("Is system (%s) par '%s' support nahi hai." % (system, action))
        return
    if dry_run:
        log("[DRY-RUN] chalta: " + " ".join(options[0]))
        return
    for cmd in options:
        try:
            result = subprocess.run(cmd, timeout=20, check=False)
            if result.returncode == 0:
                log("'%s' ho gaya." % action)
                return
        except FileNotFoundError:
            continue
        except subprocess.TimeoutExpired:
            log("'%s' mein der lag gayi." % action)
            return
    log("'%s' nahi chal paya (command nahi mila ya permission nahi)." % action)


def schedule_power(action, dry_run):
    """Shutdown/restart: 30 second ka wait, beech mein 'cancel' aaye to ruk jata hai."""
    with _lock:
        if _pending["event"] is not None:
            _pending["event"].set()
        event = threading.Event()
        _pending["event"] = event
        _pending["label"] = action

    def worker():
        log("'%s' %d second mein hoga. Rokne ke liye JARVIS se 'laptop cancel' bolo." % (action, POWER_DELAY_SECONDS))
        if event.wait(POWER_DELAY_SECONDS):
            log("'%s' cancel ho gaya." % action)
            return
        with _lock:
            if _pending["event"] is event:
                _pending["event"] = None
        run_action(action, dry_run)

    t = threading.Thread(target=worker, daemon=True)
    _pending["thread"] = t
    t.start()


def handle_action(action, dry_run):
    if is_chromeos() and not dry_run:
        log("Ye ChromeOS (Chromebook) ka Linux dibba hai. Yahan se laptop lock/shutdown nahi hota, isliye '%s' nahi kiya." % action)
        return
    if action == "cancel":
        with _lock:
            ev = _pending["event"]
            _pending["event"] = None
        if ev is not None:
            ev.set()
        else:
            log("Cancel karne ke liye koi pending shutdown/restart nahi hai.")
        return
    if action in ("shutdown", "restart"):
        schedule_power(action, dry_run)
        return
    run_action(action, dry_run)


# ---------------------------------------------------------------- listener
def listen(server, topic, secret, dry_run):
    seen = set()
    order = deque(maxlen=500)
    url = "%s/%s/json" % (server.rstrip("/"), urllib.parse.quote(topic, safe=""))
    backoff = 2
    while True:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "jarvis-agent/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                backoff = 2
                log("Connected. Commands ka intezaar hai... (band karne ke liye Ctrl+C)")
                for raw in resp:
                    line = raw.decode("utf-8", "ignore").strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                    except ValueError:
                        continue
                    if event.get("event") != "message":
                        continue
                    action, why = verify(event.get("message", ""), secret, seen)
                    if action is None:
                        log("Message ignore kiya: " + why)
                        continue
                    # seen set ko bada hone se rokte hain
                    msg = json.loads(event["message"])
                    order.append(msg["n"])
                    if len(order) == order.maxlen:
                        seen.intersection_update(order)
                    log("Command mila: " + action)
                    handle_action(action, dry_run)
        except KeyboardInterrupt:
            raise
        except Exception as exc:  # network toota, dobara jodte hain
            log("Connection toota (%s). %d second baad dobara..." % (exc.__class__.__name__, backoff))
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)


def selftest():
    topic, secret = load_config()
    if not secret:
        print("Pehle 'python jarvis_agent.py --init' chalao.")
        return 1
    seen = set()
    now = int(time.time())
    good = json.dumps({"a": "lock", "t": now, "n": "abcdef123456", "s": sign(secret, "lock", now, "abcdef123456")})
    tests = [
        ("sahi message", good, "lock"),
        ("replay (wahi dobara)", good, None),
        ("galat signature", json.dumps({"a": "lock", "t": now, "n": "zzzzzzzz1111", "s": "00"}), None),
        ("allowed nahi action", json.dumps({"a": "format", "t": now, "n": "qqqqqqqq2222", "s": sign(secret, "format", now, "qqqqqqqq2222")}), None),
        ("purana message", json.dumps({"a": "lock", "t": now - 500, "n": "wwwwwwww3333", "s": sign(secret, "lock", now - 500, "wwwwwwww3333")}), None),
    ]
    ok = True
    for name, raw, expect in tests:
        got, why = verify(raw, secret, seen, now=now)
        passed = got == expect
        ok = ok and passed
        print(("PASS " if passed else "FAIL ") + name + " -> " + str(got) + " (" + why + ")")
    return 0 if ok else 1


def main():
    parser = argparse.ArgumentParser(description="JARVIS laptop agent")
    parser.add_argument("--init", action="store_true", help="topic aur secret banao")
    parser.add_argument("--dry-run", action="store_true", help="commands sirf dikhao, karo mat")
    parser.add_argument("--selftest", action="store_true", help="security checks chalao")
    parser.add_argument("--server", default=os.environ.get("JARVIS_NTFY_URL", "https://ntfy.sh"), help="ntfy server (default ntfy.sh)")
    args = parser.parse_args()

    if args.init:
        do_init()
        return 0
    if args.selftest:
        return selftest()

    topic, secret = load_config()
    if not topic or not secret:
        print("Pehle 'python jarvis_agent.py --init' chalao.")
        return 1
    if is_chromeos():
        log("DHYAN: ye Chromebook ka Linux dibba lagta hai. Yahan lock/shutdown asli laptop par kaam nahi karenge.")
    if args.dry_run:
        log("DRY-RUN mode: commands sirf dikhaye jayenge, chalaye nahi jayenge.")
    try:
        listen(args.server, topic, secret, args.dry_run)
    except KeyboardInterrupt:
        log("Band kiya.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
