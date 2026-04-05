import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Articles from './pages/Articles';
import Article from './pages/Article';

/**
 * App root with client-side routing.
 * @return root element
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/articles" element={<Articles />} />
      <Route path="/articles/date/:date" element={<Articles />} />
      <Route path="/articles/:slug" element={<Article />} />
    </Routes>
  );
}
