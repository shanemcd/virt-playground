# KubeVirt Component Deep Dive

How the five core KubeVirt components work and interact at runtime.

## virt-operator

**Deployment.** Installed by OLM (or manually in upstream).

Watches the `KubeVirt` custom resource and ensures the correct versions of all other components are deployed. Handles rolling upgrades, minimizing workload disruption during version transitions. This is the only component an admin installs directly; everything else is created by the operator's reconciliation loop.

## virt-api

**Deployment** (typically 2 replicas).

The HTTP API server and the entry point for all virtualization-related requests. Responsibilities:

- Validates VM/VMI resources via admission webhooks
- Serves subresource endpoints: `/start`, `/stop`, `/restart`, `/migrate`, `/console`, `/vnc`, `/portforward`
- Persists resources to etcd via the Kubernetes API server

All VM lifecycle operations go through virt-api, whether initiated by `kubectl`, `virtctl`, the OpenShift console, or automation.

## virt-controller

**Deployment** (typically 2 replicas for HA).

The cluster-level reconciliation engine. It watches VirtualMachine and VirtualMachineInstance resources and drives state transitions:

1. **VM -> VMI**: When a VM with `runStrategy: Always` exists without a corresponding VMI, virt-controller creates one from `VM.Spec.Template`
2. **VMI -> Pod**: When a VMI exists without a pod, virt-controller calls `TemplateService.RenderLaunchManifest()` to generate a pod spec and creates the virt-launcher pod
3. **Migration orchestration**: Creates target virt-launcher pods, coordinates handoff between source and target nodes

virt-controller never communicates directly with libvirt or QEMU. It works entirely through the Kubernetes API, creating pods and updating VMI status.

## virt-handler

**DaemonSet** (runs on every schedulable node).

The bridge between the Kubernetes API and the libvirt/QEMU layer on each node. It:

- Watches for VMIs assigned to its node
- Opens gRPC connections to virt-launcher pods via Unix domain sockets at `/var/run/kubevirt/sockets/<pod-uid>/sock`
- Calls `SyncVirtualMachine()` to push VMI spec changes to the launcher
- Reports domain state and spec changes back to the API server
- Invokes node-centric plugins for networking and storage setup
- Runs a continuous reconciliation loop processing VMI and Domain events

virt-handler suppresses socket errors for the first 3 minutes while waiting for a new virt-launcher to initialize. After that, an unreachable socket means the VMI is marked as Failed.

## virt-launcher

**Pod** (one per running VMI).

The per-VM sandbox. Inside the virt-launcher container:

```
PID 1: virt-launcher
  |-- virtqemud    (QEMU-specific libvirt daemon)
  |-- virtlogd     (libvirt log daemon)
  |-- qemu-kvm     (the VM, with one thread per vCPU)
```

The virt-launcher process:

1. Starts virtqemud and virtlogd
2. Opens a gRPC **cmd-server** on a Unix socket
3. Accepts lifecycle commands from virt-handler
4. Delegates to `LibvirtDomainManager`, which converts VMI specs to libvirt domain XML and calls virtqemud
5. Monitors the QEMU process and terminates itself when the VM exits
6. Intercepts pod termination signals and forwards them to QEMU for graceful shutdown

### Why virtqemud Instead of libvirtd

Modern KubeVirt uses `virtqemud`, the QEMU-specific modular daemon from the libvirt project, rather than the monolithic `libvirtd`. This reduces attack surface and resource footprint. Each pod has its own instance; there is no shared node-wide daemon.

### Hook Sidecars

For customizations not exposed by the VMI spec, KubeVirt supports hook sidecar containers that run alongside virt-launcher. These communicate over gRPC and can intercept the `onDefineDomain` hook to modify libvirt domain XML before the VM starts.

## Inter-Component Communication

```
User (kubectl/virtctl/console)
  |
  v
kube-apiserver <-- admission webhooks -- virt-api
  |
  | (watch)
  v
virt-controller
  |
  | (creates pod)
  v
virt-launcher pod (scheduled by kube-scheduler)
  ^
  | (gRPC over Unix socket)
  |
virt-handler (DaemonSet on the node)
  |
  | (watches VMIs via kube-apiserver)
  v
kube-apiserver
```

TLS secures communication between KubeVirt components. The shared directory at `/var/run/kubevirt` between virt-handler and virt-launcher contains subdirectories for ephemeral disks, container disks, and hotplug disks.

## VMI Phases

| Phase | Meaning |
|-------|---------|
| Pending | VMI accepted, not yet scheduled |
| Scheduling | virt-launcher pod being created |
| Scheduled | Pod placed on a node |
| Running | QEMU process active |
| Succeeded | VM shut down cleanly |
| Failed | VM crashed or error occurred |
| Unknown | State cannot be determined |
