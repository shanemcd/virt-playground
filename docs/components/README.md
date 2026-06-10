# Components

Deep dives into each upstream project's containers, codebases, and runtime behavior. Organized by repo.

## Projects

| Project               | Repo                                                                                              | What it does                                                  | Status              |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------- |
| [KubeVirt](kubevirt/) | [kubevirt/kubevirt](https://github.com/kubevirt/kubevirt)                                         | Core VM runtime: operator, API, controller, handler, launcher | Deployed and traced |
| [CDI](cdi/)           | [kubevirt/containerized-data-importer](https://github.com/kubevirt/containerized-data-importer)   | VM disk lifecycle: import, upload, clone, golden images        | Deployed and traced |
| [MTV](mtv/)           | [kubev2v/forklift](https://github.com/kubev2v/forklift)                                           | Bulk VM migration from external hypervisors to OCP Virt       | Deployed and traced |
| [Console Plugin](kubevirt-plugin/) | [kubevirt-ui/kubevirt-plugin](https://github.com/kubevirt-ui/kubevirt-plugin)          | Virtualization section in the OpenShift console sidebar        | Deployed            |
