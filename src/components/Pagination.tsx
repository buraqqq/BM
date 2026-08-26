import { buildPageHref, getPageWindow } from "@/lib/pagination";

export function Pagination({
  basePath,
  params,
  page,
  totalPages,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const tokens = getPageWindow(page, totalPages);

  return (
    <nav aria-label="Sayfalama" className="pagination">
      {page > 1 && (
        <a href={buildPageHref(basePath, params, page - 1)} className="page-link page-nav" rel="prev">
          <i className="fas fa-chevron-left" /> <span>Önceki</span>
        </a>
      )}
      <div className="page-numbers">
        {tokens.map((t, i) =>
          t === "..." ? (
            <span key={`ellipsis-${i}`} className="page-ellipsis">
              …
            </span>
          ) : (
            <a
              key={t}
              href={buildPageHref(basePath, params, t)}
              className={`page-link${t === page ? " active" : ""}`}
              aria-current={t === page ? "page" : undefined}
            >
              {t}
            </a>
          )
        )}
      </div>
      {page < totalPages && (
        <a href={buildPageHref(basePath, params, page + 1)} className="page-link page-nav" rel="next">
          <span>Sonraki</span> <i className="fas fa-chevron-right" />
        </a>
      )}
    </nav>
  );
}
