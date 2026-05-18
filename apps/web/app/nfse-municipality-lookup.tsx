'use client';

import { useEffect } from 'react';

type IbgeMunicipality = {
  id: number;
  nome: string;
  microrregiao?: {
    mesorregiao?: {
      UF?: {
        sigla?: string;
      };
    };
  };
};

let municipalitiesCache: IbgeMunicipality[] | null = null;
const suggestionsCache = new Map<string, IbgeMunicipality[]>();

function ufOf(city: IbgeMunicipality) {
  return city.microrregiao?.mesorregiao?.UF?.sigla || '';
}

function labelOf(city: IbgeMunicipality) {
  return `${city.nome}/${ufOf(city)} - ${city.id}`;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function loadMunicipalities() {
  if (municipalitiesCache) return municipalitiesCache;
  const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
  municipalitiesCache = (await response.json()) as IbgeMunicipality[];
  return municipalitiesCache;
}

async function searchCities(term: string) {
  const key = normalize(term);
  if (key.length < 3) return [];
  if (suggestionsCache.has(key)) return suggestionsCache.get(key) || [];

  const data = await loadMunicipalities();
  const startsWith = data.filter((city) => normalize(city.nome).startsWith(key));
  const contains = data.filter((city) => !normalize(city.nome).startsWith(key) && normalize(city.nome).includes(key));
  const result = [...startsWith, ...contains].slice(0, 25);
  suggestionsCache.set(key, result);
  return result;
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function enhanceIbgeField() {
  const ibgeInput = document.querySelector<HTMLInputElement>('[name="municipalIbgeCode"]');
  if (!ibgeInput || ibgeInput.dataset.cityLookupReady === 'true') return;
  ibgeInput.dataset.cityLookupReady = 'true';

  const label = ibgeInput.closest('label');
  if (!label?.parentElement) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'nfse-city-lookup-field';
  wrapper.innerHTML = `
    <label title="Digite pelo menos 3 letras e selecione o município para preencher o código IBGE automaticamente.">Município
      <input name="municipalitySearch" placeholder="Digite a cidade" autocomplete="off" />
    </label>
    <label title="Lista de municípios encontrados na busca.">Selecionar município
      <select name="municipalitySelect" disabled>
        <option value="">Digite pelo menos 3 letras</option>
      </select>
    </label>`;

  label.parentElement.insertBefore(wrapper, label);

  const searchInput = wrapper.querySelector<HTMLInputElement>('[name="municipalitySearch"]');
  const select = wrapper.querySelector<HTMLSelectElement>('[name="municipalitySelect"]');
  if (!searchInput || !select) return;

  let currentRequest = 0;

  searchInput.addEventListener('input', async () => {
    const request = ++currentRequest;
    const cities = await searchCities(searchInput.value);
    if (request !== currentRequest) return;

    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = cities.length ? 'Selecione o município' : 'Nenhum município encontrado';
    select.appendChild(placeholder);

    cities.forEach((city) => {
      const option = document.createElement('option');
      option.value = String(city.id);
      option.textContent = labelOf(city);
      option.dataset.cityName = city.nome;
      option.dataset.uf = ufOf(city);
      select.appendChild(option);
    });

    select.disabled = cities.length === 0;
  });

  select.addEventListener('change', () => {
    const option = select.selectedOptions[0];
    if (!option?.value) return;
    setNativeValue(ibgeInput, option.value);
    searchInput.value = option.dataset.cityName && option.dataset.uf ? `${option.dataset.cityName}/${option.dataset.uf}` : option.textContent || '';
  });
}

export function NfseMunicipalityLookup() {
  useEffect(() => {
    const enhance = () => enhanceIbgeField();
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
