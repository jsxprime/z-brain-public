import './globals.css';
import Nav from '@/components/Nav';

export const metadata = {
  title: 'Z-Brain Dashboard',
  description: 'Command center for the Z-Brain Ecosystem — memory pipeline, quarantine review, agent status.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main style={{ marginLeft: '200px', padding: '2rem 2.5rem' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
