# Lab 01: Start CRC MicroShift

Create a sized MicroShift CRC instance and get a working `oc` kubeconfig.

## Why MicroShift

CRC's `microshift` preset is lighter than full OpenShift: single-node Kubernetes with a subset of OpenShift APIs. It is enough to run KubeVirt, but **not** enough for the productized console operator, OAuth login, or cluster monitoring.

## Steps

### 1. Size the VM

Defaults (2 CPU / 4 GB / 35 GB) are too small for HCO + console + Tailscale. Values used in this lab:

```bash
crc config set preset microshift
crc config set cpus 16
crc config set memory 40960
crc config set disk-size 200
```

Preset cannot be changed on an existing instance — `crc delete` first if you already have a cluster on another preset.

### 2. Free host port 443

CRC binds host `:443`. If Tailscale Serve (or anything else) already owns it, start fails.

```bash
sudo tailscale serve reset
# confirm nothing listens on 443
ss -tlnp | grep ':443' || echo 'port 443 free'
```

Do not re-enable host Tailscale Serve on 443 while this CRC is running. Remote access later goes through the **in-cluster** Tailscale operator instead.

### 3. Start CRC

```bash
crc setup
crc start -p /path/to/pull-secret
```

### 4. Configure `oc`

```bash
eval $(crc oc-env)
oc get nodes
```

MicroShift has no OpenShift OAuth user/project login flow. CRC writes a kubeconfig that `crc oc-env` points at.

### 5. SSH into the guest (optional)

Useful for debugging the ostree VM:

```bash
ssh -i ~/.crc/machines/crc/id_ed25519 -p 2222 core@127.0.0.1
```

### 6. Nested virtualization

KubeVirt needs nested virt in the CRC VM. Confirm on the host and that the guest can use it:

```bash
# host
cat /sys/module/kvm_intel/parameters/nested   # or kvm_amd
# expect Y / 1
```

## Environment recorded

```
CRC preset: microshift
OpenShift / MicroShift: 4.22.0
CPUs: 16
Memory: 40960 MiB
Disk: 200 GiB
```

## Next

[02 - OLM and KubeVirt](02-olm-and-kubevirt.md)
