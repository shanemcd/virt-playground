# kubevirt/kubevirt

The core VM runtime. Five components that take a `VirtualMachine` YAML spec and turn it into a running QEMU process.

- Repo: [kubevirt/kubevirt](https://github.com/kubevirt/kubevirt)
- Local clone: `~/github/kubevirt/kubevirt`
- Deployed version: v1.8.2
- Namespace: `kubevirt`

| Order | Component                                | What it does                                        | Type                      | Source                |
| ----- | ---------------------------------------- | --------------------------------------------------- | ------------------------- | --------------------- |
| 0     | [virt-operator](virt-operator.md)        | Deploys and upgrades all other components            | Deployment (2 replicas)   | `cmd/virt-operator`   |
| 1     | [virt-api](virt-api.md)                  | Validates and serves VM subresource endpoints        | Deployment (1-2 replicas) | `cmd/virt-api`        |
| 2     | [virt-controller](virt-controller.md)    | Reconciles VM/VMI state, creates virt-launcher pods  | Deployment (2 replicas)   | `cmd/virt-controller` |
| 3     | [virt-handler](virt-handler.md)          | Node agent, bridges Kubernetes API to libvirt/QEMU   | DaemonSet                 | `cmd/virt-handler`    |
| 4     | [virt-launcher](virt-launcher.md)        | Per-VM sandbox, runs virtqemud and QEMU              | Pod (one per VM)          | `cmd/virt-launcher`   |

## Where each component runs

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLUSTER-WIDE                                 │
│                                                                     │
│   ┌──────────────────┐  ┌──────────┐  ┌─────────────────┐          │
│   │  virt-operator    │  │ virt-api │  │ virt-controller │          │
│   │  (2 replicas)     │  │          │  │  (2 replicas)   │          │
│   │                   │  │          │  │                 │          │
│   │  Deploys and      │  │  Webhooks│  │  Watches VMs,   │          │
│   │  upgrades all     │  │  and sub-│  │  creates VMIs   │          │
│   │  other components │  │  resource│  │  and launcher   │          │
│   │                   │  │  API     │  │  pods           │          │
│   └──────────────────┘  └──────────┘  └─────────────────┘          │
├─────────────────────────────────────────────────────────────────────┤
│                        PER NODE                                     │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  virt-handler (DaemonSet)                                │      │
│   │                                                          │      │
│   │  Manages VMIs on this node, sets up networking and       │      │
│   │  storage, opens gRPC connections to virt-launcher pods   │      │
│   │  Registers /dev/kvm, /dev/tun, /dev/vhost-net as        │      │
│   │  Kubernetes device plugins                               │      │
│   └──────────────────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────────────────────┤
│                        PER VM                                       │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────┐      │
│   │  virt-launcher pod                                       │      │
│   │                                                          │      │
│   │  PID 1: virt-launcher-monitor (supervisor)               │      │
│   │    PID 8: virt-launcher (gRPC cmd-server)                │      │
│   │      ├── virtqemud  (per-pod libvirt daemon)             │      │
│   │      └── virtlogd   (libvirt log daemon)                 │      │
│   │    PID N: qemu-kvm  (the VM)                             │      │
│   └──────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

## Communication and dependencies

Every arrow below is a real communication path. No component talks directly to a component it doesn't have a line to.

```
                    ┌──────────────────────┐
                    │    kube-apiserver     │
                    │    (etcd backing)     │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────────────┐
              │                │                        │
         ┌────▼─────┐   ┌─────▼──────┐   ┌─────────────▼──────────┐
         │ virt-api  │   │  virt-     │   │    virt-handler        │
         │          │   │ controller │   │    (per node)          │
         └────┬─────┘   └─────┬──────┘   └─────────────┬──────────┘
              │                │                        │
              │                │                        │
   Admission  │     Creates    │            gRPC over   │
   webhooks   │     pods via   │            Unix socket │
   (HTTPS     │     API server │                        │
    callback) │                │                        │
              │                │                   ┌────▼──────────┐
              │                │                   │ virt-launcher  │
              │                │                   │   (per VM)     │
              │                │                   └────┬──────────┘
              │                │                        │
              │                │              libvirt   │
              │                │              API call  │
              │                │                        │
              │                │                   ┌────▼──────────┐
              │                │                   │   virtqemud    │
              │                │                   └────┬──────────┘
              │                │                        │
              │                │              QMP       │
              │                │              (QEMU     │
              │                │               Monitor  │
              │                │               Protocol)│
              │                │                        │
              │                │                   ┌────▼──────────┐
              │                │                   │   qemu-kvm     │
              │                │                   └───────────────┘
```

### Protocol details

| From | To | Protocol | What travels |
|------|----|----------|-------------|
| **User** | kube-apiserver | HTTPS (REST) | VM/VMI CRUD, `virtctl` subresource calls |
| **kube-apiserver** | virt-api | HTTPS (webhook callback) | Admission reviews for CREATE/UPDATE/DELETE |
| **virt-api** | kube-apiserver | HTTPS (REST) | Subresource proxying (console, VNC, SSH) |
| **virt-controller** | kube-apiserver | HTTPS (watch + write) | Watches VMs/VMIs, creates/updates pods and VMI status |
| **virt-handler** | kube-apiserver | HTTPS (watch + write) | Watches VMIs on its node, reports domain state back |
| **virt-handler** | virt-launcher | gRPC over Unix socket | `SyncVirtualMachine`, lifecycle commands (30+ RPCs) |
| **virt-launcher** | virt-handler | Notify pipe | Domain state change events (Paused, Running, etc.) |
| **virt-launcher** | virtqemud | libvirt API (local) | Domain define, start, migrate, device attach |
| **virtqemud** | qemu-kvm | QMP (QEMU Monitor Protocol) | Machine control, device hotplug, migration |

### What creates what

```
Admin installs kubevirt-operator.yaml
  └── creates virt-operator Deployment
        │
        │  (watches KubeVirt CR)
        ▼
Admin applies kubevirt-cr.yaml
  └── virt-operator reconciles and creates:
        ├── virt-api Deployment
        ├── virt-controller Deployment
        ├── virt-handler DaemonSet
        ├── CRDs (VirtualMachine, VirtualMachineInstance, ...)
        ├── RBAC (ServiceAccounts, Roles, Bindings)
        ├── Services
        ├── ValidatingWebhookConfigurations (22 webhooks)
        ├── MutatingWebhookConfigurations
        └── Certificates
              │
              │  (user creates a VM)
              ▼
User applies VirtualMachine YAML
  └── virt-controller creates VirtualMachineInstance
        └── virt-controller creates virt-launcher Pod
              └── virt-handler calls SyncVirtualMachine via gRPC
                    └── virt-launcher defines domain in virtqemud
                          └── virtqemud starts qemu-kvm process
```

### What watches what

Every component uses the Kubernetes watch API to react to changes. No polling.

| Watcher | Watches | Reacts by |
|---------|---------|-----------|
| **virt-operator** | `KubeVirt` CR, all managed resources | Creating/updating Deployments, DaemonSets, CRDs, RBAC |
| **virt-controller** | `VirtualMachine`, `VirtualMachineInstance`, Pods | Creating VMIs from VMs, creating pods from VMIs, updating VMI status |
| **virt-handler** | `VirtualMachineInstance` (filtered to its node) | Mounting disks, setting up network, calling gRPC to virt-launcher |
| **virt-handler** | Kubernetes device plugin API | Advertising `/dev/kvm`, `/dev/tun`, `/dev/vhost-net` to the kubelet |

### The boundary that matters most

The critical architectural boundary is between **virt-handler** and **virt-launcher**. Everything above this line (virt-api, virt-controller) operates purely through the Kubernetes API. Everything below it (virtqemud, QEMU) operates through libvirt. virt-handler is where Kubernetes ends and virtualization begins.

The gRPC protocol (`pkg/handler-launcher-com/cmd/v1/cmd.proto`) defines this boundary. It has 30+ RPCs covering creation, lifecycle, migration, hotplug, guest agent queries, memory dump, screenshots, and backup. The VMI spec is serialized to JSON in the protobuf message; the launcher deserializes it, converts it to libvirt domain XML, and drives virtqemud.

## Reading order

Start with **virt-operator** to understand how the stack bootstraps and upgrades itself. Then follow the request path a VM takes:

1. [virt-operator](virt-operator.md) - How the stack bootstraps and upgrades itself
2. [virt-api](virt-api.md) - The front door: validation, webhooks, subresource endpoints
3. [virt-controller](virt-controller.md) - The brain: state machines, pod creation, migration orchestration
4. [virt-handler](virt-handler.md) - The hands: node-level agent, gRPC to launchers, device plugins
5. [virt-launcher](virt-launcher.md) - The sandbox: virtqemud, QEMU process, domain lifecycle

## Other references

- [Container Disks](container-disks.md) - How KubeVirt boots VMs from container images (OCI as disk distribution)
- [PVC Disks](pvc-disks.md) - Persistent disks via PVCs: direct read-write, no backing chain
- [VM Metrics](vm-metrics.md) - How CPU/memory/disk/network stats flow from QEMU to the console dashboard
- [VM Console Access](vm-console-access.md) - How serial/VNC console reaches QEMU through the WebSocket proxy chain: virt-api subresources, two WebSocket upgrades, virt-handler console server, Unix socket paths, QEMU chardev/graphics setup, virtctl vs browser
- [VMI Phases](vmi-phases.md) - The state machine a VirtualMachineInstance moves through
- [Client Tools](client-tools.md) - virtctl vs oc: what each can do and why
