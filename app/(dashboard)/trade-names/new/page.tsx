import { TradeNameForm } from "@/components/trade-names/trade-name-form";

export default function NewTradeNamePage() {
  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Add Trade Name</h1>
      <TradeNameForm mode="create" />
    </div>
  );
}
