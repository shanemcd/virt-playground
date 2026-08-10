#!/usr/bin/env bash
# Capture DoD proof for the Windows guest-get-devices fixture.
set -euo pipefail

NS="${NS:-virt-test}"
VM="${VM:-win2025}"
OUT="${OUT:-./proof}"

mkdir -p "$OUT"

echo "== oc whoami / nodes =="
oc whoami | tee "$OUT/whoami.txt"
oc get nodes -o wide | tee "$OUT/nodes.txt"

echo "== VM / VMI =="
oc get vm,vmi,pvc,pod -n "$NS" -o wide | tee "$OUT/resources.txt"
oc get vmi -n "$NS" "$VM" -o yaml | tee "$OUT/vmi.yaml"

echo "== AgentConnected =="
oc get vmi -n "$NS" "$VM" -o jsonpath='{range .status.conditions[*]}{.type}={.status} reason={.reason} msg={.message}{"\n"}{end}' \
  | tee "$OUT/vmi-conditions.txt"

POD=$(oc get pod -n "$NS" -l "vm.kubevirt.io/name=${VM}" -o jsonpath='{.items[0].metadata.name}')
echo "POD=$POD" | tee "$OUT/pod.txt"

echo "== virt-launcher logs (ga) =="
oc logs -n "$NS" "$POD" -c compute --tail=200 | tee "$OUT/virt-launcher-compute.log" || true
grep -iE 'guest.agent|qemu-ga|AgentConnected|guest-agent' "$OUT/virt-launcher-compute.log" \
  | tee "$OUT/ga-log-snippets.txt" || true

DOMAIN="${NS}_${VM}"
echo "== guest-info =="
oc exec -n "$NS" "$POD" -c compute -- \
  virsh qemu-agent-command "$DOMAIN" '{"execute":"guest-info"}' \
  | tee "$OUT/guest-info.json"

echo "== guest-get-devices =="
oc exec -n "$NS" "$POD" -c compute -- \
  virsh qemu-agent-command "$DOMAIN" '{"execute":"guest-get-devices"}' \
  | tee "$OUT/guest-get-devices.json"

echo "Proof written under $OUT"
