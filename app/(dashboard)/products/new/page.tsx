import { ProductForm } from "@/components/products/product-form";

export default function NewProductPage() {
  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Add Product</h1>
      <ProductForm mode="create" />
    </div>
  );
}
