# Windows qemu-ga fixture (`guest-get-devices`)

Live-cluster Windows Server VM used by CNV-87826 / VEP-385 follow-on work
(Domainstats GuestDeviceMetrics and VMStatsCollector).

## Goal

A Running VMI in `virt-test` whose QEMU guest agent supports `guest-get-devices`
and returns VirtIO driver fields.

## Prerequisites (this CRC cluster)

- `oc` admin against the MicroShift/CRC cluster (`oc whoami`, `oc get nodes`)
- CDI Deployed (already present via HCO)
- Windows Server 2025 evaluation ISO on the CRC node (found at
  `/var/home/shanemcd/Downloads/26100.32230.260111-0550.lt_release_svc_refresh_SERVER_EVAL_x64FRE_en-us.iso`)
- VirtIO drivers container disk: `quay.io/shanemcd/virtio-container-disk:dev`
- Host free space under `/var/home/shanemcd` (TopoLVM VG free space is too small
  for a 40Gi Windows disk + ISO; this fixture uses static hostPath PVs)

## Apply

```bash
# Stage disks on the node (once). Prefer a noprompt ISO so UEFI does not sit
# on "Press any key to boot from CD" (same-size binary replace of efisys.bin
# with efisys_noprompt.bin inside a copy of the eval ISO).
oc debug node/api.crc.testing -- chroot /host bash -c '
  set -e
  SRC=/var/home/shanemcd/Downloads/26100.32230.260111-0550.lt_release_svc_refresh_SERVER_EVAL_x64FRE_en-us.iso
  mkdir -p /var/home/shanemcd/virt-test-disks/{win-iso,win2025-root} /tmp/winiso
  mount -o loop,ro "$SRC" /tmp/winiso
  cp /tmp/winiso/efi/microsoft/boot/efisys.bin /tmp/efisys.bin
  cp /tmp/winiso/efi/microsoft/boot/efisys_noprompt.bin /tmp/efisys_noprompt.bin
  umount /tmp/winiso
  python3 - <<PY
import pathlib, shutil
src=pathlib.Path("'"$SRC"'")
out=pathlib.Path("/var/home/shanemcd/virt-test-disks/win2025-noprompt.iso")
shutil.copy2(src, out)
old=pathlib.Path("/tmp/efisys.bin").read_bytes()
new=pathlib.Path("/tmp/efisys_noprompt.bin").read_bytes()
assert len(old)==len(new)
data=out.read_bytes().replace(old, new)
out.write_bytes(data)
PY
  ln -f /var/home/shanemcd/virt-test-disks/win2025-noprompt.iso \
    /var/home/shanemcd/virt-test-disks/win-iso/disk.img
  truncate -s 40G /var/home/shanemcd/virt-test-disks/win2025-root/disk.img
  chown -R 107:107 /var/home/shanemcd/virt-test-disks/win2025-root
'
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
