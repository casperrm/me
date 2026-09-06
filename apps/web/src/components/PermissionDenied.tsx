export function PermissionDenied({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="text-sm font-semibold text-amber-800">You don&apos;t have access to this</h2>
      <p className="mt-1 text-sm text-amber-700">
        {message ?? "Ask an owner or admin to grant you the permission this page needs."}
      </p>
    </div>
  );
}
