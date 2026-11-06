import { notFound } from "next/navigation";
import { SimulatorPage } from "@/components/pages/SimulatorPage";
import { STEPS } from "@/lib/steps";

export const dynamicParams = false; // only /1 … /6

export function generateStaticParams() {
  return STEPS.map((s) => ({ step: String(s.id) }));
}

export default async function StepPage(props: PageProps<"/[step]">) {
  const { step } = await props.params;
  const id = Number(step);
  if (!STEPS.some((s) => s.id === id)) notFound();
  return <SimulatorPage key={id} stepId={id} />;
}
