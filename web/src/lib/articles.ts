import { marked } from 'marked';

/** 아티클 프론트매터 메타데이터 */
type ArticleMeta = {
  title: string;
  slug: string;
  category: string;
  date: string;
  excerpt: string;
};

/** 파싱된 HTML 포함 아티클 */
type Article = ArticleMeta & {
  html: string;
};

/** content/articles 디렉토리의 모든 원본 마크다운 */
const rawFiles = import.meta.glob('../content/articles/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * Parse frontmatter block from raw markdown.
 * @params raw - raw markdown string with optional frontmatter
 * @return parsed meta object and body string
 */
function parseFrontmatter(raw: string): { meta: Partial<ArticleMeta>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: match[2] };
}

/**
 * Load single article by slug.
 * @params slug - article slug matching file name without extension
 * @return article with rendered html or null if not found
 */
export function loadArticle(slug: string): Article | null {
  for (const [path, raw] of Object.entries(rawFiles)) {
    const fileName = path.split('/').pop()?.replace('.md', '');
    if (fileName === slug) {
      const { meta, body } = parseFrontmatter(raw);
      return {
        title: meta.title ?? '',
        slug,
        category: meta.category ?? '',
        date: meta.date ?? '',
        excerpt: meta.excerpt ?? '',
        html: marked.parse(body) as string,
      };
    }
  }
  return null;
}

/**
 * Load all article metadata sorted by date descending.
 * @return array of article metadata
 */
export function loadAllArticles(): ArticleMeta[] {
  const list: ArticleMeta[] = [];
  for (const [path, raw] of Object.entries(rawFiles)) {
    const slug = path.split('/').pop()?.replace('.md', '') ?? '';
    const { meta } = parseFrontmatter(raw);
    list.push({
      title: meta.title ?? '',
      slug,
      category: meta.category ?? '',
      date: meta.date ?? '',
      excerpt: meta.excerpt ?? '',
    });
  }
  return list.sort((a, b) => b.date.localeCompare(a.date));
}
