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
              <strong>Android ou computador</strong>
              <span>
                Use o botão de instalar do navegador ou escolha “Instalar
                aplicativo” no menu da página.
              </span>
            </div>
            <div>
              <strong>iPhone ou iPad</strong>
              <span>
                Abra no Safari, toque em <Share size={13} aria-hidden="true" />{" "}
                Compartilhar e escolha “Adicionar à Tela de Início”.
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
