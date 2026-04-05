import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import Layers from '../components/Layers';

/**
 * Landing page
 * @return page element
 */
export default function Landing() {
  return (
    <div className="min-h-screen bg-paper-grain">
      <Navbar />
      <main>
        <Hero />
        <Layers />
      </main>
    </div>
  );
}
