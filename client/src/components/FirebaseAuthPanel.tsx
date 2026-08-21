import { useState } from "react";
import { ArrowRight, Chrome, Mail, WandSparkles } from "lucide-react";
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
    try { await loginWithGoogle(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Não foi possível entrar com Google."); }
    finally { setPending(false); }
  };

  const authErrorMessage = message || (error instanceof Error ? error.message : error ? "Não foi possível concluir o acesso." : "");

  return (
    <main className="firebase-auth-shell">
      <section className="firebase-auth-card" aria-labelledby="firebase-auth-title">
        <div className="firebase-auth-brand"><span className="firebase-auth-mark"><WandSparkles size={20} /></span><span>CONCORD</span></div>
        <span className="section-kicker">ACESSO SEGURO</span>
        <h1 id="firebase-auth-title">Entre no seu espaço.</h1>
        <p>Use Google ou sua conta de e-mail para continuar no Concord.</p>
        <Button className="firebase-google-button" onClick={submitGoogle} disabled={pending || loading}><Chrome size={17} /> Continuar com Google</Button>
        <div className="firebase-divider"><span>ou</span></div>
        {mode === "signup" && <label>Nome de exibição<Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Como você quer aparecer?" autoComplete="name" /></label>}
        <label>E-mail<Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" type="email" autoComplete="email" /></label>
        <label>Senha<Input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} /></label>
        {authErrorMessage && <div className="firebase-auth-error" role="alert">{authErrorMessage}</div>}
        <Button className="primary-cta firebase-email-button" onClick={submitEmail} disabled={pending || loading || !email || password.length < 6 || (mode === "signup" && !displayName.trim())}><Mail size={16} /> {mode === "signup" ? "Criar conta" : "Entrar com e-mail"} <ArrowRight size={16} /></Button>
        <button className="firebase-mode-toggle" onClick={() => { setMode((current) => current === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signup" ? "Já tenho uma conta" : "Criar uma conta nova"}</button>
      </section>
    </main>
  );
}
