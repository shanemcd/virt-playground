# Networking Fundamentals

A hands-on lab sequence teaching VM networking from kernel primitives up through KubeVirt.

## Prerequisites

- Fedora host (or any Linux system with KVM)
- Root access
- CRC cluster running (for later labs)

## Labs

| # | Lab | What You'll Learn |
|---|-----|-------------------|
| 01 | [TAP Devices and Linux Bridges](01-tap-devices-and-bridges.md) | Create virtual network interfaces, bridge them, route traffic between network namespaces |
| 02 | [QEMU Networking Modes](02-qemu-networking-modes.md) | Run VMs with different network configs, compare user-mode NAT vs TAP+bridge vs macvtap |
| 03 | [Container Networking Primitives](03-container-networking-primitives.md) | veth pairs, network namespaces, how pod networking works at the kernel level |
| 04 | [KubeVirt Binding Modes](04-kubevirt-binding-modes.md) | Masquerade, bridge, and SR-IOV bindings. Trace packet paths from inside virt-launcher pod |

## Architecture Progression

```
Kernel primitives (TAP, bridge, veth, netns)
         ↓
QEMU networking (connects guest to TAP device)
         ↓
Container networking (veth pairs, CNI)
         ↓
KubeVirt (VM inside pod, binding modes connect the two layers)
```
