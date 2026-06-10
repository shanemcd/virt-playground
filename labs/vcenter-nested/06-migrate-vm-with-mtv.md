# Lab: Migrate a VM from vCenter to OpenShift Virtualization with MTV

Migrate a Fedora Server VM from vCenter to OpenShift Virtualization using the Migration Toolkit for Virtualization (MTV) with VDDK. This uses vCenter as the migration source (not ESXi directly), which is how production migrations work.

## Prerequisites

- CRC cluster running with KubeVirt installed
- MTV operator installed
- Fedora Server VM on vCenter, powered off ([lab 05](05-create-test-vm.md))
- VDDK image built and pushed to the CRC internal registry
- CRC node can reach vCenter (`vcsa.lab.local`) and ESXi (`192.168.122.51`)

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
oc get csv -n openshift-mtv
oc wait csv -n openshift-mtv <csv-name> --for=jsonpath='{.status.phase}'=Succeeded --timeout=300s

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

Download the VDDK SDK from [developer.broadcom.com](https://developer.broadcom.com/sdks/vmware-virtual-disk-development-kit-vddk/latest), extract it, then build and push:

```bash
cat > /tmp/Containerfile.vddk << 'EOF'
FROM registry.access.redhat.com/ubi8/ubi-minimal
USER 1001
COPY vmware-vix-disklib-distrib /vmware-vix-disklib-distrib
RUN mkdir -p /opt
ENTRYPOINT ["cp", "-r", "/vmware-vix-disklib-distrib", "/opt"]
EOF

cd /path/to/extracted/vddk && podman build -t vddk:latest -f /tmp/Containerfile.vddk .

REGISTRY=$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}')
podman login -u kubeadmin -p $(oc whoami -t) $REGISTRY --tls-verify=false
podman tag vddk:latest $REGISTRY/openshift-mtv/vddk:latest
podman push $REGISTRY/openshift-mtv/vddk:latest --tls-verify=false
```

Grant pull access:

```bash
oc policy add-role-to-user system:image-puller \
  system:serviceaccount:openshift-mtv:default -n openshift-mtv
oc policy add-role-to-user system:image-puller \
  system:serviceaccount:openshift-mtv:forklift-controller -n openshift-mtv
oc policy add-role-to-user system:image-puller \
  system:serviceaccount:default:default -n openshift-mtv
```

## 3. Configure the vCenter source provider

```bash
oc apply -f - <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: vcenter-credentials
  namespace: openshift-mtv
  labels:
    createdForProviderType: vsphere
    createdForResourceType: providers
type: Opaque
stringData:
  user: administrator@vsphere.local
  password: <sso-password>
  insecureSkipVerify: "true"
  url: https://vcsa.lab.local/sdk
---
apiVersion: forklift.konveyor.io/v1beta1
kind: Provider
metadata:
  name: vcenter-source
  namespace: openshift-mtv
spec:
  type: vsphere
  url: https://vcsa.lab.local/sdk
  settings:
    vddkInitImage: image-registry.openshift-image-registry.svc:5000/openshift-mtv/vddk:latest
  secret:
    name: vcenter-credentials
    namespace: openshift-mtv
EOF
```

Note: no `sdkEndpoint: esxi` setting. This connects to vCenter, not directly to ESXi. vCenter manages the inventory and VDDK connects to the ESXi host through vCenter's ticket mechanism.

Verify:

```bash
oc get provider vcenter-source -n openshift-mtv
```

Should show `Ready`, `Connected`, and `Inventory` all True.

## 4. Get VM and inventory IDs

```bash
PROVIDER_UID=$(oc get provider vcenter-source -n openshift-mtv -o jsonpath='{.metadata.uid}')
TOKEN=$(oc whoami -t)
INVENTORY_URL=$(oc get route forklift-inventory -n openshift-mtv -o jsonpath='{.spec.host}')

curl -sk -H "Authorization: Bearer $TOKEN" \
  "https://$INVENTORY_URL/providers/vsphere/$PROVIDER_UID/vms" | \
  jq '.[] | select(.name=="fedora-01") | {id, name, networks: [.networks[].id], disks: [.disks[] | {datastore: .datastore.id, bus}]}'
```

Note the VM `id`, network `id`, and datastore `id` for the next step.

## 5. Create network and storage maps

```bash
oc apply -f - <<'EOF'
apiVersion: forklift.konveyor.io/v1beta1
kind: NetworkMap
metadata:
  name: vcenter-network-map
  namespace: openshift-mtv
spec:
  map:
    - source:
        id: <network-id>
        type: Network
      destination:
        type: pod
  provider:
    source:
      name: vcenter-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
---
apiVersion: forklift.konveyor.io/v1beta1
kind: StorageMap
metadata:
  name: vcenter-storage-map
  namespace: openshift-mtv
spec:
  map:
    - source:
        id: <datastore-id>
      destination:
        storageClass: crc-csi-hostpath-provisioner
  provider:
    source:
      name: vcenter-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
EOF
```

## 6. Create migration plan and execute

```bash
oc apply -f - <<'EOF'
apiVersion: forklift.konveyor.io/v1beta1
kind: Plan
metadata:
  name: migrate-fedora-01
  namespace: openshift-mtv
spec:
  preserveStaticIPs: false
  provider:
    source:
      name: vcenter-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
  map:
    network:
      name: vcenter-network-map
      namespace: openshift-mtv
    storage:
      name: vcenter-storage-map
      namespace: openshift-mtv
  targetNamespace: default
  vms:
    - id: "<vm-id>"
      name: fedora-01
---
apiVersion: forklift.konveyor.io/v1beta1
kind: Migration
metadata:
  name: migrate-fedora-01
  namespace: openshift-mtv
spec:
  plan:
    name: migrate-fedora-01
    namespace: openshift-mtv
EOF
```

## 7. Monitor the migration

```bash
oc get plan migrate-fedora-01 -n openshift-mtv -o json | \
  jq '.status.migration.vms[0] | {name, phase, pipeline: [.pipeline[] | {name, phase}]}'
```

The pipeline stages are:

1. **Initialize** - set up migration resources, power off source VM
2. **DiskAllocation** - allocate PVCs on the target
3. **ImageConversion** - virt-v2v connects to vCenter via VDDK, downloads and converts the disk (installs VirtIO drivers)
4. **DiskTransferV2v** - transfer converted disk data to PVCs
5. **VirtualMachineCreation** - creates the VirtualMachine CR on OpenShift

## 8. Start the migrated VM

```bash
virtctl start fedora-01
```

Verify:

```bash
oc get vm,vmi -n default
virtctl ssh <user>@vmi/fedora-01
```

## What just happened

MTV orchestrated a cold migration from vCenter to OpenShift Virtualization:

1. The Provider CR connected to vCenter's SDK endpoint and inventoried VMs across all managed ESXi hosts
2. The NetworkMap mapped vCenter's "VM Network" to the OpenShift pod network
3. The StorageMap mapped the ESXi datastore to a StorageClass on OpenShift
4. The Plan selected the VM and validated migration prerequisites (VDDK image, disk sizes, controller types)
5. The Migration CR triggered execution:
   - virt-v2v connected to vCenter via the `vpx://` libvirt driver
   - libvirt created a snapshot on the VM (requires SCSI controller to produce delta VMDKs)
   - VDDK transferred the disk data from ESXi through vCenter's ticket mechanism
   - virt-v2v converted the disk image, replacing LSI Logic/PVSCSI drivers with VirtIO
   - A VirtualMachine CR was created referencing the converted PVC

## Differences from ESXi-direct migration

| | vCenter Provider | ESXi Direct Provider |
|---|---|---|
| Connection | `vpx://` via vCenter SDK | `esx://` via ESXi SDK |
| Inventory | All VMs across all hosts | Only VMs on one ESXi host |
| Authentication | vCenter SSO credentials | ESXi root credentials |
| `sdkEndpoint` setting | Not set (default) | `esxi` |
| VDDK disk access | Through vCenter ticket | Direct to ESXi |
| Production use | Yes | Lab/single-host only |
