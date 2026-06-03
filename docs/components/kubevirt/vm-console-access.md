# VM Console Access

How the serial and VNC console in the OpenShift UI reaches the QEMU process inside a virt-launcher pod.

TODO: Trace the full proxy chain from browser to QEMU socket.

Expected path:
```
Browser (WebSocket)
  │
  ▼
OpenShift console (proxy)
  │
  ▼
kube-apiserver
  │
  ▼
virt-api (subresource endpoint: /console, /vnc)
  │
  ▼
virt-handler
  │
  ▼
virt-launcher (Unix socket to QEMU serial/VNC)
```

Questions to answer:
- Where do the WebSocket upgrades happen?
- What subresource endpoints does virt-api serve for console/VNC?
- How does virt-handler proxy the connection to the launcher?
- What QEMU sockets are involved (chardev for serial, VNC unix socket)?
- How does virtctl console/vnc differ from the browser path?
- Security context: who is allowed to connect?
