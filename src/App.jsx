import { useEffect, useRef, useState } from "react";
import { convertSapLabelsTo4UpPdf } from "./label4up";
import "./App.css";

const MODE_OPTIONS = [
  { value: "auto", label: "Automatikus" },
  { value: "mpl", label: "GLS (álló)" },
  { value: "gls", label: "GLS (fekvő)" },
];

export default function App() {
  const [mode, setMode] = useState("auto");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progressText, setProgressText] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const lastUrlRef = useRef("");

  useEffect(() => {
    if (lastUrlRef.current && lastUrlRef.current !== outputUrl) {
      URL.revokeObjectURL(lastUrlRef.current);
    }
    lastUrlRef.current = outputUrl;
  }, [outputUrl]);

  useEffect(
    () => () => {
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
      }
    },
    [],
  );

  async function handleGenerate() {
    if (files.length === 0 || busy) return;

    setBusy(true);
    setError("");
    setProgressText("PDF betöltése...");
    setOutputUrl("");

    try {
      const outputBytes = await convertSapLabelsTo4UpPdf(files, {
        mode,
        onProgress: ({ message }) => setProgressText(message),
      });

      const blob = new Blob([outputBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      setProgressText("Kész.");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "A konvertálás sikertelen.");
      setProgressText("");
    } finally {
      setBusy(false);
    }
  }

  function handlePrint() {
    if (!outputUrl) return;
    const win = window.open(outputUrl, "_blank");
    if (!win) {
      setError("A felugró ablak blokkolva lett. Nyisd meg az 'Megnyitás' gombbal, majd nyomtass onnan.");
      return;
    }

    const tryPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        // Best-effort only; built-in PDF viewers differ by browser.
      }
    };

    try {
      win.addEventListener("load", tryPrint, { once: true });
    } catch {
      // Ignore if the browser disallows this.
    }
    window.setTimeout(tryPrint, 1200);
  }

  return (
    <main className="app-shell">
      <section className="card">
        <h1>SAP címke PDF -&gt; 4 címke / A4</h1>
        <p className="muted">
          Tölts fel egy vagy több SAP címke PDF-et (oldalanként 1 címke, jobb
          felső sarok). Az alkalmazás böngészőben levágja a címkéket és
          nyomtatható 4-es osztású A4 PDF-et készít.
        </p>

        <label className="field">
          <span>Tájolás mód</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={busy}
          >
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Bemeneti PDF-ek</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={busy}
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              setError("");
            }}
          />
        </label>

        {files.length > 0 ? (
          <p className="status">
            Kiválasztva: {files.length} fájl
          </p>
        ) : null}

        <div className="actions">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={files.length === 0 || busy}
          >
            {busy ? "Feldolgozás..." : "4-es osztású PDF generálása"}
          </button>
        </div>

        {progressText ? <p className="status">{progressText}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {outputUrl ? (
          <div className="result">
            <button type="button" onClick={handlePrint}>
              Nyomtatás
            </button>
            <a href={outputUrl} target="_blank" rel="noreferrer">
              Megnyitás
            </a>
          </div>
        ) : null}
      </section>
    </main>
  );
}
