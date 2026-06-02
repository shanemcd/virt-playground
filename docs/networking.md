# Networking

How VMs get network connectivity in KubeVirt. Networking operates in three layers: host connectivity (physical infrastructure), host-to-pod connectivity (CNI plugins), and pod-to-VM connectivity (network binding, where KubeVirt connects the VM's guest NIC to the pod's network interface).

## Pod Network Bindings

Every VM can connect to the pod network (the same network all Kubernetes pods use). The binding mode determines how the VM's guest NIC maps to the pod's network interface.

### Masquerade (Recommended Default)

KubeVirt allocates an internal IP to the VM (typically 10.0.2.2) and hides it behind NAT inside the virt-launcher pod. Outgoing traffic is source-NAT'd to the pod's cluster IP. Incoming cluster traffic targets the pod IP.

Key properties:
- Supports live migration (the NAT'd internal IP stays the same even when the pod moves)
- VMs are reachable via Kubernetes Services
- NetworkPolicies apply normally
- The guest sees an internal IP, not the pod IP

### Bridge

The VM sees and uses the pod IP directly. However:
- Does NOT support live migration (the pod IP changes when the pod moves to a new node)
- Some CNI plugins may not support custom MAC addresses
- Generally not recommended for production workloads that need migration

### Passt

A newer option that applies NAT automatically when passing traffic to/from the guest. Provides connectivity despite the pod IP / guest IP discrepancy. Supports live migration.

## Secondary Networks via Multus

Kubernetes natively supports only one CNI plugin and one network interface per pod. Multus is a "meta-CNI" that allows multiple network interfaces per pod.

Multus introduces the **NetworkAttachmentDefinition (NAD)** CRD, which has become the de facto standard for attaching pods to additional networks. A VM can have both a default pod network interface (masquerade) and one or more secondary interfaces provided by Multus. Alternatively, a Multus network can be the VM's only network.

### Linux Bridge CNI (via Multus)

Creates a secondary NIC in the pod and attaches it to a Linux bridge on the node, providing L2 connectivity to a specific physical NIC.

The workflow:
1. A Linux bridge is configured on nodes with one port on a secondary NIC
2. A NetworkAttachmentDefinition references this bridge
3. The `bridge-marker` component inspects node networking and marks nodes that have the correct bridge, ensuring pods are only scheduled to compatible nodes
4. VLAN tagging is supported at the NAD level for traffic isolation

### SR-IOV

Provides the highest performance by passing physical NIC Virtual Functions (VFs) directly to the VM via VFIO passthrough. PCI devices are exposed directly to the guest, bypassing the host kernel networking stack entirely.

Requirements:
- The SR-IOV operator deploys and configures SR-IOV components
- An `SriovNetworkNodePolicy` defines which VFs to expose
- VFs must use `deviceType: vfio-pci`
- A NetworkAttachmentDefinition references the SR-IOV resource
- The VM spec uses `sriov: {}` binding

SR-IOV supports live migration. Network interface hotplug is supported for both bridge and SR-IOV bindings (SR-IOV hotplug is limited to migration-based hotplug due to Kubernetes device plugin API limitations).

## Comparison to Pod Networking

Regular pods get a single network interface with an IP from the cluster CNI, and everything is L3 (IP-based). VMs often need more:

- **L2 connectivity**: Protocols that rely on broadcast, ARP, or specific MAC addresses need bridge or SR-IOV networks
- **Multiple NICs**: Separation of management, data, and storage traffic requires Multus
- **Direct hardware access**: High-performance networking requires SR-IOV, bypassing the host kernel entirely

With masquerade binding, a VM behaves like a regular pod from the cluster's perspective: reachable via Services, subject to NetworkPolicies, assigned a cluster IP. The VM's L2 needs are met through secondary networks attached via Multus.
