import { useEffect, useRef, useState } from 'react';
import { PDFDocument, PageSizes } from 'pdf-lib';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileImage,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { downloadBlob, formatBytes } from '../utils/formatters';

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function fileToJpegBytes(fileUrl, quality) {
  const img = await loadImageElement(fileUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  canvas.width = 0;
  canvas.height = 0;
  return { bytes, width: img.naturalWidth, height: img.naturalHeight };
}

export default function ImagesToPdf() {
  const [items, setItems] = useState([]);
  const [pageSize, setPageSize] = useState('A4');
  const [orientation, setOrientation] = useState('auto');
  const [margin, setMargin] = useState(20);
  const [qualityMode, setQualityMode] = useState('optimized');
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  function addFiles(fileList) {
    const valid = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) {
      setError('Iltimos, faqat rasm fayllarini (JPG, PNG, WebP) tanlang.');
      return;
    }
    setError('');
    setResult(null);

    const newItems = valid.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function moveItem(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setResult(null);
  }

  function removeItem(id) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
    setResult(null);
  }

  function clearAll() {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
    setResult(null);
    setError('');
  }

  async function handleBuildPdf() {
    if (items.length === 0) return;
    setBuilding(true);
    setError('');
    setResult(null);

    try {
      const pdfDoc = await PDFDocument.create();

      for (const item of items) {
        let embedded;
        const isPng = item.file.type === 'image/png';
        const isJpg = item.file.type === 'image/jpeg' || item.file.type === 'image/jpg';

        if (qualityMode === 'original' && (isPng || isJpg)) {
          const rawBytes = new Uint8Array(await item.file.arrayBuffer());
          embedded = isPng ? await pdfDoc.embedPng(rawBytes) : await pdfDoc.embedJpg(rawBytes);
        } else {
          const q = qualityMode === 'optimized' ? 0.82 : 0.92;
          const { bytes } = await fileToJpegBytes(item.url, q);
          embedded = await pdfDoc.embedJpg(bytes);
        }

        const imgW = embedded.width;
        const imgH = embedded.height;

        let pW;
        let pH;

        if (pageSize === 'original') {
          pW = imgW + margin * 2;
          pH = imgH + margin * 2;
        } else {
          const base = pageSize === 'Letter' ? PageSizes.Letter : PageSizes.A4;
          const isImgLandscape = imgW > imgH;
          const useLandscape =
            orientation === 'landscape' || (orientation === 'auto' && isImgLandscape);
          pW = useLandscape ? base[1] : base[0];
          pH = useLandscape ? base[0] : base[1];
        }

        const page = pdfDoc.addPage([pW, pH]);
        const availW = Math.max(10, pW - margin * 2);
        const availH = Math.max(10, pH - margin * 2);
        const ratio = Math.min(availW / imgW, availH / imgH);
        const drawW = imgW * ratio;
        const drawH = imgH * ratio;

        page.drawImage(embedded, {
          x: (pW - drawW) / 2,
          y: (pH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      }

      const bytes = await pdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const filename = `rasmlar_${items.length}ta.pdf`;
      setResult({ blob, filename, size: blob.size });
    } catch (err) {
      console.error(err);
      setError('Rasmlarni PDFga birlashtirishda xatolik yuz berdi.');
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Rasmlarni PDF qilish</h2>
        <p className="card-desc">
          JPG, PNG, WebP rasmlarni tartiblang va bir zumda bitta PDF hujjatga birlashtiring.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {items.length === 0 ? (
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
        >
          <div className="dropzone-icon">
            <Upload size={26} />
          </div>
          <p className="dropzone-title">Rasmlarni shu yerga tashlang yoki tanlang</p>
          <p className="dropzone-hint">Bir nechta rasmni birdaniga tanlash mumkin (JPG, PNG, WebP)</p>
        </div>
      ) : (
        <>
          <div className="options-grid">
            <div className="field-group">
              <label>Sahifa o‘lchami</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(e.target.value);
                  setResult(null);
                }}
              >
                <option value="A4">A4 (Standart)</option>
                <option value="Letter">Letter</option>
                <option value="original">Rasm o‘lchamiga mos</option>
              </select>
            </div>

            <div className="field-group">
              <label>Yo‘nalish</label>
              <select
                value={orientation}
                disabled={pageSize === 'original'}
                onChange={(e) => {
                  setOrientation(e.target.value);
                  setResult(null);
                }}
              >
                <option value="auto">Avtomatik (rasmga qarab)</option>
                <option value="portrait">Portret (Tik)</option>
                <option value="landscape">Albom (Yotiq)</option>
              </select>
            </div>

            <div className="field-group">
              <label>Chegara (Margin)</label>
              <select
                value={margin}
                onChange={(e) => {
                  setMargin(Number(e.target.value));
                  setResult(null);
                }}
              >
                <option value={0}>Chegarasiz (0 px)</option>
                <option value={20}>Kichik chegara</option>
                <option value={40}>Katta chegara</option>
              </select>
            </div>

            <div className="field-group">
              <label>Sifat va hajm</label>
              <select
                value={qualityMode}
                onChange={(e) => {
                  setQualityMode(e.target.value);
                  setResult(null);
                }}
              >
                <option value="optimized">Optimizatsiya (kichikroq PDF)</option>
                <option value="original">Asl rasm sifati</option>
              </select>
            </div>
          </div>

          <div className="images-grid">
            {items.map((item, idx) => (
              <div key={item.id} className="image-tile">
                <div className="image-thumb-wrap">
                  <img src={item.url} alt={item.file.name} />
                  <span className="image-index">#{idx + 1}</span>
                </div>
                <div className="image-tile-footer">
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="icon-mini-btn"
                      onClick={() => moveItem(idx, -1)}
                      disabled={idx === 0}
                      title="Chapga surish"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-mini-btn"
                      onClick={() => moveItem(idx, 1)}
                      disabled={idx === items.length - 1}
                      title="O‘ngga surish"
                    >
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="icon-mini-btn danger"
                    onClick={() => removeItem(item.id)}
                    title="O‘chirish"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {result && (
            <div className="alert alert-success">
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>PDF tayyor!</strong> {items.length} ta rasm birlashtirildi — hajmi:{' '}
                <strong>{formatBytes(result.size)}</strong>.
              </div>
            </div>
          )}

          <div className="actions-row">
            <button className="btn btn-primary" onClick={handleBuildPdf} disabled={building}>
              <FileImage size={18} />
              {building ? 'Yaratilmoqda...' : 'PDF yaratish'}
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={building}
            >
              <Plus size={18} />
              Yana rasm qo‘shish
            </button>

            <button className="btn btn-ghost-danger" onClick={clearAll} disabled={building}>
              <Trash2 size={16} />
              Tozalash
            </button>

            {result && !building && (
              <button
                className="btn btn-success"
                onClick={() => downloadBlob(result.blob, result.filename)}
              >
                <Download size={18} />
                Yuklab olish ({formatBytes(result.size)})
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
