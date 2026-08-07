# Lab 02: OLM and KubeVirt

Install operator lifecycle management, then community HyperConverged (HCO) so KubeVirt/CDI land on MicroShift.

## Why not `microshift-olm` RPM

Red Hat docs describe `dnf install microshift-olm` on entitlement-backed MicroShift. CRC's MicroShift guest is an **ostree** image without a RHEL subscription, so that RPM path is unavailable. Use **upstream OLM** instead.

## Steps

### 1. Install upstream OLM

Use a recent OLM release (this lab used **v0.46.0**). Apply CRDs with server-side apply if client-side apply fights existing types:

```bash
# follow upstream OLM install docs for the chosen tag, e.g.
# https://github.com/operator-framework/operator-lifecycle-manager
#
# Typical pattern:
#   oc apply --server-side -f crds.yaml
#   oc apply -f olm.yaml
```

Wait until OLM pods are ready in the `olm` namespace.

### 2. SCC for catalog + unpack jobs

MicroShift SCCs reject the community catalog and bundle unpack ServiceAccounts by default:

```bash
oc adm policy add-scc-to-user anyuid -z default -n olm
oc adm policy add-scc-to-user anyuid -z system:serviceaccounts:olm
```

If the CatalogSource supports it, set `spec.grpcPodConfig.securityContextConfig: legacy`.

### 3. OperatorHub.io catalog

This is **not** `redhat-operators`. Community packages only:

```bash
oc apply -f - <<'EOF'
apiVersion: operators.coreos.com/v1alpha1
kind: CatalogSource
metadata:
  name: operatorhubio-catalog
  namespace: olm
spec:
  sourceType: grpc
  image: quay.io/operatorhubio/catalog:latest
  displayName: OperatorHub.io
  publisher: OperatorHub.io
  grpcPodConfig:
    securityContextConfig: legacy
EOF
```

Confirm packages appear:

```bash
oc get catalogsource -n olm
oc get packagemanifests | head
```

### 4. Prerequisites HCO needs on MicroShift

Community HCO expects **cert-manager** and **Multus**. Install both before (or immediately after) creating the HyperConverged CR; otherwise HCO stays degraded.

Use the usual upstream/cert-manager and Multus install paths appropriate for the cluster CNI (OVN-Kubernetes on MicroShift).

### 5. Install community HCO

Namespace used here: `kubevirt-hyperconverged` (not `openshift-cnv`).

**OperatorGroup must be AllNamespaces** (`spec: {}`). OwnNamespace fails for this operator.

```bash
oc apply -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: kubevirt-hyperconverged
---
apiVersion: operators.coreos.com/v1
kind: OperatorGroup
metadata:
  name: kubevirt-hyperconverged-group
  namespace: kubevirt-hyperconverged
spec: {}
---
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: community-kubevirt-hyperconverged
  namespace: kubevirt-hyperconverged
spec:
  channel: stable
  name: community-kubevirt-hyperconverged
  source: operatorhubio-catalog
  sourceNamespace: olm
  installPlanApproval: Automatic
EOF
```

Wait for the CSV, then create HyperConverged:

```bash
oc get csv -n kubevirt-hyperconverged
oc apply -f - <<'EOF'
apiVersion: hco.kubevirt.io/v1beta1
kind: HyperConverged
metadata:
  name: kubevirt-hyperconverged
  namespace: kubevirt-hyperconverged
spec: {}
EOF
```

### 6. Verify

```bash
oc get hco kubevirt-hyperconverged -n kubevirt-hyperconverged
oc get pods -n kubevirt-hyperconverged
oc get crd virtualmachines.kubevirt.io
```

Recorded successful run: HCO **v1.18.1**, HyperConverged Available after cert-manager + Multus.

Also create a namespace for golden images if the UI expects it:

```bash
oc create namespace kubevirt-os-images
```

## Next

[03 - Console and Tailscale](03-console-and-tailscale.md)
