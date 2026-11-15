import { useState } from 'react';
import { FileImage, FileStack, FileType2, Gauge, ShieldCheck } from 'lucide-react';
import PdfCompressor from './components/PdfCompressor';
import ImagesToPdf from './components/ImagesToPdf';
import WordToPdf from './components/WordToPdf';

const TABS = [
  { id: 'compress', label: 'PDF Siqish', icon: Gauge },
  { id: 'images', label: 'Rasmlar → PDF', icon: FileImage },
  { id: 'word', label: 'Word → PDF', icon: FileType2 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('compress');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon">
              <FileStack size={22} />
            </div>
            <div>
              <h1 className="brand-title">PDFmin</h1>
              <p className="brand-sub">Siqish • Rasm → PDF • Word → PDF</p>
            </div>
          </div>

          <div className="offline-badge">
            <ShieldCheck size={16} />
            100% Brauzerda • Fayllar serverga ketmaydi
          </div>
        </div>
      </header>

      <main className="main-container">
        <nav className="tabs-bar" aria-label="Asosiy bo'limlar">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {activeTab === 'compress' && <PdfCompressor />}
        {activeTab === 'images' && <ImagesToPdf />}
        {activeTab === 'word' && <WordToPdf />}
      </main>

      <footer className="app-footer">
        PDFmin — Sekin internetda ham tezkor va xavfsiz ishlaydi (Client-side Web App)
      </footer>
    </div>
  );
}
