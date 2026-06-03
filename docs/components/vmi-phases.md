# VMI Phases

The state machine a VirtualMachineInstance moves through during its lifecycle.

| Phase | Meaning |
|-------|---------|
| Pending | VMI accepted, not yet scheduled |
| Scheduling | virt-launcher pod being created |
| Scheduled | Pod placed on a node |
| Running | QEMU process active |
| Succeeded | VM shut down cleanly |
| Failed | VM crashed or error occurred |
| Unknown | State cannot be determined |
