import { useState } from "react";
import { ArrowRight, Chrome, Loader2, Mail, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";

export function FirebaseAuthPanel() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, loading, error } = useFirebaseAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const submitEmail = async () => {
    setPending(true);
    setMessage("");
    try {
      if (mode === "signup") await registerWithEmail(email.trim(), password, displayName.trim());
      else await loginWithEmail(email.trim(), password);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível concluir o acesso.");
    } finally {
      setPending(false);
    }
  };

  const submitGoogle = async () => {
    setPending(true);
    setMessage("");
    try {
      await loginWithGoogle();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível entrar com Google.");
      setPending(false);
    }
  };

  const authErrorMessage = message || (error instanceof Error ? error.message : error ? "Não foi possível concluir o acesso." : "");
  const busy = pending || loading;

  return (
    <main className="firebase-auth-shell" aria-busy={busy}>
      <div className="firebase-auth-orbit firebase-auth-orbit-one" aria-hidden="true" />
      <div className="firebase-auth-orbit firebase-auth-orbit-two" aria-hidden="true" />
      <section className="firebase-auth-card" aria-labelledby="firebase-auth-title">
        <div className="firebase-auth-brand"><span className="firebase-auth-mark"><WandSparkles size={20} /></span><span>CONCORD</span></div>
        <span className="section-kicker">ACESSO SEGURO</span>
        <div className="firebase-auth-heading">
          <div>
            <h1 id="firebase-auth-title">Entre no seu espaço.</h1>
            <p>Converse, crie e encontre seu ritmo no Concord.</p>
          </div>
          <span className="firebase-auth-status" aria-hidden="true"><span /> ONLINE</span>
        </div>
        <Button type="button" className="firebase-google-button" onClick={() => void submitGoogle()} disabled={busy}>
          {pending ? <Loader2 className="animate-spin" size={17} /> : <Chrome size={17} />}
          {pending ? "Abrindo acesso seguro..." : "Continuar com Google"}
        </Button>
        <p className="firebase-auth-helper">No celular, você será direcionado para a página oficial do Google e voltará automaticamente ao Concord.</p>
        <div className="firebase-divider"><span>ou continue com e-mail</span></div>
        {mode === "signup" && <label htmlFor="firebase-display-name">Nome de exibição<Input id="firebase-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Como você quer aparecer?" autoComplete="name" /></label>}
        <label htmlFor="firebase-email">E-mail<Input id="firebase-email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" type="email" autoComplete="email" inputMode="email" /></label>
        <label htmlFor="firebase-password">Senha<Input id="firebase-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} /></label>
        {authErrorMessage && <div className="firebase-auth-error" role="alert" aria-live="polite">{authErrorMessage}</div>}
        <Button type="button" className="primary-cta firebase-email-button" onClick={() => void submitEmail()} disabled={busy || !email || password.length < 6 || (mode === "signup" && !displayName.trim())}>
          {pending ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
          {mode === "signup" ? "Criar conta" : "Entrar com e-mail"}
          {!pending && <ArrowRight size={16} />}
        </Button>
        <button type="button" className="firebase-mode-toggle" onClick={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setMessage(""); }} disabled={busy}>
          {mode === "signup" ? "Já tenho uma conta" : "Criar uma conta nova"}
        </button>
      </section>
    </main>
  );
}
