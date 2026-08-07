# 04 - Deploy and Test

Deploy the VirtIO driver check plugin to CRC and verify it fires when a Windows VM starts.

## Deploy the plugin

### RBAC and DaemonSet

The plugin needs permissions to list pods, exec into virt-launcher containers, and read/patch VMIs:

```bash
oc apply -f ~/github/kubevirt/virtio-driver-check-plugin/deploy/daemonset.yaml
```

This creates:
- A ServiceAccount (`virt-driver-check`)
- A ClusterRole with pods/get/list, pods/exec/create, and VMI get/list/patch
- A ClusterRoleBinding
- A DaemonSet mounting `/var/run/kubevirt/plugins` as a hostPath

On OpenShift, grant the privileged SCC (needed for hostPath volume):

```bash
oc adm policy add-scc-to-user privileged -z virt-driver-check -n openshift-cnv
```

Verify the pod is running:

```bash
oc get pods -n openshift-cnv -l app=virt-driver-check
```

### Plugin CR

Register the plugin with KubeVirt:

```bash
oc apply -f ~/github/kubevirt/virtio-driver-check-plugin/deploy/plugin.yaml
```

```yaml
apiVersion: plugin.kubevirt.io/v1alpha1
kind: Plugin
metadata:
  name: virt-driver-check
spec:
  failureStrategy: Ignore
  nodeHooks:
    - socket: /var/run/kubevirt/plugins/virt-driver-check.sock
      permittedHooks:
        - PostVMStart
      failureStrategy: Ignore
```

`failureStrategy: Ignore` means VM startup won't be blocked if the plugin is unreachable or errors.

Verify:

```bash
oc get plugins.plugin.kubevirt.io
```

## Install a Windows VM

### Upload the ISO

CDI must be installed first (see step 02). Upload the Windows Server ISO:

```bash
virtctl image-upload pvc win2025-iso \
  --size=8Gi \
  --image-path=/path/to/windows-server-2025.iso \
  --uploadproxy-url=https://cdi-uploadproxy-cdi.apps-crc.testing \
  --insecure \
  --force-bind \
  --namespace=default
```

`--force-bind` is needed because CRC's storage class uses `WaitForFirstConsumer` binding mode.

### Create and install

Create a blank disk PVC and the VM (see `/tmp/win2025-vm.yaml` for the full manifest). Key requirements:

- SMM enabled (`features.smm.enabled: true`) for SecureBoot
- Hyper-V enlightenments with `hyperv` clock timer
- VirtIO disk for OS, SATA CD-ROMs for Windows ISO and VirtIO drivers ISO
- The VirtIO drivers container disk (`quay.io/shanemcd/virtio-container-disk:dev`) provides the drivers ISO

During Windows install, load VirtIO storage drivers from the second CD-ROM (`amd64\w2k25` or `w2k22`) so Windows can see the VirtIO disk.

### Install guest tools

After Windows is installed, install the full VirtIO guest tools. The `virtio-win-gt-x64.msi` only installs drivers, not the guest agent. Use `virtio-win-guest-tools.exe` instead:

```
E:\virtio-win-guest-tools.exe /quiet /norestart
```

**VNC keyboard gotcha**: The OpenShift console VNC client maps backslash (`\`) to semicolon (`;`) and colon (`:`) to semicolon on some keyboard layouts. Use the "Paste to console" button to paste commands with these characters. The button pastes from the browser clipboard, so set the clipboard first via the browser console or just type the command in the clipboard dialog.

After installing, the QEMU guest agent starts automatically. Verify from outside:

```bash
POD=$(oc get pod -n default -l vm.kubevirt.io/name=win2025 -o jsonpath='{.items[0].metadata.name}')
oc exec -n default $POD -c compute -- virsh qemu-agent-command default_win2025 '{"execute":"guest-info"}'
```

You should see `guest-get-devices` listed as `enabled: true` in the supported commands.

## Test the plugin

Restart the VM to trigger a fresh PostVMStart hook:

```bash
virtctl restart win2025 -n default
```

Watch plugin logs:

```bash
oc logs -n openshift-cnv -l app=virt-driver-check -f
```

Expected output:

```
VirtIO Driver Check Plugin listening on /var/run/kubevirt/plugins/virt-driver-check.sock
ExecuteNodeHook called: hookPoint=PostVMStart, nodeName=crc
Checking VirtIO drivers for VM default/win2025
  VirtIO device: Red Hat VirtIO Ethernet Adapter version=100.100.104.26600 deviceID=0x1041
  VirtIO device: Red Hat VirtIO SCSI controller version=100.100.104.26600 deviceID=0x1042
  VirtIO device: Red Hat VirtIO SCSI pass-through controller version=100.100.104.26600 deviceID=0x1048
  VirtIO device: VirtIO Serial Driver version=100.100.104.26600 deviceID=0x1043
  VirtIO device: VirtIO Balloon Driver version=100.100.104.26600 deviceID=0x1045
Driver report for default/win2025:
[...]
Annotated VMI default/win2025 with driver versions
```

### Verify the annotation

```bash
oc get vmi win2025 -n default -o jsonpath='{.metadata.annotations.kubevirt\.io/virtio-driver-versions}' | python3 -m json.tool
```

```json
[
  {
    "driverName": "Red Hat VirtIO Ethernet Adapter",
    "driverVersion": "100.100.104.26600",
    "deviceId": 4161
  },
  {
    "driverName": "Red Hat VirtIO SCSI controller",
    "driverVersion": "100.100.104.26600",
    "deviceId": 4162
  }
]
```

The driver versions are now queryable via the Kubernetes API on the VMI object.

### Linux VMs

For Linux VMs, the plugin logs:

```
Skipping VM default/test-fedora-vm: guest-get-devices not available (Linux VMs don't support this command)
```

This is expected. `guest-get-devices` is a Windows-only QEMU guest agent command.

## Troubleshooting

**Plugin pod not running**: Check the SCC. On OpenShift, the service account needs the `privileged` SCC for hostPath volumes.

**Hook not firing**: Verify the Plugins feature gate:
```bash
oc get kubevirt -A -o jsonpath='{.items[0].spec.configuration.developerConfiguration.featureGates}'
```

**Guest agent not connected**: The `virtio-win-guest-tools.exe` installer starts the QEMU Guest Agent service automatically. If it's not running, check inside Windows: `sc query QEMU-GA`. The `virtio-win-gt-x64.msi` does NOT install the guest agent.

**30s delay not enough**: Windows VMs can take over a minute for the guest agent to initialize after boot. The plugin waits 30 seconds, but on slow systems the guest agent may not be ready yet. The plugin will log the error but the annotation won't be set until the next VM restart.

## What's next

- **Baseline comparison**: Query the `VIRTIOWIN_CONTAINER` env var on hco-operator for the expected version, compare against installed
- **Prometheus metrics**: Expose `kubevirt_vmi_virtio_driver_info` as a gauge with labels
- **CEL condition**: Only fire for Windows VMs: `condition: "vmi.status.guestOSInfo.id == 'mswindows'"`
- **Retry logic**: If the guest agent isn't ready after 30s, retry a few times
- **Propose upstream**: Discuss with Dan K about extending VEP-190 for periodic hooks, or adding `guest-get-devices` as a KubeVirt subresource
