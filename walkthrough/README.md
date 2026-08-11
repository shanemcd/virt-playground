# KubeVirt ecosystem for maintainers

Interactive [PatternFly](https://www.patternfly.org/) + [Code Hike](https://codehike.org/) + [Mermaid](https://mermaid.js.org/) site for upstream KubeVirt and sibling projects (CDI, MTV/Forklift, packaging). Built with Vite.

## Run

```bash
cd walkthrough
npm install
npm run dev
```

Open [http://localhost:3010](http://localhost:3010).

## Tracks

**Curriculum** — linear sections (`src/curriculum.ts`), chapter URLs `/<section>/<chapter>`. Hub at `/curriculum`.

**Walkthroughs** — cross-cutting deep dives (`src/walkthroughs.ts`, content under `src/content/walkthroughs/`) at `/walkthroughs/<id>`.

| Curriculum section | Chapters |
|--------------------|----------|
| Foundations | What KubeVirt is · Control plane · Node path · Isolation |
| Data plane | Disks · Networking · Live migration |
| Lifecycle & API | VM/RunStrategy · virt-api · Status ownership |
| Platform ops | Operator/updates · Metrics · Evacuation · Hotplug/devices |
| Ecosystem | Map · CDI · MTV overview · MTV data path · Warm vs cold · Hand-off |
| Contributing | Triage · API/gates/generate · Tests & PRs |

Legacy flat paths (`/intro`, `/control-plane`, `/node-path`, `/making-changes`) redirect into the curriculum.

Content lives under `src/content/<section>/*.mdx`. Use ` ```mermaid ` fences for diagrams and normal language tags for code.
