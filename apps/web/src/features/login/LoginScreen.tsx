import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { Eye, EyeOff, LayoutGrid, LoaderCircle } from 'lucide-react';

import { ApiError } from '../../api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

// Mirrors the backend contract (login/password policy); never imported at runtime.
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MAX_LENGTH = 128;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(value: string): string | null {
  if (value.length === 0) {
    return 'Informe o e-mail.';
  }
  if (value.length > EMAIL_MAX_LENGTH) {
    return 'O e-mail é muito longo.';
  }
  if (!EMAIL_PATTERN.test(value)) {
    return 'Informe um e-mail válido.';
  }
  return null;
}

function mapLoginError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'http':
        switch (error.status) {
          case 400:
            return 'Verifique os dados informados.';
          case 401:
            return 'E-mail ou senha inválidos.';
          case 403:
            return 'Acesso não autorizado. Verifique a configuração de acesso.';
          case 429:
            return 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
          default:
            return 'Não foi possível entrar. Tente novamente.';
        }
      case 'network':
      case 'timeout':
        return 'Não foi possível conectar. Tente novamente.';
      default:
        return 'Ocorreu um erro inesperado. Tente novamente.';
    }
  }
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submittingRef = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }
    const normalizedEmail = email.trim();
    const emailValidation = validateEmail(normalizedEmail);
    const passwordValidation = password.length === 0 ? 'Informe a senha.' : null;
    setEmailError(emailValidation);
    setPasswordError(passwordValidation);
    if (emailValidation !== null || passwordValidation !== null) {
      if (emailValidation !== null) {
        emailRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setGeneralError(null);
    try {
      await login({ email: normalizedEmail, password });
      setPassword('');
    } catch (error) {
      setGeneralError(mapLoginError(error));
      errorRef.current?.focus();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-md">
        <header className="mb-8 flex items-center justify-center gap-2 text-primary">
          <LayoutGrid aria-hidden="true" className="size-7" />
          <span className="text-lg font-semibold tracking-tight">Leads</span>
        </header>
        <Card>
          <CardContent className="pt-6">
            <h1 className="text-xl font-semibold tracking-tight">Acesse sua conta</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              O acesso é restrito ao administrador do sistema.
            </p>
            <form
              onSubmit={handleSubmit}
              noValidate
              aria-busy={submitting}
              aria-label="Entrar"
              className="mt-6 space-y-4"
            >
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={EMAIL_MAX_LENGTH}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  {...(emailError !== null
                    ? { 'aria-invalid': true, 'aria-describedby': 'email-error' }
                    : {})}
                />
                {emailError !== null && (
                  <p id="email-error" className="mt-1 text-sm text-destructive">
                    {emailError}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    maxLength={PASSWORD_MAX_LENGTH}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pr-10"
                    {...(passwordError !== null
                      ? { 'aria-invalid': true, 'aria-describedby': 'password-error' }
                      : {})}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    <span className="sr-only">
                      {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    </span>
                    {showPassword ? (
                      <EyeOff aria-hidden="true" className="size-4" />
                    ) : (
                      <Eye aria-hidden="true" className="size-4" />
                    )}
                  </Button>
                </div>
                {passwordError !== null && (
                  <p id="password-error" className="mt-1 text-sm text-destructive">
                    {passwordError}
                  </p>
                )}
              </div>
              {generalError !== null && (
                <p
                  role="alert"
                  ref={errorRef}
                  tabIndex={-1}
                  className="rounded-md border border-destructive/30 bg-surface-error p-3 text-sm text-foreground focus:outline-none"
                >
                  {generalError}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                Entrar
              </Button>
              {submitting && (
                <p role="status" className="text-sm text-muted-foreground">
                  Enviando…
                </p>
              )}
            </form>
            <p className="mt-6 text-center text-xs text-muted-foreground">Ambiente privado.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
