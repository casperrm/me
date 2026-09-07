import Link from "next/link";

export function Pagination({
  basePath,
  page,
  totalPages,
  totalCount,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500">
      <span>
        Page {page} of {totalPages} ({totalCount} total)
      </span>
      <div className="flex gap-3">
        {page > 1 ? (
          <Link href={`${basePath}?page=${page - 1}`} className="text-cedar-700 hover:underline">
            ← Newer
          </Link>
        ) : (
          <span className="text-neutral-300">← Newer</span>
        )}
        {page < totalPages ? (
          <Link href={`${basePath}?page=${page + 1}`} className="text-cedar-700 hover:underline">
            Older →
          </Link>
        ) : (
          <span className="text-neutral-300">Older →</span>
        )}
      </div>
    </div>
  );
}
