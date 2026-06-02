# Lab 02: Create a Virtual Machine on OpenShift Virtualization

Create a Fedora VM on the CRC cluster using instance types and SSH key injection via cloud-init.

## Steps

### 1. Create a Secret with your SSH public key

```bash
oc create secret generic fedora-test-ssh-key \
  --from-literal=key="$(curl -s https://github.com/<your-username>.keys)"
```

### 2. Check available boot sources

```bash
oc get pvc -n openshift-virtualization-os-images --no-headers
```

You should see pre-imported images for Fedora, RHEL, CentOS Stream, and Windows.

### 3. Create the VM

```bash
oc apply -f - <<'EOF'
apiVersion: kubevirt.io/v1
kind: VirtualMachine
metadata:
  name: fedora-test
spec:
  dataVolumeTemplates:
    - metadata:
        name: fedora-test-volume
      spec:
        sourceRef:
          kind: DataSource
          name: fedora
          namespace: openshift-virtualization-os-images
        storage:
          resources: {}
  instancetype:
    inferFromVolume: fedora-test-volume
    inferFromVolumeFailurePolicy: Ignore
  preference:
    inferFromVolume: fedora-test-volume
    inferFromVolumeFailurePolicy: Ignore
  runStrategy: Always
  template:
    spec:
      domain:
        devices: {}
        memory:
          guest: 512Mi
        resources: {}
      terminationGracePeriodSeconds: 180
      volumes:
        - dataVolume:
            name: fedora-test-volume
          name: fedora-test-volume
        - cloudInitNoCloud:
            userData: |-
              #cloud-config
              user: fedora
          name: cloudinitdisk
      accessCredentials:
        - sshPublicKey:
            propagationMethod:
              noCloud: {}
            source:
              secret:
                secretName: fedora-test-ssh-key
EOF
```

### 4. Wait for the VM to be ready

The DataVolume clones the Fedora boot source first, then the VM boots:

```bash
oc get vm,vmi,dv --no-headers
```

Wait until the VM shows `Running`.

### 5. SSH into the VM

```bash
virtctl ssh fedora@vmi/fedora-test
```

`virtctl ssh` tunnels through the Kubernetes API server, so you don't need direct network access to the pod IP.

### 6. Verify

```bash
virtctl ssh fedora@vmi/fedora-test -c "uname -a && cat /etc/fedora-release"
```

## What just happened

The VM creation triggered this chain:

1. **DataVolume** cloned the Fedora boot source PVC from `openshift-virtualization-os-images`
2. **Instance type and preference** were inferred from labels on the DataSource
3. **virt-controller** created a VMI and a virt-launcher pod
4. **cloud-init** injected the SSH key via the `accessCredentials` mechanism (the Secret was mounted into the NoCloud datasource)
5. **virtctl ssh** connected through: kubectl API server -> virt-handler -> virt-launcher pod -> VM SSH port

### The three-object model in action

```
VirtualMachine       (persistent definition, runStrategy: Always)
  └── VirtualMachineInstance  (running instance, has IP and node assignment)
       └── Pod               (virt-launcher, hosts QEMU/virtqemud)
```

Inside the virt-launcher pod, you can see the full process tree:

```bash
oc exec <virt-launcher-pod> -- ps aux | grep -E "qemu|virt|virtqemud"
```

### The compute container's security

The virt-launcher pod's `compute` container runs as non-root (UID 107), drops all capabilities except `NET_BIND_SERVICE`, and gets access to `/dev/kvm`, `/dev/net/tun`, and `/dev/vhost-net` via the Kubernetes device plugin API (not via privileged mode).

## Cleanup

```bash
oc delete vm fedora-test
oc delete secret fedora-test-ssh-key
```

## Notes

- On CRC, DataVolumes use the `crc-csi-hostpath-provisioner` StorageClass with RWO access mode, which means live migration is not available.
- The VM runs nested: KVM inside the CRC VM which is itself a KVM guest. Performance is degraded compared to bare metal.
