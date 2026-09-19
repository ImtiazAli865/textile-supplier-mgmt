import { listProducts } from "@/lib/products/service";
import { ProductFilters } from "@/components/products/product-filters";
import { ProductList } from "@/components/products/product-list";
import type { ProductStatus, ProductType } from "@/lib/products/schema";

interface ProductsPageProps {
  searchParams: Promise<{ search?: string; type?: string; status?: string }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;

  const products = await listProducts({
    search: params.search || undefined,
    type: (params.type as ProductType) || undefined,
    status: (params.status as ProductStatus) || undefined,
  });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Product Catalog</h1>
      <ProductFilters />
      <ProductList products={products} />
    </div>
  );
}
