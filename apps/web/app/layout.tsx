import type { Metadata } from 'next';
import './globals.css';
import './admin-users-filter.css';
import './nfse-overrides.css';
import './nfse-fixes.css';
import { CompanyCardNavigation } from './company-card-navigation';
import { CompanyModuleRouteSync } from './company-module-route-sync';
import { NfseBulkDownloadActions } from './nfse-bulk-download-actions';
import { NfseCertificateStatus } from './nfse-certificate-status';
import { NfseMunicipalityLookup } from './nfse-municipality-lookup';
import { NfsePaginationEnhancer } from './nfse-pagination-enhancer';
import { NfseServicesManager } from './nfse-services-manager';
import { NfseSettingsPanel } from './nfse-settings-panel';
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
        <CompanyModuleRouteSync />
        <NfseBulkDownloadActions />
        <NfseCertificateStatus />
        <NfseMunicipalityLookup />
        <NfsePaginationEnhancer />
        <NfseServicesManager />
        <NfseSettingsPanel />
        <NfseTakerLookup />
        {children}
      </body>
    </html>
  );
}
