# MTV Internals Resources

Links and references for deep diving on MTV components.

## Talks & Presentations

- [ ] **Fosdem NBD Kit talk** - Need to find specific URL
- [ ] **libguestfs internals** - Need to find link

## Upstream Projects

- **virt-v2v**: https://github.com/libguestfs/virt-v2v
  - 14+ years of development
  - Maintained by Red Hat
  - Used by many migration tools beyond MTV

- **NBD Kit**: https://gitlab.com/nbdkit/nbdkit
  - Toolkit for creating NBD servers
  - Plugin architecture (curl, VDDK, SSH, etc.)
  - Filter chains for transformation

- **libguestfs**: http://libguestfs.org/
  - Library for VM disk image manipulation
  - Safe, consistent, no root required
  - Fixed kernel appliance approach

## VMware Documentation

- **VDDK (Virtual Disk Development Kit)**:
  - Download from VMware developer portal
  - Version compatibility matrix
  - API reference

- **VAAI (vSphere APIs for Array Integration)**:
  - Storage offload primitives
  - Array-native copy operations
  - Vendor support matrix

- **Change Block Tracking (CBT)**:
  - Required for warm migration
  - How to enable on existing VMs
  - Performance implications

- **vmkfstools**:
  - VMFS filesystem manipulation
  - Disk copy operations
  - Storage integration

## Red Hat Documentation

- **MTV Operator**:
  - OpenShift documentation
  - Migration planning guide
  - Troubleshooting

- **CNV (OpenShift Virtualization)**:
  - VM management
  - Network configuration
  - Storage integration

## Storage Vendors

**Tested with MTV:**
- Hitachi Venterra
- NetApp
- Dell 3PAR
- Pure Storage

(Vendor-specific MTV integration guides available from respective vendors)

## Man Pages

```bash
man virt-v2v
man guestfish
man virt-customize
man nbdkit
man nbdkit-curl-plugin
man nbdkit-vddk-plugin
```

## Code Repositories

- [ ] MTV operator source (find URL)
- [ ] CNV/kubevirt source
- [ ] Example VDDK image Dockerfile

## Tools to Install

```bash
# For local experimentation
dnf install libguestfs-tools
dnf install nbdkit nbdkit-curl-plugin
dnf install virt-v2v
```

## Related Reading

- VMFS filesystem structure
- QEMU internals
- Kubernetes operator patterns
- OpenShift storage (OCS/ODF)
- Fiber channel and iSCSI basics
- Storage array architectures

## Future Topics

- Hyper-V migration (tech preview)
- Performance tuning for large-scale migrations
- Disaster recovery patterns
- Multi-cluster migrations
