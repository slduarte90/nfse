import type { Metadata } from 'next';
import './globals.css';
import './admin-users-filter.css';

export const metadata: Metadata = {
  title: 'Zip NFS-e',
  description: 'Portal de emissao de NFS-e para clientes Zip Contabilidade',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
