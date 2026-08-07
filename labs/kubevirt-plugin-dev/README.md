# Lab: Building a KubeVirt Plugin

Build and deploy a KubeVirt NodeHook plugin on CRC using the VEP-190 plugin framework. The plugin detects outdated VirtIO drivers on Windows VMs by querying the QEMU guest agent at VM start time.

This lab covers the full dev loop: building upstream KubeVirt from source, deploying to CRC, writing a gRPC plugin, and testing it against a live VM.

## Background

[CNV-87826](https://redhat.atlassian.net/browse/CNV-87826) asks for per-VM VirtIO driver version reporting as an in-product feature. We already built a diagnostic version as a [must-gather script](https://github.com/kubevirt/must-gather/pull/240) (VIRTCE-157/160). This lab prototypes the productized version using KubeVirt's new plugin framework ([VEP-190](https://github.com/kubevirt/enhancements/tree/main/veps/sig-compute/190-kubevirt-structured-plugins)).

## What you'll need

- A Linux workstation with CRC installed and running
- Go 1.26+ (Fedora 44 ships this)
- Podman
- A quay.io account for pushing images
- Toolbox (for builds on an immutable OS like Fedora Silverblue)

## Labs

| # | Lab | What it does |
|---|-----|-------------|
| 01 | [Build Upstream KubeVirt](01-build-upstream-kubevirt.md) | Build all KubeVirt images from main and push to quay.io |
| 02 | [Deploy KubeVirt to CRC](02-deploy-kubevirt-to-crc.md) | Deploy upstream KubeVirt with the Plugins feature gate enabled |
| 03 | [Write the Plugin](03-write-the-plugin.md) | Build a NodeHook plugin that queries guest agent for VirtIO driver versions |
| 04 | [Deploy and Test](04-deploy-and-test.md) | Deploy the plugin to CRC and verify it fires on VM start |

## Architecture

```
CRC VM (OpenShift 4.21, single-node)
└── KubeVirt (upstream, built from main)
    ├── Plugins feature gate enabled
    ├── Plugin CRD (plugin.kubevirt.io/v1alpha1)
    ├── CDI (upstream v1.65.0, for ISO upload)
    │
    ├── virt-handler (DaemonSet)
    │   └── On PostVMStart, calls plugin via gRPC
    │
    ├── virt-driver-check (DaemonSet, our plugin)
    │   ├── Listens on /var/run/kubevirt/plugins/virt-driver-check.sock
    │   ├── Receives VMI JSON on PostVMStart
    │   ├── Uses client-go to exec into virt-launcher pod
    │   │   └── virsh qemu-agent-command → guest-get-devices
    │   ├── Annotates VMI with kubevirt.io/virtio-driver-versions
    │   └── Skips Linux VMs gracefully (command not supported)
    │
    └── Console plugin (kubevirt-ui/kubevirt-plugin)
        └── Adds Virtualization section to OpenShift console sidebar
```

## Key concepts

**VEP-190 Plugins** are a new extensibility mechanism in KubeVirt (alpha, v1.9). They replace the older hook-sidecar annotation approach with a proper CRD-based registration model. A Plugin CR declares what hooks it handles, and the plugin itself runs as a DaemonSet on each node, communicating with virt-handler over a gRPC Unix socket.

**NodeHooks** fire at VM lifecycle events (PreVMStart, PostVMStart, PreVMStop, PostVMStop, migration events). The plugin receives the full VMI object as JSON and the node name. Unlike DomainHooks (which mutate libvirt XML), NodeHooks perform side-effects: node configuration, metrics collection, logging.

**Why a plugin?** Dan Kenigsberg (KubeVirt architect) is pushing for a plugin-first model: features should be added as drop-in components, not modifications to the core API. This keeps KubeVirt modular and lets features ship independently. Our VirtIO driver check is a natural fit: it's a monitoring concern that doesn't need to modify VM definitions.
