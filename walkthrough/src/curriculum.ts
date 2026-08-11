export type ChapterStatus = "ready" | "outline"

export type FurtherReading = {
  label: string
  href: string
}

export type Chapter = {
  id: string
  sectionId: string
  title: string
  short: string
  blurb: string
  href: string
  status: ChapterStatus
  /** Learning objectives for outline chapters. */
  objectives?: string[]
  furtherReading?: FurtherReading[]
}

export type Section = {
  id: string
  title: string
  short: string
  blurb: string
  chapters: Chapter[]
}

function ch(
  sectionId: string,
  id: string,
  fields: Omit<Chapter, "id" | "sectionId" | "href">,
): Chapter {
  return {
    id,
    sectionId,
    href: `/${sectionId}/${id}`,
    ...fields,
  }
}

export const sections: Section[] = [
  {
    id: "foundations",
    title: "Foundations",
    short: "Foundations",
    blurb:
      "What KubeVirt is, how the control plane hands off to the node, and why the Pod sandbox matters.",
    chapters: [
      ch("foundations", "what-kubevirt-is", {
        title: "What KubeVirt is",
        short: "What it is",
        blurb:
          "Why it exists, VM vs VMI, major components and CRDs, and where code lives in the repo.",
        status: "ready",
      }),
      ch("foundations", "control-plane", {
        title: "Control plane",
        short: "Control plane",
        blurb:
          "VMI create and delete choreography: API, virt-controller, Pod templates, and the nodeName handoff.",
        status: "ready",
      }),
      ch("foundations", "node-path", {
        title: "Node path",
        short: "Node path",
        blurb:
          "virt-handler and virt-launcher, Cmd vs Notify, domain sync, consoles, guest agent, migration sketch.",
        status: "ready",
      }),
      ch("foundations", "isolation", {
        title: "Isolation layers",
        short: "Isolation",
        blurb:
          "From VT-x and EPT through Pod namespaces to privileged handler mounts and device plugins.",
        status: "ready",
      }),
    ],
  },
  {
    id: "data-plane",
    title: "Data plane",
    short: "Data plane",
    blurb:
      "How disks, network bindings, and live migration actually move bytes on the node.",
    chapters: [
      ch("data-plane", "disks", {
        title: "Disks",
        short: "Disks",
        blurb:
          "containerDisk vs PVC paths, CDI as the sibling that fills disks, and what QEMU opens.",
        status: "ready",
      }),
      ch("data-plane", "networking", {
        title: "Networking",
        short: "Networking",
        blurb:
          "Binding modes, Multus secondary nets, netns surgery, and what blocks live migration.",
        status: "ready",
      }),
      ch("data-plane", "live-migration", {
        title: "Live migration",
        short: "Migration",
        blurb:
          "VMIM orchestration, dual ActivePods, pre-copy convergence, RWX and binding gates.",
        status: "ready",
      }),
    ],
  },
  {
    id: "lifecycle",
    title: "Lifecycle & API",
    short: "Lifecycle",
    blurb:
      "VM RunStrategy, virt-api admission and subresources, and who may write status.",
    chapters: [
      ch("lifecycle", "vm-and-runstrategy", {
        title: "VM and RunStrategy",
        short: "RunStrategy",
        blurb:
          "How the VM controller turns desired power state into VMI create/delete and backoff.",
        status: "ready",
      }),
      ch("lifecycle", "virt-api", {
        title: "virt-api: admit then proxy",
        short: "virt-api",
        blurb:
          "Validating/mutating webhooks, subresources (console, VNC, …), and the virtctl path.",
        status: "ready",
      }),
      ch("lifecycle", "status-ownership", {
        title: "Status ownership",
        short: "Status",
        blurb:
          "Multi-writer status, Patch vs Update, and condition-list storms reviewers watch for.",
        status: "ready",
      }),
    ],
  },
  {
    id: "platform",
    title: "Platform ops",
    short: "Platform",
    blurb:
      "Operator install and updates, metrics paths, evacuation/disruption, hotplug and host devices.",
    chapters: [
      ch("platform", "operator-and-updates", {
        title: "Operator and updates",
        short: "Operator",
        blurb:
          "KubeVirt CR, component update order, RBAC skew, and the workload updater.",
        status: "ready",
      }),
      ch("platform", "metrics", {
        title: "Metrics",
        short: "Metrics",
        blurb:
          "Cgroup vs domain stats, launcher cache, handler scrape, and where series live in the tree.",
        status: "ready",
      }),
      ch("platform", "evacuation", {
        title: "Evacuation and disruption",
        short: "Evacuation",
        blurb:
          "Eviction webhook, PDBs, drain, and descheduler — cluster-ops correctness.",
        status: "ready",
      }),
      ch("platform", "hotplug-and-devices", {
        title: "Hotplug and devices",
        short: "Hotplug",
        blurb:
          "Volume hotplug attachment pods, device-manager, and DRA at a maintainer altitude.",
        status: "ready",
      }),
    ],
  },
  {
    id: "ecosystem",
    title: "Ecosystem",
    short: "Ecosystem",
    blurb:
      "Sibling projects around KubeVirt: packaging, CDI disk lifecycle, and MTV import from foreign hypervisors.",
    chapters: [
      ch("ecosystem", "map", {
        title: "Ecosystem map",
        short: "Map",
        blurb:
          "Which git repo owns what: KubeVirt, CDI, HCO and friends, MTV/Forklift — and how they meet.",
        status: "ready",
      }),
      ch("ecosystem", "cdi", {
        title: "CDI",
        short: "CDI",
        blurb:
          "DataVolumes, importer pods, upload/clone — the disk lifecycle KubeVirt does not own.",
        status: "ready",
      }),
      ch("ecosystem", "mtv-overview", {
        title: "MTV overview",
        short: "MTV",
        blurb:
          "Providers, maps, Plans, cold/warm flow — Forklift turns inventory into VirtualMachine CRs.",
        status: "ready",
      }),
      ch("ecosystem", "mtv-data-path", {
        title: "MTV data path",
        short: "Data path",
        blurb:
          "VDDK, nbdkit, populators, virt-v2v conversion — where bytes travel before KubeVirt boots.",
        status: "ready",
      }),
      ch("ecosystem", "warm-vs-cold", {
        title: "Warm vs cold",
        short: "Warm/cold",
        blurb:
          "Downtime tradeoffs, CBT, cutover — and why this is not KubeVirt live migration.",
        status: "ready",
      }),
      ch("ecosystem", "handoff-to-kubevirt", {
        title: "Hand-off to KubeVirt",
        short: "Hand-off",
        blurb:
          "When MTV’s job ends, how a VM boots, and how to triage MTV vs CDI vs KubeVirt bugs.",
        status: "ready",
      }),
    ],
  },
  {
    id: "contribute",
    title: "Contributing",
    short: "Contribute",
    blurb:
      "Triage by layer, API and generate discipline, tests, and a healthy PR.",
    chapters: [
      ch("contribute", "triage-and-layers", {
        title: "Triage and layers",
        short: "Triage",
        blurb:
          "Start from the symptom: API, controller, handler, launcher, or virt-api.",
        status: "ready",
      }),
      ch("contribute", "api-gates-generate", {
        title: "API, gates, generate",
        short: "API & generate",
        blurb:
          "API types, feature gates, hand-written vs generated, handler↔launcher protos.",
        status: "ready",
      }),
      ch("contribute", "tests-and-prs", {
        title: "Tests and PRs",
        short: "Tests & PRs",
        blurb:
          "Unit vs functional tests, libvmi builders, and upstream PR expectations.",
        status: "ready",
      }),
    ],
  },
]

