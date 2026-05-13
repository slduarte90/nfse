'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface StoredUser {
  id: string;
  name: string;
  email: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('nfse_access_token');
    const storedUser = localStorage.getItem('nfse_user');

    if (!token) {
      router.replace('/login');
      return;
    }

    if (storedUser) {
      setUser(JSON.parse(storedUser) as StoredUser);
    }
  }, [router]);

  function handleLogout() {
    localStorage.removeItem('nfse_access_token');
    localStorage.removeItem('nfse_user');
    router.replace('/login');
  }

  return (
    <main className="nfse-dashboard-page">
      <section className="nfse-dashboard-shell">
        <div className="nfse-dashboard-card">
          <p className="nfse-login-form__subtitle">Ambiente autenticado</p>
          <h1>Bem-vindo ao Zip NFS-e</h1>
          <p>
            {user?.name ? `${user.name}, ` : ''}esta sera a area principal para cadastro de
            empresas, certificados A1, tomadores e emissao de notas fiscais de servico.
          </p>

          <div className="nfse-dashboard-actions">
            <Link className="nfse-secondary-button" href="/login">
              Voltar ao login
            </Link>
            <button className="nfse-secondary-button" type="button" onClick={handleLogout}>
              Sair
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
