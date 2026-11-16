import { notFound } from "next/navigation";
import { SimulatorPage } from "@/components/pages/SimulatorPage";
import { IDIOMS, getScene } from "@/lib/idioms";

export const dynamicParams = false; // only /idioms/1 … /idioms/8

export function generateStaticParams() {
  return IDIOMS.map((s) => ({ scene: String(s.id - 100) }));
}

export default async function IdiomPage(props: PageProps<"/idioms/[scene]">) {
  const { scene } = await props.params;
  const config = getScene(100 + Number(scene));
  if (!config) notFound();
  return <SimulatorPage key={config.id} config={config} />;
}
