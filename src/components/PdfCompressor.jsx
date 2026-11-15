import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Gauge,
  Loader2,
  Sliders,
  Trash2,
  Upload,
} from 'lucide-react';
import { pdfjsLib } from '../utils/pdfWorkerSetup';
import { calcSavingsPercent, downloadBlob, formatBytes, stripExtension } from '../utils/formatters';

const PRESETS = [
  {
    id: 'high',
    name: 'Yaxshi sifat',
    badge: 'Tavsiya etiladi',
    desc: 'Matn va rasmlar tiniq qoladi, hajm o‘rtacha kamayadi',
    scale: 1.5,
    quality: 0.78,
  },
  {
    id: 'medium',
    name: 'O‘rtacha siqish',
    badge: 'Muvozanatli',
    desc: 'Sifat yaxshi saqlanadi, hajm sezilarli kichrayadi',
    scale: 1.15,
    quality: 0.58,
  },
  {
    id: 'low',
    name: 'Maksimal siqish',
    badge: 'Eng kichik hajm',
    desc: 'Katta fayllarni minimal hajmga tushirish uchun',
    scale: 0.85,
    quality: 0.38,
  },
  {
    id: 'custom',
    name: 'Qo‘lda sozlash',
    badge: null,
    desc: 'Sifat va aniqlikni o‘zingiz tanlang',
    scale: 1.25,
    quality: 0.65,
  },
];

async function renderPageToJpegBytes(page, scale, quality) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality)
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dataUrl = canvas.toDataURL('image/jpeg', quality);

  // Release canvas memory promptly
  canvas.width = 0;
  canvas.height = 0;

  return {
    bytes,
    dataUrl,
    ptWidth: viewport.width / scale,
    ptHeight: viewport.height / scale,
  };
}

