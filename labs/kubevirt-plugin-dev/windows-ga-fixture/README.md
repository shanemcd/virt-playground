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
- A Windows Server 2025 evaluation ISO supplied as an **explicit path the agent
  can read** or an **allowed download URL** (see below). Escalate if neither is
  available — do not scrape mirrors or invent media.
- Enough free space on the CRC node’s local disk (`/var`, ~130Gi free on this
  cluster) for ~8Gi ISO + ~40Gi root disk. TopoLVM VG free space is too small;
  this lab uses static hostPath under `/var/lib/virt-test-disks`.

## Where the media lives now

| Artifact | Location |
|----------|----------|
| Windows ISO + root disk image | **Not on the CRC node right now.** Re-stage before the VMI can run. |
| Intended durable stage root | `/var/lib/virt-test-disks` on the CRC node (`rhel-root`). Directory exists empty for re-staging. |
| Cluster objects | Namespace `virt-test`: PVs/PVCs `win2025-iso` / `win2025-rootdisk`, VM `win2025`. hostPath paths in `00-storage.yaml` point at `/var/lib/virt-test-disks/...`. |
| VirtIO drivers ISO | ContainerDisk `quay.io/shanemcd/virtio-container-disk:dev` (pulled; no local file). |
| Historical proof | `proof/` in this directory (from the last successful `guest-get-devices` run). |

Supported places for Windows install media on this lab: **`/var/lib/virt-test-disks` on the CRC node**, or a **CDI PVC** populated with `virtctl image-upload`. Nothing else.

## Obtaining and uploading the Windows ISO

Resolve media in this order only:

1. **Card notes / env** — `WINDOWS_ISO` path readable from the sandbox, or an
   HTTPS URL the sandbox allow-list can fetch.
2. **Upload into the cluster with CDI** (preferred so a CRC refresh can restore
   without hostPath gymnastics):

```bash
# From a machine/sandbox that can read the ISO file:
virtctl image-upload pvc win2025-iso \
  --namespace=virt-test \
  --size=8Gi \
  --image-path=/path/to/windows-server-2025-eval.iso \
  --uploadproxy-url=https://cdi-uploadproxy.kubevirt-hyperconverged.svc \
  --insecure \
  --force-bind

# Blank root disk via CDI if storage allows, otherwise hostPath under
# /var/lib/virt-test-disks (see Apply).
```

   On this CRC MicroShift setup the `cdi-uploadproxy` Route may not be admitted;
   port-forward works:

```bash
oc -n kubevirt-hyperconverged port-forward svc/cdi-uploadproxy 8443:443
# then --uploadproxy-url=https://127.0.0.1:8443
```

3. **Escalate** — ask for a URL, a sandbox-readable path, or a pre-built Windows
   qcow/raw. Stop. Do not invent or scrape install media.

## Backup (keep the fixture across CRC refreshes)

While staged files or PVCs still exist, copy them **off** the CRC VM onto durable
storage (workstation outside the CRC VM, object storage, etc.):

```bash
# hostPath layout under /var/lib/virt-test-disks:
oc debug node/api.crc.testing --quiet -- \
  chroot /host tar -C /var/lib/virt-test-disks -cvf - win-iso win2025-root \
  > win2025-virt-test-disks.tar

# Or export a CDI PVC:
virtctl vmexport download win2025-iso-export \
  --pvc=win2025-iso -n virt-test -f win2025-iso.img
```

After `crc delete`, a node disk wipe, or any env refresh that drops
`/var/lib/virt-test-disks`, restore by:

1. Re-uploading the ISO with `virtctl image-upload` (CDI), **or**
2. Untarring into `/var/lib/virt-test-disks` and re-applying `00-storage.yaml`.

Keep a copy of the original eval ISO (or the tarball) outside CRC so this step
is always possible.

## Apply (hostPath on CRC local disk)

```bash
: "${WINDOWS_ISO:?set WINDOWS_ISO to a readable Windows Server eval ISO}"
STAGE_ROOT=/var/lib/virt-test-disks

# Put the ISO on the node first (CDI upload → copy out, oc cp, etc.), then:
oc debug node/api.crc.testing -- chroot /host bash -c "
  set -e
  mkdir -p '$STAGE_ROOT'/{win-iso,win2025-root} /tmp/winiso
  SRC='$WINDOWS_ISO'
  mount -o loop,ro \"\$SRC\" /tmp/winiso
  cp /tmp/winiso/efi/microsoft/boot/efisys.bin /tmp/efisys.bin
  cp /tmp/winiso/efi/microsoft/boot/efisys_noprompt.bin /tmp/efisys_noprompt.bin
  umount /tmp/winiso
  python3 - <<'PY'
import pathlib
src = pathlib.Path('$WINDOWS_ISO')
out = pathlib.Path('$STAGE_ROOT/win2025-noprompt.iso')
out.write_bytes(src.read_bytes().replace(
    pathlib.Path('/tmp/efisys.bin').read_bytes(),
    pathlib.Path('/tmp/efisys_noprompt.bin').read_bytes()))
PY
  ln -f '$STAGE_ROOT/win2025-noprompt.iso' '$STAGE_ROOT/win-iso/disk.img'
  truncate -s 40G '$STAGE_ROOT/win2025-root/disk.img'
  chown -R 107:107 '$STAGE_ROOT/win2025-root'
"

oc apply -f 00-storage.yaml
oc apply -f 01-sysprep-configmap.yaml
oc apply -f 02-vm.yaml
```

Unattended setup installs Windows Server 2025 Datacenter onto the SATA root
disk, then runs `virtio-win-guest-tools.exe /quiet /norestart` and starts
`QEMU-GA`. First boot can take 20–40 minutes on CRC.

## Proof (`guest-get-devices`)

```bash
NS=virt-test
VM=win2025
POD=$(oc get pod -n "$NS" -l vm.kubevirt.io/name="$VM" -o jsonpath='{.items[0].metadata.name}')

oc get vmi -n "$NS" "$VM" -o jsonpath='{range .status.conditions[*]}{.type}={.status}{"\n"}{end}'

oc exec -n "$NS" "$POD" -c compute -- \
  virsh qemu-agent-command "${NS}_${VM}" '{"execute":"guest-info"}'

oc exec -n "$NS" "$POD" -c compute -- \
  virsh qemu-agent-command "${NS}_${VM}" '{"execute":"guest-get-devices"}'
```

Expected: JSON `return` entries with `driver-name`, `driver-version`,
`driver-date`, and `id.device-id` / `id.vendor-id` (VirtIO vendor-id `6900`).
See committed `proof/` from the last successful run.

Or run `./capture-proof.sh`.

## Notes

- Root disk is SATA so unattended setup does not need VirtIO storage drivers
  mid-install. Guest tools still installs VirtIO devices + qemu-ga.
- Boot order: ISO first for a blank disk; after Setup starts writing, flip to
  rootdisk `bootOrder: 1` or reboots re-enter the ISO and show the
  “upgrade vs clean install” dialog.
- On this CRC cluster, `virt-operator` can drop the virt-handler
  `clientcertificates` mount and leave stale
  `/var/run/kubevirt-private/ghost-records/*` after forced VMI deletes. Scale
  virt-operator to 0, re-add the mount, clear ghost records, then recreate the
  VMI if it sticks in `Scheduled` with “ghost record … differing UID”.
- Do not change `shanemcd/kubevirt` in this fixture card.
- After install completes you can detach the Windows ISO CD to speed later boots.
