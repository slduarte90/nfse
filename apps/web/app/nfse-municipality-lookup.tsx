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
  const result = [...startsWith, ...contains].slice(0, 12);
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

  label.classList.add('nfse-hidden-ibge-field');

  const wrapper = document.createElement('label');
  wrapper.className = 'nfse-city-combobox-field';
  wrapper.title = 'Digite pelo menos 3 letras e selecione o município. O código IBGE será salvo automaticamente.';
  wrapper.innerHTML = `Município
    <div class="nfse-city-combobox">
      <input name="municipalitySearch" placeholder="Digite e selecione o município" autocomplete="off" />
      <div class="nfse-city-combobox__list" hidden></div>
    </div>`;

  label.parentElement.insertBefore(wrapper, label);

  const searchInput = wrapper.querySelector<HTMLInputElement>('[name="municipalitySearch"]');
  const list = wrapper.querySelector<HTMLDivElement>('.nfse-city-combobox__list');
  if (!searchInput || !list) return;

  let currentRequest = 0;

  const closeList = () => {
    list.hidden = true;
  };

  const chooseCity = (city: IbgeMunicipality) => {
    searchInput.value = `${city.nome}/${ufOf(city)}`;
    setNativeValue(ibgeInput, String(city.id));
    closeList();
  };

  searchInput.addEventListener('input', async () => {
    const request = ++currentRequest;
    const cities = await searchCities(searchInput.value);
    if (request !== currentRequest) return;

    list.replaceChildren();
    if (!cities.length) {
      const empty = document.createElement('div');
      empty.className = 'nfse-city-combobox__empty';
      empty.textContent = searchInput.value.trim().length >= 3 ? 'Nenhum município encontrado' : 'Digite pelo menos 3 letras';
      list.appendChild(empty);
      list.hidden = searchInput.value.trim().length < 3;
      return;
    }

    cities.forEach((city) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nfse-city-combobox__option';
      button.textContent = labelOf(city);
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        chooseCity(city);
      });
      list.appendChild(button);
    });
    list.hidden = false;
  });

  searchInput.addEventListener('focus', () => {
    if (list.childElementCount > 0) list.hidden = false;
  });

  searchInput.addEventListener('blur', () => {
    window.setTimeout(closeList, 120);
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
