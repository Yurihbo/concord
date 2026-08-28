import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";

type PwaInstallButtonProps = {
  compact?: boolean;
  className?: string;
};

export function PwaInstallButton({ compact = false, className = "" }: PwaInstallButtonProps) {
  const { install, isInstalled, isInstallable } = usePwaInstall();
  const [helpOpen, setHelpOpen] = useState(false);

  const handleInstall = async () => {
    if (isInstalled) return;
    const outcome = await install();
    if (outcome === "unavailable" || outcome === "dismissed") setHelpOpen(true);
  };

  if (isInstalled) return null;

  return (
    <>
      <button
        type="button"
        className={`pwa-install-button ${compact ? "pwa-install-button-compact" : ""} ${className}`.trim()}
        onClick={() => void handleInstall()}
        aria-label="Instalar aplicativo Concord"
        title={isInstallable ? "Instalar aplicativo Concord" : "Como instalar o aplicativo Concord"}
      >
        <Download size={compact ? 15 : 16} />
        <span>{compact ? "Instalar" : "Instalar aplicativo"}</span>
      </button>

      {helpOpen && (
        <div className="pwa-install-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
          <section className="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
            <button type="button" className="pwa-install-close" onClick={() => setHelpOpen(false)} aria-label="Fechar instruções"><X size={17} /></button>
            <span className="firebase-kicker">CONCORD / APLICATIVO</span>
            <h2 id="pwa-install-title">Instale o Concord</h2>
            <p>Use o Concord como aplicativo para abrir suas comunidades mais rapidamente.</p>
            <div className="pwa-install-guide">
              <div><strong>Android ou computador</strong><span>Use o botão de instalar do navegador ou escolha “Instalar aplicativo” no menu da página.</span></div>
              <div><strong>iPhone ou iPad</strong><span>Abra no Safari, toque em <Share size={13} aria-hidden="true" /> Compartilhar e escolha “Adicionar à Tela de Início”.</span></div>
            </div>
            <button type="button" className="pwa-install-dismiss" onClick={() => setHelpOpen(false)}>Entendi</button>
          </section>
        </div>
      )}
    </>
  );
}
