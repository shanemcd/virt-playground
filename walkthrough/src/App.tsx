import { Navigate, Route, Routes } from "react-router-dom"
import type { MDXContent } from "mdx/types"
import { PfShell } from "./components/pf-shell"
import { HomeChapters } from "./components/home-chapters"
import { OutlineChapter } from "./components/outline-chapter"
import { ScrollycodingChapter } from "./components/scrollycoding"
import {
  allChapters,
  chapterByPath,
  legacyRedirects,
  sectionById,
} from "./curriculum"

import WhatKubevirtIs from "./content/foundations/what-kubevirt-is.mdx"
import ControlPlane from "./content/foundations/control-plane.mdx"
import NodePath from "./content/foundations/node-path.mdx"
import Isolation from "./content/foundations/isolation.mdx"
import Disks from "./content/data-plane/disks.mdx"
import Networking from "./content/data-plane/networking.mdx"
import LiveMigration from "./content/data-plane/live-migration.mdx"
import VmAndRunStrategy from "./content/lifecycle/vm-and-runstrategy.mdx"
import VirtApi from "./content/lifecycle/virt-api.mdx"
import StatusOwnership from "./content/lifecycle/status-ownership.mdx"
import OperatorAndUpdates from "./content/platform/operator-and-updates.mdx"
import Metrics from "./content/platform/metrics.mdx"
import Evacuation from "./content/platform/evacuation.mdx"
import HotplugAndDevices from "./content/platform/hotplug-and-devices.mdx"
import EcosystemMap from "./content/ecosystem/map.mdx"
import Cdi from "./content/ecosystem/cdi.mdx"
import MtvOverview from "./content/ecosystem/mtv-overview.mdx"
import MtvDataPath from "./content/ecosystem/mtv-data-path.mdx"
import WarmVsCold from "./content/ecosystem/warm-vs-cold.mdx"
import HandoffToKubevirt from "./content/ecosystem/handoff-to-kubevirt.mdx"
import TriageAndLayers from "./content/contribute/triage-and-layers.mdx"
import ApiGatesGenerate from "./content/contribute/api-gates-generate.mdx"
import TestsAndPrs from "./content/contribute/tests-and-prs.mdx"

const readyMdx: Record<string, MDXContent> = {
  "/foundations/what-kubevirt-is": WhatKubevirtIs,
  "/foundations/control-plane": ControlPlane,
  "/foundations/node-path": NodePath,
  "/foundations/isolation": Isolation,
  "/data-plane/disks": Disks,
  "/data-plane/networking": Networking,
  "/data-plane/live-migration": LiveMigration,
  "/lifecycle/vm-and-runstrategy": VmAndRunStrategy,
  "/lifecycle/virt-api": VirtApi,
  "/lifecycle/status-ownership": StatusOwnership,
  "/platform/operator-and-updates": OperatorAndUpdates,
  "/platform/metrics": Metrics,
  "/platform/evacuation": Evacuation,
  "/platform/hotplug-and-devices": HotplugAndDevices,
  "/ecosystem/map": EcosystemMap,
  "/ecosystem/cdi": Cdi,
  "/ecosystem/mtv-overview": MtvOverview,
  "/ecosystem/mtv-data-path": MtvDataPath,
  "/ecosystem/warm-vs-cold": WarmVsCold,
  "/ecosystem/handoff-to-kubevirt": HandoffToKubevirt,
  "/contribute/triage-and-layers": TriageAndLayers,
  "/contribute/api-gates-generate": ApiGatesGenerate,
  "/contribute/tests-and-prs": TestsAndPrs,
}

function ChapterPage({ href }: { href: string }) {
  const chapter = chapterByPath(href)
  const section = chapter ? sectionById(chapter.sectionId) : undefined
  if (!chapter || !section) {
    return <Navigate to="/" replace />
  }
  if (chapter.status === "outline") {
    return <OutlineChapter section={section} chapter={chapter} />
  }
  const Mdx = readyMdx[chapter.href]
  if (!Mdx) {
    return <Navigate to="/" replace />
  }
  return <ScrollycodingChapter Content={Mdx} />
}

export function App() {
  return (
    <PfShell>
      <Routes>
        <Route path="/" element={<HomeChapters />} />
        {Object.entries(legacyRedirects).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        {allChapters().map((chapter) => (
          <Route
            key={chapter.href}
            path={chapter.href}
            element={<ChapterPage href={chapter.href} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PfShell>
  )
}
