# Lab: Migrate a VM from ESXi to OpenShift Virtualization with MTV

Migrate a Fedora VM from a nested ESXi host to OpenShift Virtualization on CRC using the Migration Toolkit for Virtualization (MTV) with VDDK.

## Prerequisites

- CRC cluster with OpenShift Virtualization installed ([lab 01](../crc/01-install-openshift-virtualization.md))
- ESXi host with a VM to migrate ([lab 01](01-nested-esxi-setup.md))
- ESXi must have a paid license (Essentials or higher) for full API and vStorage access
- CRC node can reach ESXi over the network
- VDDK SDK downloaded from [developer.broadcom.com](https://developer.broadcom.com/sdks/vmware-virtual-disk-development-kit-vddk/latest)

## 1. Install MTV

```bash
oc apply -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: openshift-mtv
---
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: mtv-operator-group
  namespace: openshift-mtv
spec:
  targetNamespaces:
    - openshift-mtv
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: mtv-operator
  namespace: openshift-mtv
spec:
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  name: mtv-operator
  channel: release-v2.11
  installPlanApproval: Automatic
EOF
```

Wait for the CSV, then create the ForkliftController:

```bash
# Find and wait for the CSV
oc get csv -n openshift-mtv
oc wait csv -n openshift-mtv <csv-name> --for=jsonpath='{.status.phase}'=Succeeded --timeout=300s

# Deploy MTV components
oc apply -f - <<'EOF'
apiVersion: forklift.konveyor.io/v1beta1
kind: ForkliftController
metadata:
  name: forklift-controller
  namespace: openshift-mtv
spec: {}
EOF
```

Wait for all pods in `openshift-mtv` to be Running.

## 2. Build and push the VDDK image

MTV uses VMware's VDDK SDK for efficient disk transfers. Without it, migrations will fail or be extremely slow.

Extract the VDDK tarball, then build a container image:

```bash
cat > /tmp/Containerfile.vddk << 'EOF'
FROM registry.access.redhat.com/ubi8/ubi-minimal
USER 1001
COPY vmware-vix-disklib-distrib /vmware-vix-disklib-distrib
RUN mkdir -p /opt
ENTRYPOINT ["cp", "-r", "/vmware-vix-disklib-distrib", "/opt"]
EOF

cd /path/to/extracted/vddk && podman build -t vddk:latest -f /tmp/Containerfile.vddk .
```

Push to the CRC internal registry:

```bash
REGISTRY=$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}')

podman login -u kubeadmin -p $(oc whoami -t) $REGISTRY --tls-verify=false
podman tag vddk:latest $REGISTRY/openshift-mtv/vddk:latest
podman push $REGISTRY/openshift-mtv/vddk:latest --tls-verify=false
```

Grant pull access so migration pods in other namespaces can use the image:

```bash
oc policy add-role-to-user system:image-puller \
  system:serviceaccount:default:default -n openshift-mtv
```

## 3. Configure the ESXi source provider

Create a Secret with ESXi credentials and a Provider CR:

```bash
oc apply -f - <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: esxi-credentials
  namespace: openshift-mtv
  labels:
    createdForProviderType: vsphere
    createdForResourceType: providers
type: Opaque
stringData:
  user: root
  password: <esxi-password>
  insecureSkipVerify: "true"
  url: https://<esxi-ip>/sdk
---
apiVersion: forklift.konveyor.io/v1beta1
kind: Provider
metadata:
  name: esxi-source
  namespace: openshift-mtv
spec:
  type: vsphere
  url: https://<esxi-ip>/sdk
  settings:
    sdkEndpoint: esxi
    vddkInitImage: image-registry.openshift-image-registry.svc:5000/openshift-mtv/vddk:latest
  secret:
    name: esxi-credentials
    namespace: openshift-mtv
EOF
```

Verify the provider is ready:

```bash
oc get provider esxi-source -n openshift-mtv
```

Should show `Ready` with `ConnectionTestSucceeded` and `InventoryCreated`.

### Provider secret format

The secret must include `user`, `password`, `insecureSkipVerify`, and `url`. This is different from the older format that used `thumbprint`. Setting `insecureSkipVerify: "true"` skips TLS verification (fine for lab use).

### ESXi vs vCenter endpoint

Setting `sdkEndpoint: esxi` tells MTV this is a standalone ESXi host, not a vCenter. MTV will only see VMs on this specific host.

## 4. Create network and storage maps

Map the ESXi network and datastore to OpenShift equivalents:

```bash
# Get the datastore ID from the provider inventory
PROVIDER_UID=$(oc get provider esxi-source -n openshift-mtv -o jsonpath='{.metadata.uid}')
TOKEN=$(oc whoami -t)
curl -sk -H "Authorization: Bearer $TOKEN" \
  "https://forklift-inventory-openshift-mtv.apps-crc.testing/providers/vsphere/$PROVIDER_UID/vms" | jq '.[0].disks[0].datastore'
```

Then create the maps:

```bash
oc apply -f - <<'EOF'
apiVersion: forklift.konveyor.io/v1beta1
kind: NetworkMap
metadata:
  name: esxi-network-map
  namespace: openshift-mtv
spec:
  map:
    - source:
        id: HaNetwork-VM Network
        type: Network
      destination:
        type: pod
  provider:
    source:
      name: esxi-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
---
apiVersion: forklift.konveyor.io/v1beta1
kind: StorageMap
metadata:
  name: esxi-storage-map
  namespace: openshift-mtv
spec:
  map:
    - source:
        id: <datastore-id>
      destination:
        storageClass: crc-csi-hostpath-provisioner
  provider:
    source:
      name: esxi-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
EOF
```

## 5. Create a migration plan and execute

The source VM must be powered off for cold migration. MTV 2.11 treats missing VMware Tools as a critical condition and will block the plan if the VM is running without Tools installed.

```bash
# Power off the VM on ESXi
ssh root@<esxi-ip> "vim-cmd vmsvc/power.off <vmid>"
```

Create the plan and migration:

```bash
oc apply -f - <<'EOF'
apiVersion: forklift.konveyor.io/v1beta1
kind: Plan
metadata:
  name: migrate-fedora-test
  namespace: openshift-mtv
spec:
  preserveStaticIPs: false
  provider:
    source:
      name: esxi-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
  map:
    network:
      name: esxi-network-map
      namespace: openshift-mtv
    storage:
      name: esxi-storage-map
      namespace: openshift-mtv
  targetNamespace: default
  vms:
    - id: "<vm-id>"
      name: fedora-test
---
apiVersion: forklift.konveyor.io/v1beta1
kind: Migration
metadata:
  name: migrate-fedora-test
  namespace: openshift-mtv
spec:
  plan:
    name: migrate-fedora-test
    namespace: openshift-mtv
EOF
```

## 6. Monitor the migration

```bash
oc get plan migrate-fedora-test -n openshift-mtv -o json | \
  jq '.status.migration.vms[0] | {name, phase, pipeline: [.pipeline[] | {name, phase}]}'
```

The pipeline stages are:

1. **Initialize** - set up migration resources
2. **DiskAllocation** - allocate PVCs on the target
3. **ImageConversion** - `virt-v2v` converts the disk (installs VirtIO drivers, reconfigures the guest)
4. **DiskTransferV2v** - VDDK transfers disk data from ESXi
5. **VirtualMachineCreation** - creates the VirtualMachine CR on OpenShift

## 7. Start the migrated VM

The VM is created in Stopped state after migration:

```bash
virtctl start fedora-test
```

Verify it's running and SSH in:

```bash
oc get vm,vmi -n default
virtctl ssh fedora@vmi/fedora-test -c "uname -a"
```

## What just happened

MTV orchestrated a cold migration from ESXi to OpenShift Virtualization:

1. The Provider CR connected to ESXi's SDK endpoint and inventoried the VM
2. The NetworkMap mapped ESXi's "VM Network" to the OpenShift pod network
3. The StorageMap mapped the ESXi datastore to a StorageClass on OpenShift
4. The Plan selected the VM and validated migration prerequisites
5. The Migration CR triggered execution:
   - An init container loaded VDDK libraries from the VDDK image
   - `virt-v2v` converted the VMware disk image, installing VirtIO drivers
   - VDDK transferred the disk data from ESXi to a PVC on OpenShift
   - A VirtualMachine CR was created referencing the PVC
6. `virtctl start` booted the VM on KubeVirt, the same OS that was running on ESXi

## Gotchas we hit

**ESXi free license blocks the vStorage API.** MTV needs full API access for disk transfers via VDDK. The free ESXi edition (build 24677879) has write-API restrictions baked into the binary. You need a paid license (Essentials or higher) applied to the host.

**VDDK is required.** Without VDDK, MTV falls back to HTTP transfer, which fails because ESXi's HTTP endpoint doesn't support byte-range requests for flat VMDKs. The error is: `server does not support 'range' (byte range) requests`.

**VDDK image needs pull permissions.** When the VDDK image is in the internal registry under the `openshift-mtv` namespace, migration pods in the `default` namespace can't pull it without an explicit `system:image-puller` role binding.

**Provider secret format changed.** MTV 2.11 expects `user`, `password`, `insecureSkipVerify`, and `url` in the Secret's `stringData`. Older guides that use `thumbprint` won't work.

**MTV 2.11 blocks plans when VMware Tools is missing.** The `GuestToolsIssue` condition is now `Critical`. Power off the VM on ESXi before creating the plan to avoid this.

**The host provider is auto-created.** MTV automatically creates a provider named `host` for the local OpenShift cluster. You don't need to create a destination provider.
