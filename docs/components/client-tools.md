# Client Tools: virtctl and oc

Both `oc` and `virtctl` are Kubernetes API clients that talk directly to the API server using the same kubeconfig (same credentials, same endpoint). They are independent binaries. `virtctl` does not wrap or call `oc`.

For standard CRUD operations on Kubernetes resources (creating, deleting, listing VMs), `oc` works fine. `virtctl` exists for operations that require KubeVirt-specific subresource endpoints:

| Command | What it does | Why oc can't do it |
|---------|-------------|-------------------|
| `virtctl ssh` | SSH tunnel through the API server to the VM's pod | Proxies through virt-api/virt-handler, no direct pod network access needed |
| `virtctl console` | Serial console via the VMI `/console` subresource | Streaming subresource, not a standard REST call |
| `virtctl vnc` | VNC connection to the VM display | Streaming subresource |
| `virtctl start/stop/restart` | Lifecycle transitions via VMI subresources | Could be done with `oc patch` on the run strategy, but this is simpler |
| `virtctl create vm` | Generate VM manifests with sensible defaults | Convenience, the output is standard YAML you could write by hand |

## SSH tunnel path

`virtctl ssh` makes an API request to the Kubernetes API server, which proxies the connection through to virt-handler on the node, which connects to the virt-launcher pod's SSH port. The SSH traffic tunnels through the API server rather than requiring direct network access to the pod IP.
