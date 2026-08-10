# Windows qemu-ga fixture (`guest-get-devices`)

Live-cluster Windows Server VM used by CNV-87826 / VEP-385 follow-on work
(Domainstats GuestDeviceMetrics and VMStatsCollector).

## Goal

A Running VMI in `virt-test` whose QEMU guest agent supports `guest-get-devices`
and returns VirtIO driver fields.

## Prerequisites (this CRC cluster)

- `oc` admin against the MicroShift/CRC cluster (`oc whoami`, `oc get nodes`)
- CDI Deployed (already present via HCO)
- VirtIO drivers container disk: `quay.io/shanemcd/virtio-container-disk:dev`
- A Windows Server 2025 evaluation ISO available by **one** of the paths below
- Enough disk for a ~40Gi root disk (this cluster’s TopoLVM VG free space is too
  small; the lab uses static hostPath PVs under a writable node path)

## Windows ISO source (do not assume host Downloads)

CRC may mount the workstation home into the VM via virtiofs
(`crc config get enable-shared-dirs`, default true → often
`/var/home/$USER` on the node). **That share is optional and may be disabled.**
This fixture must not depend on it.

Resolve the ISO in order:

1. **Explicit path or URL from the operator / card notes**  
   e.g. `WINDOWS_ISO=/path/on/node/...iso` or an `https://…` download URL the
   sandbox is allowed to fetch. Prefer this.
2. **CDI upload from a path the agent can read** (sandbox mount, PVC, or a
   path passed in):  
   `virtctl image-upload pvc win2025-iso --size=8Gi --image-path="$WINDOWS_ISO"
   --uploadproxy-url=… --insecure --force-bind -n virt-test`  
   Then point the VM at that PVC (and use a normal StorageClass/blank DV for
   the root disk if hostPath is not wanted).
3. **Opportunistic CRC shared-home discovery only as a last resort**  
   If `oc debug node/… -- chroot /host` can see a known eval ISO under the
   shared home, you may stage it onto a hostPath PV for this lab. Document the
   path you used. Do not treat this as the supported default.
4. **Escalate** if none of the above yields an ISO path/URL. Stop and ask for
   either a downloadable URL, a path reachable from the agent/node, or a
   pre-built Windows disk image. Do not scrape random mirrors or guess license
   media.

## Apply (hostPath staging when an on-node ISO path is already known)

```bash
# WINDOWS_ISO must already be a readable path *on the node* (not "look in Downloads").
# Prefer a noprompt ISO so UEFI does not sit on "Press any key to boot from CD"
# (same-size binary replace of efisys.bin with efisys_noprompt.bin).
: "${WINDOWS_ISO:?set WINDOWS_ISO to an on-node Windows Server eval ISO path}"
STAGE_ROOT="${STAGE_ROOT:-/var/mnt/virt-test-disks}"   # pick a writable node path

oc debug node/api.crc.testing -- chroot /host bash -c "
  set -e
  SRC='$WINDOWS_ISO'
  STAGE_ROOT='$STAGE_ROOT'
  mkdir -p \"\$STAGE_ROOT\"/{win-iso,win2025-root} /tmp/winiso
  mount -o loop,ro \"\$SRC\" /tmp/winiso
  cp /tmp/winiso/efi/microsoft/boot/efisys.bin /tmp/efisys.bin
  cp /tmp/winiso/efi/microsoft/boot/efisys_noprompt.bin /tmp/efisys_noprompt.bin
  umount /tmp/winiso
  python3 - <<PY
import pathlib, shutil
src=pathlib.Path(\"\$SRC\")
out=pathlib.Path(\"\$STAGE_ROOT/win2025-noprompt.iso\")
shutil.copy2(src, out)
old=pathlib.Path('/tmp/efisys.bin').read_bytes()
new=pathlib.Path('/tmp/efisys_noprompt.bin').read_bytes()
assert len(old)==len(new)
out.write_bytes(out.read_bytes().replace(old, new))
PY
  ln -f \"\$STAGE_ROOT/win2025-noprompt.iso\" \"\$STAGE_ROOT/win-iso/disk.img\"
  truncate -s 40G \"\$STAGE_ROOT/win2025-root/disk.img\"
  chown -R 107:107 \"\$STAGE_ROOT/win2025-root\"
"

# Edit 00-storage.yaml hostPath paths to match STAGE_ROOT, then:
oc apply -f 00-storage.yaml
oc apply -f 01-sysprep-configmap.yaml
oc apply -f 02-vm.yaml
```

Unattended setup installs Windows Server 2025 Datacenter Evaluation onto the
SATA root disk, then runs `virtio-win-guest-tools.exe /quiet /norestart` and
starts `QEMU-GA`. First boot can take 20–40 minutes on CRC.

## Proof (`guest-get-devices`)

```bash
NS=virt-test
VM=win2025
POD=$(oc get pod -n "$NS" -l vm.kubevirt.io/name="$VM" -o jsonpath='{.items[0].metadata.name}')

# Guest agent connected
oc get vmi -n "$NS" "$VM" -o jsonpath='{range .status.conditions[*]}{.type}={.status}{"\n"}{end}'

# guest-info should list guest-get-devices enabled
oc exec -n "$NS" "$POD" -c compute -- \
  virsh qemu-agent-command "${NS}_${VM}" '{"execute":"guest-info"}'

# Driver inventory
oc exec -n "$NS" "$POD" -c compute -- \
  virsh qemu-agent-command "${NS}_${VM}" '{"execute":"guest-get-devices"}'
```

Expected: JSON `return` array entries with `driver-name`, `driver-version`,
`driver-date`, and `id.device-id` / `id.vendor-id` (VirtIO vendor-id `6900`).

## Notes

- Root disk is SATA so unattended setup does not need VirtIO storage drivers
  mid-install. Guest tools still installs VirtIO NICs/balloon/serial/etc.
- Boot order: ISO first for a blank disk; after Windows Setup starts writing,
  flip to rootdisk `bootOrder: 1` or reboots re-enter the ISO and show the
  “upgrade vs clean install” dialog.
- On this CRC cluster, `virt-operator` can drop the virt-handler
  `clientcertificates` mount and leave stale
  `/var/run/kubevirt-private/ghost-records/*` after forced VMI deletes. Scale
  virt-operator to 0, re-add the mount, clear ghost records, then recreate the
  VMI if it sticks in `Scheduled` with “ghost record … differing UID”.
- Do not change `shanemcd/kubevirt` in this fixture card.
- After install completes you can detach the Windows ISO CD to speed later boots
  (`virtctl removevolume` / edit the VM).
