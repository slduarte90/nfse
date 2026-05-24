export type InvoiceStatus = 'DRAFT' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED';
export type CertificateStatus = 'PENDING' | 'VALID' | 'EXPIRED' | 'INVALID' | 'REVOKED';

export interface CompanySummary {
  id: string;
  legalName: string;
  tradeName?: string | null;
  cnpj: string;
  city: string;
  state: string;
  taxRegime: string;
  isActive: boolean;
}

export interface CustomerSummary {
  id: string;
  companyId: string;
  name: string;
  document: string;
  email?: string | null;
  isActive?: boolean;
  _count?: { invoices?: number };
}

export interface NfseInvoiceSummary {
  id: string;
  companyId: string;
  customerId?: string | null;
  status: InvoiceStatus;
  number?: string | null;
  accessKey?: string | null;
  amount: string;
  serviceDescription: string;
  xmlPath?: string | null;
  pdfPath?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface ApiHealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}
