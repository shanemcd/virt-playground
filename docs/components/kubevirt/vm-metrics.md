# VM Metrics

How CPU and memory usage gets from a running VM to the OpenShift console dashboard.

## Two separate metrics paths

VM resource usage flows through two independent paths. They measure different things.

### Path 1: Kubernetes (cgroups)

Kubernetes sees the virt-launcher pod as a regular pod. The kubelet reads cgroup stats for the compute container (cpu.stat, memory.current) and reports them to the metrics pipeline. This is what `oc adm top pod` shows when the metrics API is available.

This measures the QEMU process's resource consumption from the host's perspective: how much CPU time the qemu-kvm process used, how much resident memory it holds. It includes QEMU's own overhead (page tables, virtqemud, virt-launcher) on top of the guest's actual usage.

The pod's resource requests (e.g., 100m CPU, 1292Mi memory for a 1Gi guest) are set by virt-controller's `RenderLaunchManifest()`. The memory request includes the guest memory plus calculated overhead for QEMU, virtqemud, page tables, and virt-launcher.

### Path 2: KubeVirt (libvirt stats -> gRPC -> Prometheus)

KubeVirt collects VM-level stats from inside the virtualization layer:

1. **virt-launcher** polls virtqemud every 3.25 seconds via `ConnectGetAllDomainStats()` (libvirt API). It requests six stat types:
   - `DOMAIN_STATS_BALLOON`: memory balloon stats (how much memory the guest is using vs allocated)
   - `DOMAIN_STATS_CPU_TOTAL`: total CPU time consumed by the domain
   - `DOMAIN_STATS_VCPU`: per-vCPU stats (time, state, delay)
   - `DOMAIN_STATS_INTERFACE`: per-NIC stats (rx/tx bytes, packets, errors, drops)
   - `DOMAIN_STATS_BLOCK`: per-disk stats (read/write bytes, ops, times)
   - `DOMAIN_STATS_DIRTYRATE`: memory dirty rate (used for migration decisions)

   It also calls `MemoryStats()` for detailed memory breakdown (actual, RSS, swap, unused, available) and `GetVcpuPinInfo()` for CPU pinning state.

   These are cached in a time-defined cache (`domainStatsCache`) and refreshed every 3.25 seconds.

   Source: `pkg/virt-launcher/virtwrap/manager.go` (`getDomainStats`, line 2304)

2. **virt-handler** calls the `GetDomainStats` gRPC RPC on each virt-launcher to collect the cached stats.

   Source: `pkg/virt-handler/cmd-client/client.go` (`GetDomainStats`)

3. The stats are exposed as **Prometheus metrics** which the monitoring stack scrapes. The OpenShift console dashboard reads these metrics for the VM overview graphs.

## Prometheus integration

KubeVirt creates two resources in the monitoring namespace (not the kubevirt namespace):

- **ServiceMonitor** (`prometheus-kubevirt-rules` in `openshift-monitoring`): tells Prometheus to scrape KubeVirt's metrics endpoints over HTTPS
- **PrometheusRule** (`prometheus-kubevirt-rules` in `kubevirt`): alerting rules for VM-related conditions

These are only created if the ServiceMonitor CRD exists and the `prometheus-k8s` ServiceAccount is found in `openshift-monitoring` when the virt-operator generates its install strategy. The operator checks `getMonitorNamespace()` which looks for the SA in a list of well-known namespaces (`openshift-monitoring`, `monitoring`).

If monitoring is installed after KubeVirt, the install strategy ConfigMap won't include ServiceMonitors. The fix is to delete the strategy ConfigMap in the `kubevirt` namespace and restart the virt-operator pods. The operator regenerates the strategy, this time detecting the monitoring resources, and creates the ServiceMonitor.

Source: `pkg/virt-operator/resource/generate/install/strategy.go` (lines 353-368, 520-530)

## What the console shows

The Virtualization dashboard in the console uses Prometheus queries against KubeVirt's metrics (path 2). These give VM-level granularity: per-vCPU usage, guest memory balloon stats, per-disk IOPS, per-NIC throughput.

Without the monitoring stack, the dashboard graphs will be empty even though the VMs are running fine.

## The chain

```
QEMU/KVM
  │
  │ (QMP: query-stats, balloon, blockstats)
  ▼
virtqemud
  │
  │ (libvirt API: ConnectGetAllDomainStats, MemoryStats)
  ▼
virt-launcher (caches stats every 3.25s)
  │
  │ (gRPC: GetDomainStats)
  ▼
virt-handler
  │
  │ (Prometheus metrics endpoint)
  ▼
Prometheus (scrapes virt-handler)
  │
  │ (PromQL queries)
  ▼
OpenShift console dashboard
```

## Key code paths

| File | What it does |
|------|-------------|
| `pkg/virt-launcher/virtwrap/manager.go:2304` | `getDomainStats()`: collects 6 stat types from libvirt |
| `pkg/virt-launcher/virtwrap/cli/libvirt.go:320` | `GetDomainStats()`: calls libvirt, converts to internal stats structs |
| `pkg/virt-launcher/virtwrap/cmd-server/server.go:504` | `GetDomainStats` gRPC handler |
| `pkg/virt-handler/cmd-client/client.go:561` | `GetDomainStats()` gRPC client |
| `pkg/monitoring/` | Prometheus metric definitions and collectors |
