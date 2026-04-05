import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Article from './pages/Article';

/**
 * App root with client-side routing.
 * @return root element
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/articles/:slug" element={<Article />} />
    </Routes>
  );
}
