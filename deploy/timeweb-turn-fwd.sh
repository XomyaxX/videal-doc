#!/bin/bash
# DNAT TURN 3478 + relay UDP to office WG 10.8.0.2
# Does NOT touch 80/443, 51820, nginx, other vhosts.
set -euo pipefail
OFFICE=10.8.0.2
echo HOST=$(hostname)
echo '===== ports in use ====='
ss -luntp | grep -E ':3478|:80|:443|:51820' || true
echo '===== wg ====='
wg show | head -20
echo '===== existing NAT ====='
iptables -t nat -S PREROUTING 2>/dev/null || nft list ruleset 2>/dev/null | head
echo '===== ufw ====='
ufw status 2>/dev/null | head -20 || true
echo PRECHECK_OK