/** Flat reading order across all sections. */
export function allChapters(): Chapter[] {
  return sections.flatMap((s) => s.chapters)
}

export function sectionById(id: string): Section | undefined {
  return sections.find((s) => s.id === id)
}

export function sectionOf(pathname: string): Section | null {
  const chapter = chapterByPath(pathname)
  if (!chapter) return null
  return sectionById(chapter.sectionId) ?? null
}

export function chapterByPath(pathname: string): Chapter | null {
  const normalized = pathname.replace(/\/$/, "") || "/"
  return (
    allChapters().find(
      (c) => normalized === c.href || normalized.startsWith(`${c.href}/`),
    ) ?? null
  )
}

export function chapterIndex(pathname: string): number {
  const normalized = pathname.replace(/\/$/, "") || "/"
  return allChapters().findIndex(
    (c) => normalized === c.href || normalized.startsWith(`${c.href}/`),
  )
}

export function chapterBefore(pathname: string): Chapter | null {
  const i = chapterIndex(pathname)
  if (i <= 0) return null
  return allChapters()[i - 1]
}

export function chapterAfter(pathname: string): Chapter | null {
  const chapters = allChapters()
  const i = chapterIndex(pathname)
  if (i < 0 || i >= chapters.length - 1) return null
  return chapters[i + 1]
}

/** Old flat URLs from the first walkthrough shape. */
export const legacyRedirects: Record<string, string> = {
  "/intro": "/foundations/what-kubevirt-is",
  "/control-plane": "/foundations/control-plane",
  "/node-path": "/foundations/node-path",
  "/making-changes": "/contribute/triage-and-layers",
}
