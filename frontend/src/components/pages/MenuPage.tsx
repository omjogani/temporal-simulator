"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScenarioMenu } from "@/components/organisms/ScenarioMenu";
import { IDIOMS_CARD } from "@/lib/idioms";
import { STEPS } from "@/lib/steps";

const CARTS = [...STEPS, IDIOMS_CARD];

/** `/`: pick a step from the cartridge menu. ← → choose, Enter starts, 1-5 jump straight in, 6 selects Idioms. */
export function MenuPage() {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const start = (id: number) => router.push(id === IDIOMS_CARD.id ? "/idioms/1" : `/${id}`);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") setSelected((s) => Math.max(0, s - 1));
      else if (e.key === "ArrowRight") setSelected((s) => Math.min(CARTS.length - 1, s + 1));
      else if (e.key === "Enter") {
        if (e.target instanceof HTMLButtonElement) return; // the focused button handles it
        router.push(CARTS[selected].id === IDIOMS_CARD.id ? "/idioms/1" : `/${CARTS[selected].id}`);
      } else if (e.key === "6") setSelected(STEPS.length);
      else if (/^[1-9]$/.test(e.key) && STEPS.some((s) => s.id === Number(e.key))) router.push(`/${e.key}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, selected]);

  return <ScenarioMenu steps={CARTS} selected={selected} onSelect={setSelected} onStart={start} />;
}
