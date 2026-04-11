import { useParams, Link } from 'react-router-dom';
import { loadArticle } from '../lib/articles';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

/**
 * Article detail page rendered from markdown source.
 * @return article page element
 */
export default function Article() {
  /** URL 경로에서 추출한 슬러그 */
  const { slug } = useParams<{ slug: string }>();
  /** 슬러그로 로드한 아티클 데이터 */
  const article = slug ? loadArticle(slug) : null;

  if (!article) {
    return (
      <div className="min-h-screen bg-paper-grain flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <span className="text-[10px] uppercase tracking-[0.14em] text-clay-deep font-mono">
              404
            </span>
            <h1 className="mt-4 font-display text-[44px] lg:text-[56px] leading-[1.1] text-ink">
              글을 찾을 수 없습니다
            </h1>
            <Link
              to="/"
              className="mt-8 inline-flex items-center gap-1.5 h-9 text-[13px] leading-none font-medium text-paper bg-ink hover:bg-ink-soft transition-colors px-5 rounded-full"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-grain">
      <Navbar />
      <main>
        <article className="mx-auto max-w-5xl px-6 lg:px-10 py-20 lg:py-28">
          <div className="mb-12 pb-12 border-b border-grain">
            <nav
              className="flex items-center gap-2 overflow-hidden text-[10px] uppercase tracking-[0.14em] font-medium font-mono text-clay-deep"
              aria-label="breadcrumb"
            >
              <Link to="/articles" className="hover:text-ink transition-colors shrink-0">Articles</Link>
              <span className="opacity-50 shrink-0">/</span>
              <Link to={`/articles/date/${article.date}`} className="hover:text-ink transition-colors shrink-0">
                {article.date}
              </Link>
              <span className="opacity-50 shrink-0">/</span>
              <span className="text-ink truncate">{article.slug}</span>
            </nav>
            <div className="mt-8 text-[10px] uppercase tracking-[0.14em] text-clay-deep font-medium font-mono">
              {article.category}
            </div>
            <h1 className="mt-1.5 font-display text-[44px] leading-[1.1] tracking-tight-display text-ink text-balance lg:text-[64px]">
              {article.title}
            </h1>
            {article.excerpt && (
              <p className="mt-6 font-display text-[19px] leading-[1.55] text-ink-muted text-pretty max-w-3xl">
                {article.excerpt}
              </p>
            )}
          </div>
          <div
            className="font-display text-[18px] leading-[1.75] text-ink-soft [&>h2]:font-display [&>h2]:text-[28px] [&>h2]:leading-[1.2] [&>h2]:tracking-tight-display [&>h2]:text-ink [&>h2]:mt-14 [&>h2]:mb-4 [&>h3]:font-display [&>h3]:text-[22px] [&>h3]:text-ink [&>h3]:mt-10 [&>h3]:mb-3 [&>p]:mb-5 [&>ul]:mb-5 [&>ul]:list-disc [&>ul]:pl-6 [&_li]:mb-2 [&_a]:text-clay-deep [&_a]:underline [&_strong]:font-medium [&_strong]:text-ink [&_code]:font-mono [&_code]:text-[15px] [&_code]:bg-grain-soft [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded"
            dangerouslySetInnerHTML={{ __html: article.html }}
          />
        </article>
      </main>
      <Footer />
    </div>
  );
}
