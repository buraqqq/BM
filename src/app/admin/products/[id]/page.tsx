import { ProductForm } from "@/components/ProductForm";

export default function EditProductPage({ params }: { params: { id: string } }) {
  return (
    <div className="admin-container">
      <ProductForm productId={params.id} />
    </div>
  );
}
