import { notFound } from "next/navigation";
import { getTradeName } from "@/lib/trade-names/service";
import { TradeNameForm } from "@/components/trade-names/trade-name-form";

interface EditTradeNamePageProps {
  params: Promise<{ tradeNameId: string }>;
}

export default async function EditTradeNamePage({ params }: EditTradeNamePageProps) {
  const { tradeNameId } = await params;
  const tradeName = await getTradeName(tradeNameId);
  if (!tradeName) notFound();

  const {
    printedName,
    printedAddress,
    ntnNumber,
    salesTaxRegistrationNumber,
    nextChallanNumber,
    nextInvoiceNumber,
  } = tradeName;

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit {tradeName.printedName}</h1>
      <TradeNameForm
        mode="edit"
        tradeNameId={tradeName.id}
        defaultValues={{
          printedName,
          printedAddress,
          ntnNumber,
          salesTaxRegistrationNumber,
          nextChallanNumber,
          nextInvoiceNumber,
        }}
      />
    </div>
  );
}
