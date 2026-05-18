import type { Metadata } from 'next';
import './globals.css';
import './admin-users-filter.css';
import './nfse-overrides.css';
import { CompanyCardNavigation } from './company-card-navigation';
import { NfseListEnhancer } from './nfse-list-enhancer';
import { NfseTakerLookup } from './nfse-taker-lookup';

export const metadata: Metadata = {
  title: 'Zip NFS-e',
  description: 'Portal de emissao de NFS-e para clientes Zip Contabilidade',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <CompanyCardNavigation />
        <NfseListEnhancer />
        <NfseTakerLookup />
        {children}
      </body>
    </html>
  );
}
