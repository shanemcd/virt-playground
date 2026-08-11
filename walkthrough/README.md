# KubeVirt ecosystem for maintainers

Interactive [PatternFly](https://www.patternfly.org/) + [Code Hike](https://codehike.org/) + [Mermaid](https://mermaid.js.org/) curriculum for upstream KubeVirt and sibling projects (CDI, MTV/Forklift, packaging). Built with Vite.

## Run

```bash
cd walkthrough
npm install
npm run dev
```

Open [http://localhost:3010](http://localhost:3010).

## Curriculum

Sections and chapters are defined in `src/curriculum.ts`. URLs look like `/<section>/<chapter>`.

| Section | Chapters |
|---------|----------|
| **Foundations** | What KubeVirt is · Control plane · Node path · Isolation |
| **Data plane** | Disks · Networking · Live migration |
| **Lifecycle & API** | VM/RunStrategy · virt-api · Status ownership |
| **Platform ops** | Operator/updates · Evacuation · Hotplug/devices |
| **Ecosystem** | Map · CDI · MTV overview · MTV data path · Warm vs cold · Hand-off |
| **Contributing** | Triage · API/gates/generate · Tests & PRs |

Core sections teach `kubevirt/kubevirt`. Ecosystem sections name their own repos (`containerized-data-importer`, `kubev2v/forklift`, HCO, …).

Legacy flat paths (`/intro`, `/control-plane`, `/node-path`, `/making-changes`) redirect to the new URLs.

Content lives under `src/content/<section>/*.mdx`. Use ` ```mermaid ` fences for diagrams and normal language tags for code. Snippets are teaching excerpts, not a live checkout of the Go tree.
