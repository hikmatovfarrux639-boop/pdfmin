import { useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import html2canvas from 'html2canvas';
import { PDFDocument, PageSizes } from 'pdf-lib';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileType2,
  Printer,
  Trash2,
  Upload,
} from 'lucide-react';
import { downloadBlob, formatBytes, stripExtension } from '../utils/formatters';

export default function WordToPdf() {
  const [file, setFile] = useState(null);
  const [rendering, setRendering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef(null);
  const previewRef = useRef(null);

  async function handleFileSelect(selectedFile) {
    if (!selectedFile) return;
    const nameLower = selectedFile.name.toLowerCase();
    if (!nameLower.endsWith('.docx')) {
      setError('Iltimos, .docx formatidagi Word hujjatini tanlang (.doc eski format qo‘llab-quvvatlanmaydi).');
      return;
    }

    setError('');
    setResult(null);
    setFile(selectedFile);
    setRendering(true);

    try {
      const buffer = await selectedFile.arrayBuffer();
      // Wait for previewRef to mount
      await new Promise((r) => setTimeout(r, 30));
      if (!previewRef.current) return;

      previewRef.current.innerHTML = '';
      await renderAsync(buffer, previewRef.current, null, {
        className: 'docx',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        breakPages: true,
        useBase64URL: true,
      });
    } catch (err) {
      console.error(err);
      setError('Word hujjatini o‘qishda xatolik yuz berdi. Fayl buzilmaganligini tekshiring.');
    } finally {
      setRendering(false);
    }
  }

  async function handleExportPdf() {
    if (!previewRef.current || !file) return;
    setExporting(true);
    setError('');
    setResult(null);

    try {
      const pdfDoc = await PDFDocument.create();
      const sections = Array.from(previewRef.current.querySelectorAll('section.docx'));
      const targets = sections.length > 0 ? sections : [previewRef.current];

      for (const el of targets) {
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        });

        const [a4W, a4H] = PageSizes.A4;
        const pageWidthPx = canvas.width;
        const pageHeightPx = canvas.height;
        const expectedA4SlicePx = Math.floor((pageWidthPx * a4H) / a4W);

        // If a single section is taller than one A4 page, slice it cleanly
        if (sections.length === 0 && pageHeightPx > expectedA4SlicePx * 1.05) {
          let offsetY = 0;
          while (offsetY < pageHeightPx) {
            const sliceH = Math.min(expectedA4SlicePx, pageHeightPx - offsetY);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = pageWidthPx;
            sliceCanvas.height = sliceH;
            const sCtx = sliceCanvas.getContext('2d');
            sCtx.fillStyle = '#ffffff';
            sCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
            sCtx.drawImage(
              canvas,
              0,
              offsetY,
              pageWidthPx,
              sliceH,
              0,
              0,
              pageWidthPx,
              sliceH
            );

            const blob = await new Promise((res) => sliceCanvas.toBlob(res, 'image/jpeg', 0.92));
            const img = await pdfDoc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
            const page = pdfDoc.addPage([a4W, a4H]);
            const drawH = (sliceH / pageWidthPx) * a4W;
            page.drawImage(img, { x: 0, y: a4H - drawH, width: a4W, height: drawH });

            sliceCanvas.width = 0;
            sliceCanvas.height = 0;
            offsetY += sliceH;
          }
        } else {
          const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
          const img = await pdfDoc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
          const isLandscape = pageWidthPx > pageHeightPx;
          const pW = isLandscape ? a4H : a4W;
          const pH = isLandscape ? a4W : a4H;
          const page = pdfDoc.addPage([pW, pH]);
          const ratio = Math.min(pW / img.width, pH / img.height);
          const drawW = img.width * ratio;
          const drawH = img.height * ratio;
          page.drawImage(img, {
            x: (pW - drawW) / 2,
            y: pH - drawH,
            width: drawW,
            height: drawH,
          });
        }

        canvas.width = 0;
        canvas.height = 0;
      }

      const bytes = await pdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const filename = `${stripExtension(file.name)}.pdf`;
      setResult({ blob, filename, size: blob.size });
    } catch (err) {
      console.error(err);
      setError('Word hujjatini PDFga aylantirishda xatolik yuz berdi.');
    } finally {
      setExporting(false);
    }
  }

  function handleReset() {
    setFile(null);
    setResult(null);
    setError('');
    if (previewRef.current) previewRef.current.innerHTML = '';
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Word (.docx) hujjatini PDF qilish</h2>
        <p className="card-desc">
          Word faylni brauzerda ko‘rib chiqing va to‘g‘ridan-to‘g‘ri PDF sifatida yuklab oling.
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
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
              e.target.value = '';
            }}
          />
          <div className="dropzone-icon">
            <Upload size={26} />
          </div>
          <p className="dropzone-title">Word (.docx) faylni shu yerga tashlang yoki tanlang</p>
          <p className="dropzone-hint">Hujjat serverga yuborilmasdan brauzerda ochiladi</p>
        </div>
      ) : (
        <>
          <div className="file-summary">
            <div className="file-meta">
              <div className="file-icon-box">
                <FileType2 size={22} />
              </div>
              <div>
                <div className="file-name">{file.name}</div>
                <div className="file-details">
                  Hajm: <strong>{formatBytes(file.size)}</strong>
                  {rendering ? ' • Hujjat ochilmoqda...' : ''}
                </div>
              </div>
            </div>
            <button className="btn btn-ghost-danger" onClick={handleReset} disabled={exporting}>
              <Trash2 size={16} />
              Boshqa fayl
            </button>
          </div>

          <div ref={previewRef} className="docx-preview-box docx-printable" />

          {result && (
            <div className="alert alert-success">
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>PDF tayyor!</strong> Hajmi: <strong>{formatBytes(result.size)}</strong>.
              </div>
            </div>
          )}

          <div className="actions-row">
            <button
              className="btn btn-primary"
              onClick={handleExportPdf}
              disabled={rendering || exporting}
            >
              <FileType2 size={18} />
              {exporting ? 'PDF tayyorlanmoqda...' : 'PDF yaratish'}
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => window.print()}
              disabled={rendering || exporting}
              title="Brauzerning Chop etish oynasi orqali vektor matnli PDF saqlash"
            >
              <Printer size={18} />
              Vektor PDF (Chop etish)
            </button>

            {result && !exporting && (
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