export default function PdfCompressor() {
  const [file, setFile] = useState(null);
  const [pdfDocProxy, setPdfDocProxy] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [presetId, setPresetId] = useState('high');
  const [customScale, setCustomScale] = useState(1.25);
  const [customQuality, setCustomQuality] = useState(0.65);

  const [estimating, setEstimating] = useState(false);
  const [estimatedBytes, setEstimatedBytes] = useState(null);
  const [beforePreviewUrl, setBeforePreviewUrl] = useState(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState(null);

  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef(null);
  const cancelRef = useRef(false);
  const estimateRunIdRef = useRef(0);

  const activePreset = PRESETS.find((p) => p.id === presetId) || PRESETS[0];
  const scale = presetId === 'custom' ? customScale : activePreset.scale;
  const quality = presetId === 'custom' ? customQuality : activePreset.quality;

  useEffect(() => {
    return () => {
      if (pdfDocProxy) {
        pdfDocProxy.destroy().catch(() => {});
      }
    };
  }, [pdfDocProxy]);

  async function handleFileSelect(selectedFile) {
    if (!selectedFile) return;
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Iltimos, faqat PDF fayl tanlang.');
      return;
    }

    setError('');
    setResult(null);
    setEstimatedBytes(null);
    setBeforePreviewUrl(null);
    setAfterPreviewUrl(null);

    try {
      if (pdfDocProxy) {
        await pdfDocProxy.destroy().catch(() => {});
      }
      const buffer = await selectedFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const doc = await loadingTask.promise;

      setFile(selectedFile);
      setPdfDocProxy(doc);
      setNumPages(doc.numPages);
    } catch (err) {
      console.error(err);
      setError('PDF faylni o‘qishda xatolik yuz berdi. Fayl shikastlanmagan yoki parol bilan himoyalanmaganligini tekshiring.');
    }
  }

  // Re-estimate compressed size & update Before/After preview when file or settings change
  useEffect(() => {
    if (!pdfDocProxy || !file || numPages === 0) return;

    const runId = ++estimateRunIdRef.current;
    const timer = setTimeout(async () => {
      setEstimating(true);
      try {
        const sampleIndices = numPages > 2 ? [1, Math.ceil(numPages / 2)] : [1];
        let totalSampleBytes = 0;

        for (let i = 0; i < sampleIndices.length; i++) {
          if (estimateRunIdRef.current !== runId) return;
          const page = await pdfDocProxy.getPage(sampleIndices[i]);

          if (i === 0) {
            const origRender = await renderPageToJpegBytes(page, 1.5, 0.92);
            if (estimateRunIdRef.current !== runId) return;
            setBeforePreviewUrl(origRender.dataUrl);
          }

          const compRender = await renderPageToJpegBytes(page, scale, quality);
          if (estimateRunIdRef.current !== runId) return;
          if (i === 0) {
            setAfterPreviewUrl(compRender.dataUrl);
          }
          totalSampleBytes += compRender.bytes.byteLength;
          page.cleanup();
        }

        const avgPageBytes = totalSampleBytes / sampleIndices.length;
        const estimatedTotal = Math.round(avgPageBytes * numPages + numPages * 1200 + 2048);
        setEstimatedBytes(estimatedTotal);
      } catch (err) {
        console.error('Estimation error:', err);
      } finally {
        if (estimateRunIdRef.current === runId) {
          setEstimating(false);
        }
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [pdfDocProxy, file, numPages, scale, quality]);

  async function handleCompress() {
    if (!pdfDocProxy || !file) return;
    cancelRef.current = false;
    setCompressing(true);
    setError('');
    setResult(null);
    setProgress({ current: 0, total: numPages });

    try {
      const outPdf = await PDFDocument.create();

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (cancelRef.current) {
          setCompressing(false);
          return;
        }

        const page = await pdfDocProxy.getPage(pageNum);
        const { bytes, ptWidth, ptHeight } = await renderPageToJpegBytes(page, scale, quality);
        page.cleanup();

        const embeddedImg = await outPdf.embedJpg(bytes);
        const pdfPage = outPdf.addPage([ptWidth, ptHeight]);
        pdfPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: ptWidth,
          height: ptHeight,
        });

        setProgress({ current: pageNum, total: numPages });
      }

      const finalBytes = await outPdf.save({ useObjectStreams: true });
      const blob = new Blob([finalBytes], { type: 'application/pdf' });
      const outName = `${stripExtension(file.name)}_siqilgan.pdf`;

      setResult({
        blob,
        filename: outName,
        size: blob.size,
      });
    } catch (err) {
      console.error(err);
      setError('PDF siqish jarayonida xatolik yuz berdi.');
    } finally {
      setCompressing(false);
    }
  }

  function handleReset() {
    cancelRef.current = true;
    if (pdfDocProxy) {
      pdfDocProxy.destroy().catch(() => {});
    }
    setFile(null);
    setPdfDocProxy(null);
    setNumPages(0);
    setEstimatedBytes(null);
    setBeforePreviewUrl(null);
    setAfterPreviewUrl(null);
    setResult(null);
    setError('');
    setCompressing(false);
  }

  const estimatedSavings = estimatedBytes ? calcSavingsPercent(file?.size, estimatedBytes) : null;
  const finalSavings = result ? calcSavingsPercent(file?.size, result.size) : null;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Katta PDF hajmini kichraytirish</h2>
        <p className="card-desc">
          Fayl serverga yuklanmaydi — siqish darajasini tanlang, taxminiy hajmni va sifatni oldindan ko‘ring.
        </p>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      {!file ? (
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
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handleFileSelect(dropped);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <div className="dropzone-icon">
            <Upload size={26} />
          </div>
          <p className="dropzone-title">PDF faylni shu yerga tashlang yoki tanlang</p>
          <p className="dropzone-hint">Hatto 100+ MB lik katta fayllar ham internetsiz brauzerda siqiladi</p>
        </div>
      ) : (
        <>
          <div className="file-summary">
            <div className="file-meta">
              <div className="file-icon-box">
                <FileText size={22} />
              </div>
              <div>
                <div className="file-name">{file.name}</div>
                <div className="file-details">
                  Asl hajm: <strong>{formatBytes(file.size)}</strong> • {numPages} sahifa
                </div>
              </div>
            </div>
            <button className="btn btn-ghost-danger" onClick={handleReset} disabled={compressing}>
              <Trash2 size={16} />
              Boshqa fayl
            </button>
          </div>

          <div className="presets-grid">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset-card ${presetId === p.id ? 'selected' : ''}`}
                onClick={() => {
                  setPresetId(p.id);
                  setResult(null);
                }}
                disabled={compressing}
              >
                <div className="preset-top">
                  <span className="preset-name">{p.name}</span>
                  {p.badge && <span className="preset-badge">{p.badge}</span>}
                </div>
                <span className="preset-desc">{p.desc}</span>
              </button>
            ))}
          </div>

          {presetId === 'custom' && (
            <div className="custom-sliders">
              <div className="slider-group">
                <label>
                  <span><Sliders size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Rasm sifati</span>
                  <span>{Math.round(customQuality * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0.15"
                  max="0.95"
                  step="0.05"
                  value={customQuality}
                  onChange={(e) => {
                    setCustomQuality(parseFloat(e.target.value));
                    setResult(null);
                  }}
                  disabled={compressing}
                />
              </div>
              <div className="slider-group">
                <label>
                  <span><Gauge size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Aniqlik (DPI masshtabi)</span>
                  <span>{Math.round(customScale * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0.6"
                  max="2.2"
                  step="0.1"
                  value={customScale}
                  onChange={(e) => {
                    setCustomScale(parseFloat(e.target.value));
                    setResult(null);
                  }}
                  disabled={compressing}
                />
              </div>
            </div>
          )}

          <div className="estimate-box">
            <div className="estimate-row">
              <div className="estimate-metrics">
                <div className="metric-pill">
                  <span className="metric-label">Asl hajm</span>
                  <span className="metric-value">{formatBytes(file.size)}</span>
                </div>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>→</span>
                <div className="metric-pill">
                  <span className="metric-label">Taxminiy natija</span>
                  <span className="metric-value success">
                    {estimating ? 'Hisoblanmoqda...' : estimatedBytes ? `~${formatBytes(estimatedBytes)}` : '—'}
                  </span>
                </div>
              </div>

              {!estimating && estimatedSavings !== null && (
                <span className={`savings-tag ${estimatedSavings <= 0 ? 'warn' : ''}`}>
                  {estimatedSavings > 0
                    ? `~${estimatedSavings}% kichrayadi`
                    : 'Hajm kamaymasligi mumkin'}
                </span>
              )}
            </div>
          </div>

          {!estimating && estimatedSavings !== null && estimatedSavings <= 0 && (
            <div className="alert alert-warning">
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Bu PDF allaqachon juda yengil yoki faqat matndan iborat ko‘rinadi. Rastrlab siqish hajmni
                kattalashtirib yuborishi mumkin — «Maksimal siqish» yoki «Qo‘lda sozlash»ni sinab ko‘ring.
              </span>
            </div>
          )}

          {beforePreviewUrl && afterPreviewUrl && (
            <div className="preview-compare">
              <div className="preview-compare-header">
                <h3 className="preview-compare-title">1-sahifa sifatini oldindan tekshirish (Oldin / Keyin)</h3>
              </div>
              <div className="preview-grid">
                <div className="preview-pane">
                  <div className="preview-pane-label">
                    <span>Asl ko‘rinish</span>
                    <span>100%</span>
                  </div>
                  <img src={beforePreviewUrl} alt="Asl sahifa" />
                </div>
                <div className="preview-pane">
                  <div className="preview-pane-label">
                    <span>Siqilgandan keyin</span>
                    <span>{Math.round(quality * 100)}% sifat</span>
                  </div>
                  <img src={afterPreviewUrl} alt="Siqilgan sahifa" />
                </div>
              </div>
            </div>
          )}

          {compressing && (
            <div className="progress-wrap">
              <div className="progress-meta">
                <span>Siqilmoqda: {progress.current} / {progress.total} sahifa</span>
                <span>{progress.total ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {result && (
            <div className="alert alert-success">
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Tayyor!</strong> Yangi hajm: <strong>{formatBytes(result.size)}</strong>{' '}
                ({finalSavings > 0 ? `${finalSavings}% tejaldi` : 'saqlandi'}).
              </div>
            </div>
          )}

          <div className="actions-row">
            {!compressing ? (
              <button className="btn btn-primary" onClick={handleCompress}>
                <Gauge size={18} />
                {result ? 'Qayta siqish' : 'PDFni siqish'}
              </button>
            ) : (
              <button
                className="btn btn-ghost-danger"
                onClick={() => {
                  cancelRef.current = true;
                }}
              >
                <Loader2 size={18} className="spin" />
                Bekor qilish
              </button>
            )}

            {result && !compressing && (
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
