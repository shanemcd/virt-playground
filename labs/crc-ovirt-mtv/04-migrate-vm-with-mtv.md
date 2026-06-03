# Lab 04: Migrate a VM from oVirt to OpenShift Virtualization with MTV

Migrate a Fedora VM from oVirt to OpenShift Virtualization using MTV. No VDDK needed.

## Prerequisites

- oVirt with a running or stopped VM ([lab 03](03-create-vm-on-ovirt.md))
- CRC with OpenShift Virtualization and MTV installed (from the [CRC + ESXi + MTV lab](../crc-esxi-mtv/))
- The VM on oVirt must be **powered off** for cold migration
- CRC must be able to reach the oVirt engine over the network

## 1. Power off the source VM

```bash
TOKEN=$(curl -sk -H "Accept: application/json" \
  "https://ovirt.localdomain/ovirt-engine/sso/oauth/token?grant_type=password&username=admin@ovirt@internalsso&password=<password>&scope=ovirt-app-api" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -sk -X POST -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/vms/<vm-id>/stop" -d '{}'
```

## 2. Create the oVirt provider in MTV

```bash
oc apply -f - <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: ovirt-credentials
  namespace: openshift-mtv
  labels:
    createdForProviderType: ovirt
    createdForResourceType: providers
type: Opaque
stringData:
  user: admin@ovirt@internalsso
  password: <password>
  insecureSkipVerify: "true"
  url: https://<ovirt-ip>/ovirt-engine/api
---
apiVersion: forklift.konveyor.io/v1beta1
kind: Provider
metadata:
  name: ovirt-source
  namespace: openshift-mtv
spec:
  type: ovirt
  url: https://<ovirt-ip>/ovirt-engine/api
  secret:
    name: ovirt-credentials
    namespace: openshift-mtv
EOF
```

The provider type is `ovirt`. MTV connects using the oVirt REST API and imageio for disk transfers.

Verify:

```bash
oc get provider ovirt-source -n openshift-mtv
```

Should show `Ready` with `ConnectionTestSucceeded` and `InventoryCreated`.

## 3. Get inventory IDs

Query the MTV inventory API to find the network and storage domain IDs:

```bash
PROVIDER_UID=$(oc get provider ovirt-source -n openshift-mtv -o jsonpath='{.metadata.uid}')
TOKEN=$(oc whoami -t)
INVENTORY="https://forklift-inventory-openshift-mtv.apps-crc.testing"

# VMs
curl -sk -H "Authorization: Bearer $TOKEN" "$INVENTORY/providers/ovirt/$PROVIDER_UID/vms" | python3 -c "import sys,json; [print(v['name'], v['id']) for v in json.load(sys.stdin)]"

# Storage domains
curl -sk -H "Authorization: Bearer $TOKEN" "$INVENTORY/providers/ovirt/$PROVIDER_UID/storagedomains" | python3 -c "import sys,json; [print(s['name'], s['id']) for s in json.load(sys.stdin)]"

# Networks
curl -sk -H "Authorization: Bearer $TOKEN" "$INVENTORY/providers/ovirt/$PROVIDER_UID/networks" | python3 -c "import sys,json; [print(n['name'], n['id']) for n in json.load(sys.stdin)]"
```

## 4. Create maps and migration plan

```bash
oc apply -f - <<'EOF'
apiVersion: forklift.konveyor.io/v1beta1
kind: NetworkMap
metadata:
  name: ovirt-network-map
  namespace: openshift-mtv
spec:
  map:
    - source:
        id: <ovirtmgmt-network-id>
      destination:
        type: pod
  provider:
    source:
      name: ovirt-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
---
apiVersion: forklift.konveyor.io/v1beta1
kind: StorageMap
metadata:
  name: ovirt-storage-map
  namespace: openshift-mtv
spec:
  map:
    - source:
        id: <storage-domain-id>
      destination:
        storageClass: crc-csi-hostpath-provisioner
  provider:
    source:
      name: ovirt-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
---
apiVersion: forklift.konveyor.io/v1beta1
kind: Plan
metadata:
  name: migrate-ovirt-fedora
  namespace: openshift-mtv
spec:
  preserveStaticIPs: false
  provider:
    source:
      name: ovirt-source
      namespace: openshift-mtv
    destination:
      name: host
      namespace: openshift-mtv
  map:
    network:
      name: ovirt-network-map
      namespace: openshift-mtv
    storage:
      name: ovirt-storage-map
      namespace: openshift-mtv
  targetNamespace: default
  vms:
    - id: "<vm-id>"
      name: fedora-test
EOF
```

Check the plan is ready:

```bash
oc get plan migrate-ovirt-fedora -n openshift-mtv -o jsonpath='{range .status.conditions[*]}{.type}: {.status}{"\n"}{end}'
```

## 5. Execute the migration

```bash
oc apply -f - <<'EOF'
apiVersion: forklift.konveyor.io/v1beta1
kind: Migration
metadata:
  name: migrate-ovirt-fedora
  namespace: openshift-mtv
spec:
  plan:
    name: migrate-ovirt-fedora
    namespace: openshift-mtv
EOF
```

Monitor:

```bash
oc get plan migrate-ovirt-fedora -n openshift-mtv -o json | \
  python3 -c "import sys,json; v=json.load(sys.stdin)['status']['migration']['vms'][0]; print(v['name'], v['phase']); [print(' ', p['name'], p['phase']) for p in v['pipeline']]"
```

The oVirt migration pipeline has three stages (vs five for ESXi):

1. **Initialize** - set up migration resources
2. **DiskTransfer** - transfer disk data via oVirt imageio
3. **VirtualMachineCreation** - create the VirtualMachine CR

No ImageConversion or DiskTransferV2v stages, because oVirt VMs already use virtio drivers and the disk transfer goes through imageio, not VDDK.

## 6. Start the migrated VM

```bash
virtctl start fedora-test
oc get vm,vmi -n default
```

## What just happened

MTV used the oVirt REST API to inventory the VM, created a disk transfer through oVirt's imageio service to copy the disk data into a PVC on OpenShift, and created a VirtualMachine CR. The Forklift oVirt adapter handled all the provider-specific translation, using the same Plan/Migration/NetworkMap/StorageMap CRDs as the ESXi migration.
