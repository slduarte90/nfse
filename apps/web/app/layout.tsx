import type { Metadata } from 'next';
import './globals.css';
import './admin-users-filter.css';
import './nfse-overrides.css';
import './nfse-fixes.css';

export const metadata: Metadata = {
  title: 'ZIP APP',
  description: 'Portal de emissão de NFS-e para clientes Zip Contabilidade',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
      </body>
    </html>
  );
}
