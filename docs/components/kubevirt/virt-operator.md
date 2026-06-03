# virt-operator

**Deployment (2 replicas).** The only component installed directly. Everything else is created by its reconciliation loop.

- Image: `quay.io/kubevirt/virt-operator:v1.8.2`
- Source: [`cmd/virt-operator`](https://github.com/kubevirt/kubevirt/tree/main/cmd/virt-operator) (entry point), [`pkg/virt-operator`](https://github.com/kubevirt/kubevirt/tree/main/pkg/virt-operator) (logic)

## What it does

Watches the `KubeVirt` custom resource and ensures the correct versions of all other components are deployed. Handles rolling upgrades, minimizing workload disruption during version transitions.

## Startup sequence

From `pkg/virt-operator/application.go`:

1. **Cluster detection**: calls `clusterutil.IsOnOpenShift()` to determine if running on OpenShift or plain Kubernetes. On OpenShift, watches SCCs and Routes. On Kubernetes, uses dummy informers for those types.
2. **Informer setup**: creates watches on every resource type it manages: Deployments, DaemonSets, Services, CRDs, ServiceAccounts, RBAC, webhooks, ConfigMaps, Secrets, etc.
3. **Feature detection**: probes the cluster for ServiceMonitor, PrometheusRule, and ValidatingAdmissionPolicy CRDs. Adjusts its behavior based on what's available.
4. **Leader election**: two replicas compete for a lease. Only the leader runs the `KubeVirtController` reconciliation loop (3 worker threads).
5. **Webhook server**: listens on port 8444 for validating webhooks on KubeVirt CR create/update/delete.
6. **Metrics server**: serves Prometheus metrics on port 8186 over TLS.

## Reconciliation

When the leader sees a `KubeVirt` CR (or detects drift), it runs the install strategy:

- Creates/updates the `virt-api` Deployment
- Creates/updates the `virt-controller` Deployment
- Creates/updates the `virt-handler` DaemonSet
- Creates all required CRDs (VirtualMachine, VirtualMachineInstance, etc.)
- Creates RBAC, Services, webhooks, certificates

The install strategy is stored in a ConfigMap. The operator compares desired state against actual state and patches resources to converge.

## Key code paths

| File | What it does |
|------|-------------|
| `pkg/virt-operator/application.go` | Startup, informer wiring, leader election |
| `pkg/virt-operator/kubevirt.go` | `KubeVirtController` reconciliation loop |
| `pkg/virt-operator/resource/` | Resource generation for all managed components |
| `pkg/virt-operator/strategy.go` | Install strategy loading and comparison |
