# virt-api

**Deployment (1-2 replicas).** The HTTP API server and entry point for all virtualization-related requests.

- Image: `quay.io/kubevirt/virt-api:v1.8.2`
- Source: [`cmd/virt-api`](https://github.com/kubevirt/kubevirt/tree/main/cmd/virt-api), [`pkg/virt-api`](https://github.com/kubevirt/kubevirt/tree/main/pkg/virt-api)

## What it does

- Validates VM/VMI resources via admission webhooks
- Serves subresource endpoints: `/start`, `/stop`, `/restart`, `/migrate`, `/console`, `/vnc`, `/portforward`
- Persists resources to etcd via the Kubernetes API server

All VM lifecycle operations go through virt-api, whether initiated by `kubectl`, `virtctl`, the OpenShift console, or automation.

## Admission webhooks

virt-api registers 22 validating webhooks via a `ValidatingWebhookConfiguration` called `virt-api-validator`. These cover VMs, VMIs, migrations, snapshots, exports, instancetypes, and more.

When a VirtualMachine CREATE hits the API server, the `VMsAdmitter` in `pkg/virt-api/webhooks/validating-webhook/admitters/vms-admitter.go` runs this pipeline:

1. **Schema validation**: validates raw JSON against the VirtualMachine schema
2. **Instancetype/preference application**: if the VM references an instancetype, applies it to a copy and validates the result against the preference requirements
3. **Defaults**: `SetDefaultVirtualMachineInstanceSpec` fills in missing fields on the VMI spec
4. **Feature gate validation**: checks that any features used in the spec are enabled in the KubeVirt config
5. **Network validation**: `netadmitter.NewValidator` checks network configuration
6. **Spec validation**: `ValidateVirtualMachineSpec` validates the full VM spec (run strategy, template, resources)
7. **Storage admission**: `storageadmitters.Admit` validates volume/disk configuration
8. **Volume request validation**: checks any pending hotplug volume requests
9. **Metrics**: records a `NewVMCreated` Prometheus metric
10. **Deprecation warnings**: warns about deprecated APIs (e.g., `spec.running` vs `spec.runStrategy`)

The response includes warnings as Kubernetes admission warnings, surfaced to the user by `kubectl`/`oc`.

## Key code paths

| File | What it does |
|------|-------------|
| `pkg/virt-api/api.go` | Main API server setup, webhook routing |
| `pkg/virt-api/webhooks/validating-webhook/admitters/vms-admitter.go` | VM CREATE/UPDATE admission |
| `pkg/virt-api/webhooks/validating-webhook/admitters/vmi-create-admitter.go` | VMI CREATE admission |
