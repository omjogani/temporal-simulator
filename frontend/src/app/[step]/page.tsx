import { notFound } from "next/navigation";
import { SimulatorPage } from "@/components/pages/SimulatorPage";
import { STEPS, getStep } from "@/lib/steps";

export const dynamicParams = false; // only /1 … /5

export function generateStaticParams() {
  return STEPS.map((s) => ({ step: String(s.id) }));
}

export default async function StepPage(props: PageProps<"/[step]">) {
  const { step } = await props.params;
  const id = Number(step);
  const config = getStep(id);
  if (!config) notFound();
  return <SimulatorPage key={id} config={config} />;
}
