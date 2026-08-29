import { useState } from "react";
import { Download, Share } from "lucide-react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PwaInstallButtonProps = {
  compact?: boolean;
  className?: string;
};

export function PwaInstallButton({
  compact = false,
  className = "",
}: PwaInstallButtonProps) {
  const { install, isInstalled, isInstallable } = usePwaInstall();
  const [helpOpen, setHelpOpen] = useState(false);
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isAppleMobile = /iPad|iPhone|iPod/i.test(userAgent) || (userAgent.includes("Macintosh") && "ontouchend" in document);
  const isFirefox = /Firefox\//i.test(userAgent);
  const manualInstallText = isAppleMobile
    ? "No Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”."
    : isFirefox
      ? "No Firefox, abra o menu do navegador e use “Instalar” ou “Adicionar à tela inicial”, quando disponível."
      : "Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.";

  const handleInstall = async () => {
    if (isInstalled) return;
    const outcome = await install();
    // A manual guide is useful only when the browser cannot expose the native
    // prompt. Do not stack a second modal after the user dismisses the native UI.
    if (outcome === "unavailable") setHelpOpen(true);
  };

  if (isInstalled) return null;

  return (
    <>
      <button
        type="button"
        className={`pwa-install-button ${compact ? "pwa-install-button-compact" : ""} ${className}`.trim()}
        onClick={() => void handleInstall()}
        aria-label="Instalar aplicativo Concord"
        title={
          isInstallable
            ? "Instalar aplicativo Concord"
            : "Como instalar o aplicativo Concord"
        }
      >
        <Download size={compact ? 15 : 16} />
        <span>{compact ? "Instalar" : "Instalar aplicativo"}</span>
      </button>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="pwa-install-dialog">
          <DialogHeader>
            <span className="firebase-kicker">CONCORD / APLICATIVO</span>
            <DialogTitle>Instale o Concord</DialogTitle>
            <DialogDescription>
              Use o Concord como aplicativo para abrir suas comunidades mais
              rapidamente.
            </DialogDescription>
          </DialogHeader>
          <div className="pwa-install-guide">
            <div>
              <strong>{isAppleMobile ? "iPhone ou iPad" : "Seu navegador"}</strong>
              <span>{manualInstallText}</span>
            </div>
            <div>
              <strong>Prompt automático</strong>
              <span>
                Quando o navegador oferecer instalação automática, este botão abrirá o prompt nativo. Se ele não aparecer, as instruções acima continuam válidas.
              </span>
            </div>
          </div>
          <button
            type="button"
            className="pwa-install-dismiss"
            onClick={() => setHelpOpen(false)}
          >
            Entendi
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
