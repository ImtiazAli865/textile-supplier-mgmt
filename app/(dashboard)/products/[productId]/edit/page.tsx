import { notFound } from "next/navigation";
import { getProduct } from "@/lib/products/service";
import { ProductForm } from "@/components/products/product-form";

interface EditProductPageProps {
  params: Promise<{ productId: string }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { productId } = await params;
  const product = await getProduct(productId);
  if (!product) notFound();

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit Product</h1>
      <ProductForm
        mode="edit"
        productId={product.id}
        existingType={product.type}
        currentPurchaseCost={product.currentPurchaseCost}
        defaultValues={{
          name: product.name,
          internalCode: product.internalCode ?? "",
          stockUom: product.stockUom,
          defaultSellingPrice: product.defaultSellingPrice,
          expectedYieldPerKg: product.expectedYieldPerKg ?? undefined,
          defaultLabourRatePerPacket: product.defaultLabourRatePerPacket ?? undefined,
        }}
      />
    </div>
  );
}
