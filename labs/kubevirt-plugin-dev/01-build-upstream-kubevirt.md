# 01 - Build Upstream KubeVirt

Build all KubeVirt component images from the main branch and push them to your own registry.

## Why build from source?

The VEP-190 plugin framework is alpha, targeting v1.9. It's on main but not in any downstream release (CNV). To use it, we need upstream KubeVirt built from source.

## Prerequisites

KubeVirt's build system uses a containerized builder image. You need a working container runtime (podman or docker). On Fedora Silverblue/Atomic, use toolbox since the host filesystem is immutable.

```bash
toolbox create
toolbox enter
sudo dnf install -y golang podman
```

## Build and push

The build is driven by `make` targets that run inside a builder container via `hack/dockerized`. Set your registry prefix and tag:

```bash
cd ~/github/kubevirt/kubevirt
git checkout main && git pull

export DOCKER_PREFIX=quay.io/youruser
export DOCKER_TAG=dev
```

Build and push all images:

```bash
make bazel-push-images
```

This builds ~30 container images including:
- `virt-operator`, `virt-api`, `virt-controller`, `virt-handler`, `virt-launcher` (core)
- `sidecar-shim`, `example-node-hook-plugin` (plugin support)
- `virtio-container-disk`, various test/demo images

The build takes 10-20 minutes on first run (pulling the builder image, compiling everything with Bazel). Subsequent builds are faster due to caching.

Then generate the deployment manifests:

```bash
make manifests
```

This produces YAML in `_out/manifests/release/`:
- `kubevirt-operator.yaml` - the operator deployment
- `kubevirt-cr.yaml` - the KubeVirt custom resource
- `kubevirt-network-policies.yaml` - optional network policies

## Make images public

New repos on quay.io default to private. Every image needs to be public for CRC to pull them. There are ~30 images to flip. The quay.io API requires an OAuth token (only available to organizations), so for a personal account you need to do this through the UI or browser automation.

## What got built

The key images for plugin development:

| Image | Purpose |
|-------|---------|
| `virt-operator` | Manages the KubeVirt deployment, reconciles the KubeVirt CR |
| `virt-handler` | DaemonSet on each node, manages VM lifecycle, calls plugins |
| `virt-launcher` | Per-VM pod, runs QEMU/libvirt |
| `example-node-hook-plugin` | Reference NodeHook plugin, good starting point |

## Gotchas

- **virt-template-apiserver/controller**: The manifests reference `quay.io/youruser/virt-template-*:v0.2.2`. These come from the [common-templates](https://github.com/kubevirt/common-templates) project and aren't built by KubeVirt. Pull them from `quay.io/kubevirt/` and re-tag:
  ```bash
  podman pull quay.io/kubevirt/virt-template-apiserver:v0.2.2
  podman tag quay.io/kubevirt/virt-template-apiserver:v0.2.2 quay.io/youruser/virt-template-apiserver:v0.2.2
  podman push quay.io/youruser/virt-template-apiserver:v0.2.2
  # Same for virt-template-controller
  ```

- **Go version mismatch**: If using a `golang:1.24` Docker image but your local Go is 1.26+, `go.mod` will require 1.26 and the Docker build fails. Use a Fedora base image for the builder stage instead, which ships the matching Go version.

- **Toolbox + podman**: Inside toolbox, podman needs an interactive login shell (`toolbox run zsh -il -c "..."`) or it fails to initialize the user namespace.
