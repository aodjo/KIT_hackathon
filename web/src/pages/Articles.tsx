import { Link, useParams } from 'react-router-dom';
import { loadAllArticles } from '../lib/articles';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

/**
 * Articles index page listing all posts grouped by date.
 * @return articles list page element
 */
export default function Articles() {
  /** URL에서 추출한 날짜 필터 (예: 2026-04-06) */
  const { date: dateFilter } = useParams<{ date?: string }>();
  /** 날짜 내림차순으로 정렬된 전체 아티클 메타 목록 */
  const allArticles = loadAllArticles();
  /** 필터 적용 후 최종 아티클 목록 */
  const articles = dateFilter
    ? allArticles.filter((a) => a.date === dateFilter)
    : allArticles;

  /** 날짜별로 묶인 아티클 그룹 (순차 처리로 정렬 유지) */
  const groups: Array<[string, typeof articles]> = [];
  for (const article of articles) {
    const last = groups[groups.length - 1];
    if (last && last[0] === article.date) {
      last[1].push(article);
    } else {
      groups.push([article.date, [article]]);
    }
  }

  return (
    <div className="min-h-screen bg-paper-grain">
      <Navbar />
      <main>
        <div className="mx-auto max-w-5xl px-6 lg:px-10 py-20 lg:py-28">
          <div className="mb-20">
            <nav className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] font-medium font-mono text-clay-deep">
              {dateFilter ? (
                <>
                  <Link to="/articles" className="hover:text-ink transition-colors">Articles</Link>
                  <span className="opacity-50">/</span>
                  <span className="text-ink">{dateFilter}</span>
                </>
              ) : (
                <span>Articles</span>
              )}
            </nav>
            <h1 className="mt-4 font-display text-[56px] leading-[1.05] tracking-tight-display text-ink lg:text-[72px]">
              아티클
            </h1>
            {!dateFilter && (
              <p className="mt-6 font-display text-[19px] leading-[1.55] text-ink-muted max-w-2xl">
                Echo의 제품 철학, 리서치 근거, 개발 노트를 모았습니다.
              </p>
            )}
          </div>

          {groups.length === 0 ? (
            <p className="font-display text-[18px] text-ink-muted">
              아직 작성된 글이 없습니다.
            </p>
          ) : (
            <div className="border-b border-grain">
              {groups.map(([date, items]) => (
                <div
                  key={date}
                  className="border-t border-grain py-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10"
                >
                  <div className="lg:col-span-3">
                    <Link
                      to={`/articles/date/${date}`}
                      className="text-[11px] text-ink-muted font-mono hover:text-ink transition-colors"
                    >
                      {date}
                    </Link>
                  </div>
                  <div className="lg:col-span-9 space-y-10">
                    {items.map((article) => (
                      <Link
                        to={`/articles/${article.slug}`}
                        key={article.slug}
                        className="group block"
                      >
                        <article>
                          <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
                            {article.category}
                          </span>
                          <h2 className="mt-2 font-display text-[28px] leading-[1.15] tracking-tight-display text-ink group-hover:text-clay-deep transition-colors lg:text-[36px]">
                            {article.title}
                          </h2>
                          {article.excerpt && (
                            <p className="mt-4 font-display text-[17px] leading-[1.55] text-ink-muted max-w-2xl">
                              {article.excerpt}
                            </p>
                          )}
                        </article>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
