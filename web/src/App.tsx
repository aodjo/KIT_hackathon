import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Articles from './pages/Articles';
import Article from './pages/Article';

/**
 * Scroll window to top on route change.
 * @return null
 */
function ScrollToTop() {
  /** 현재 라우트 경로명 */
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * App root with client-side routing.
 * @return root element
 */
export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/date/:date" element={<Articles />} />
        <Route path="/articles/:slug" element={<Article />} />
      </Routes>
    </>
  );
}
