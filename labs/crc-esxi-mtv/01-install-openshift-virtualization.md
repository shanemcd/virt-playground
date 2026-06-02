# Lab 01: Install OpenShift Virtualization on CRC

Install the OpenShift Virtualization operator on a local CRC cluster and create the HyperConverged CR to deploy the full stack.

## Prerequisites

- CRC cluster running and `oc` logged in
- Nested virtualization enabled on the host (`/sys/module/kvm_intel/parameters/nested` = `Y`)

## Environment

```
OpenShift: 4.21.14
Kubernetes: v1.34.6
Cluster: single-node CRC
```

## Steps

### 1. Subscribe to the operator

This creates the namespace, OperatorGroup, and Subscription in one manifest. The Subscription tells OLM to install the HyperConverged Cluster Operator from the `redhat-operators` catalog.

```bash
oc apply -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: openshift-cnv
---
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: kubevirt-hyperconverged-group
  namespace: openshift-cnv
spec:
  targetNamespaces:
    - openshift-cnv
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: hco-operatorhub
  namespace: openshift-cnv
spec:
  source: redhat-operators
  sourceNamespace: openshift-marketplace
  name: kubevirt-hyperconverged
  channel: stable
  installPlanApproval: Automatic
EOF
```

### 2. Wait for the operator to install

First, find the CSV name (it won't appear immediately while OLM pulls the bundle):

```bash
oc get csv -n openshift-cnv
```

Then wait for it:

```bash
oc wait csv -n openshift-cnv kubevirt-hyperconverged-operator.v4.21.8 --for=jsonpath='{.status.phase}'=Succeeded --timeout=300s
```

The version installed in this run was `v4.21.8`. Yours may differ; check the CSV name from the `get` command above and adjust accordingly.

### 3. Create the HyperConverged CR

This is the trigger that actually deploys the full stack. An empty `spec` is valid because the HCO applies opinionated defaults.

```bash
oc apply -f - <<'EOF'
apiVersion: hco.kubevirt.io/v1beta1
kind: HyperConverged
metadata:
  name: kubevirt-hyperconverged
  namespace: openshift-cnv
spec: {}
EOF
```

### 4. Wait for deployment

```bash
oc get pods -n openshift-cnv
```

This takes a couple of minutes. There are ~28 pods in total. Wait until all show `Running` (some pods may take a minute or two longer than others, particularly `virt-handler` which runs init containers and `kubevirt-console-plugin`).

### 5. Verify the HyperConverged CR is healthy

```bash
oc get hco kubevirt-hyperconverged -n openshift-cnv -o json | jq -r '.status.conditions[] | {type,status}'
```

Expected output:

```json
{ "type": "ReconcileComplete", "status": "True" }
{ "type": "Available", "status": "True" }
{ "type": "Progressing", "status": "False" }
{ "type": "Degraded", "status": "False" }
{ "type": "Upgradeable", "status": "True" }
```

## What just happened

The install is two phases:

**Phase 1: OLM deploys the operators.** The Subscription tells OLM to pull the HyperConverged Cluster Operator bundle from the `redhat-operators` catalog. OLM installs the HCO pod along with operator pods for each component (virt-operator, cdi-operator, cluster-network-addons-operator, ssp-operator).

**Phase 2: The HyperConverged CR triggers deployment.** The HCO reads the `HyperConverged` CR and creates child CRs for each sub-operator:

- A `KubeVirt` CR for virt-operator, which then creates virt-api, virt-controller, and virt-handler
- A `CDI` CR for cdi-operator, which creates the importer, upload proxy, and API server
- A `NetworkAddonsConfig` CR for cluster-network-addons-operator
- An `SSP` CR for ssp-operator, which deploys VM templates and boot sources

The `HyperConverged` CR is the single control surface for the entire stack. Every configuration change (migration limits, GPU passthrough, storage settings, CPU models) goes through this one CR, and the HCO fans it out to the appropriate child operators.

## Notes

- This is running on CRC, which is itself a VM. VMs created on this cluster will use nested virtualization (KVM inside KVM). Performance will be degraded compared to bare metal, but functionally everything works the same way.
- The official install docs live in [openshift-docs/virt/install/](https://github.com/openshift/openshift-docs/tree/enterprise-4.21/virt/install).
