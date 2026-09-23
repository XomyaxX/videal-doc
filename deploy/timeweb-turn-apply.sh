#!/bin/bash
# Timeweb VPS: DNAT TURN to office WireGuard 10.8.0.2
# Safe: does not touch 80/443/51820, nginx, docker, other vhosts.
set -euo pipefail
OFFICE=10.8.0.2

if ss -lunt | grep -q ':3478'; then
  echo '3478 already in use — abort'
  ss -luntp | grep 3478
  exit 1
fi

install -d /usr/local/sbin
cat >/usr/local/sbin/videal-turn-fwd.sh <<'EOS'
#!/bin/bash
OFFICE=10.8.0.2
sysctl -w net.ipv4.ip_forward=1 >/dev/null
del() { iptables "$@" 2>/dev/null || true; }
# drop previous copies
del -t nat -D PREROUTING -p udp --dport 3478 -j DNAT --to-destination ${OFFICE}:3478
del -t nat -D PREROUTING -p tcp --dport 3478 -j DNAT --to-destination ${OFFICE}:3478
del -t nat -D PREROUTING -p udp --dport 49152:49300 -j DNAT --to-destination ${OFFICE}
del -t nat -D POSTROUTING -p udp -d ${OFFICE} --dport 3478 -j MASQUERADE
del -t nat -D POSTROUTING -p tcp -d ${OFFICE} --dport 3478 -j MASQUERADE
del -t nat -D POSTROUTING -p udp -d ${OFFICE} --dport 49152:49300 -j MASQUERADE
del -D FORWARD -p udp -d ${OFFICE} --dport 3478 -j ACCEPT
del -D FORWARD -p tcp -d ${OFFICE} --dport 3478 -j ACCEPT
del -D FORWARD -p udp -d ${OFFICE} --dport 49152:49300 -j ACCEPT
del -D FORWARD -p udp -s ${OFFICE} --sport 3478 -j ACCEPT
del -D FORWARD -p tcp -s ${OFFICE} --sport 3478 -j ACCEPT
del -D FORWARD -p udp -s ${OFFICE} --sport 49152:49300 -j ACCEPT

iptables -t nat -I PREROUTING 1 -p udp --dport 3478 -j DNAT --to-destination ${OFFICE}:3478
iptables -t nat -I PREROUTING 1 -p tcp --dport 3478 -j DNAT --to-destination ${OFFICE}:3478
iptables -t nat -I PREROUTING 1 -p udp --dport 49152:49300 -j DNAT --to-destination ${OFFICE}
iptables -t nat -I POSTROUTING 1 -p udp -d ${OFFICE} --dport 3478 -j MASQUERADE
iptables -t nat -I POSTROUTING 1 -p tcp -d ${OFFICE} --dport 3478 -j MASQUERADE
iptables -t nat -I POSTROUTING 1 -p udp -d ${OFFICE} --dport 49152:49300 -j MASQUERADE
iptables -I FORWARD 1 -p udp -d ${OFFICE} --dport 3478 -j ACCEPT
iptables -I FORWARD 1 -p tcp -d ${OFFICE} --dport 3478 -j ACCEPT
iptables -I FORWARD 1 -p udp -d ${OFFICE} --dport 49152:49300 -j ACCEPT
iptables -I FORWARD 1 -p udp -s ${OFFICE} --sport 3478 -j ACCEPT
iptables -I FORWARD 1 -p tcp -s ${OFFICE} --sport 3478 -j ACCEPT
iptables -I FORWARD 1 -p udp -s ${OFFICE} --sport 49152:49300 -j ACCEPT
EOS
chmod +x /usr/local/sbin/videal-turn-fwd.sh

cat >/etc/sysctl.d/99-videal-turn.conf <<'EOF'
net.ipv4.ip_forward=1
EOF
sysctl -p /etc/sysctl.d/99-videal-turn.conf >/dev/null

ufw allow 3478/udp comment 'videal-doc TURN' || true
ufw allow 3478/tcp comment 'videal-doc TURN' || true
ufw allow 49152:49300/udp comment 'videal-doc TURN relay' || true

/usr/local/sbin/videal-turn-fwd.sh

cat >/etc/systemd/system/videal-turn-fwd.service <<'UNIT'
[Unit]
Description=DNAT TURN 3478 to office WireGuard
After=network-online.target wg-quick@wg0.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/videal-turn-fwd.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable videal-turn-fwd.service
systemctl restart videal-turn-fwd.service

echo '===== NAT 3478 ====='
iptables -t nat -S PREROUTING | grep 3478 || true
iptables -t nat -S PREROUTING | grep 49152 || true
echo '===== nginx still ====='
systemctl is-active nginx
ss -lnt | grep -E ':80|:443'
echo '===== wg ====='
wg show | head -8
echo '===== probe office turn ====='
timeout 2 bash -c 'echo ping >/dev/udp/10.8.0.2/3478' && echo UDP_TO_OFFICE_SENT || true
echo TURN_FWD_OK
