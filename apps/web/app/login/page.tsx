'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface LoginResponse {
  accessToken?: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  message?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3333/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = (await response.json()) as LoginResponse;

      if (!response.ok || !data.accessToken) {
        setError(data.message || 'Login/e-mail ou senha inexistente.');
        return;
      }

      localStorage.setItem('nfse_access_token', data.accessToken);
      localStorage.setItem('nfse_user', JSON.stringify(data.user));
      setSuccess('Login realizado com sucesso.');

      setTimeout(() => {
        router.push('/dashboard');
      }, 500);
    } catch {
      setError('Nao foi possivel conectar com a API. Verifique se o backend esta rodando.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="nfse-login-page">
      <section className="nfse-brand-panel" aria-label="Logo principal">
        <div className="nfse-logo-showcase">
          <div className="nfse-logo-mark" aria-label="Zip NFS-e">
            <div>
              <strong>ZIP</strong>
              <span>NFS-e</span>
            </div>
          </div>

          <div className="nfse-brand-copy">
            <h1>Portal de emissao de NFS-e</h1>
            <p>
              Acesse o ambiente de clientes da Zip para cadastrar empresas, configurar certificado A1
              e emitir notas fiscais de servico pela API nacional.
            </p>
          </div>
        </div>
      </section>

      <section className="nfse-login-panel" aria-labelledby="login-title">
        <form
          className={`nfse-login-form ${error ? 'is-invalid' : ''}`}
          onSubmit={handleSubmit}
        >
          <div className="nfse-login-form__header">
            <h2 id="login-title">Entrar</h2>
            <p className="nfse-login-form__subtitle">
              Use seu e-mail e senha cadastrados para acessar o emissor.
            </p>
          </div>

          <label className="nfse-field" htmlFor="email">
            <span>Login ou e-mail</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="Digite seu login ou e-mail"
              aria-describedby="login-error"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="nfse-field" htmlFor="password">
            <span>Senha</span>
            <span className="nfse-password-control">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                aria-describedby="login-error"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="nfse-password-toggle"
                type="button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-controls="password"
                onMouseDown={() => setShowPassword(true)}
                onMouseUp={() => setShowPassword(false)}
                onMouseLeave={() => setShowPassword(false)}
                onTouchStart={() => setShowPassword(true)}
                onTouchEnd={() => setShowPassword(false)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </span>
          </label>

          <button className="nfse-login-button" type="submit" disabled={isLoading}>
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>

          <a className="nfse-forgot-password" href="#recuperar-senha">
            Esqueci minha senha
          </a>

          {error ? (
            <p className="nfse-login-error" id="login-error" role="alert">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="nfse-login-success" role="status">
              {success}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
