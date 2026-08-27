/// All 54 African Union member countries, each with its 3-5 most widely
/// spoken languages/dialects, for onboarding country + default dialect
/// selection (AGENTS.md "Word library" / auth onboarding). Sourced from
/// each country's officially recognized/most-spoken languages -- not
/// exhaustive of every local language, just enough to let a trainer pick
/// the dialect they'll actually train in.
///
/// Tag scheme: ISO 639-1 code where the language has one and is
/// effectively singular to one country in this list (e.g. `am` for
/// Amharic). Where a language is shared across multiple countries here
/// (Swahili, Arabic, French, Portuguese, Fulani, etc.), each country's row
/// gets its own tag suffixed with the country code (e.g. `sw-ke`, `sw-tz`)
/// -- Dialect.tag is globally unique and each Dialect belongs to exactly
/// one Country, so a shared language needs one row per country, not one
/// shared row (see schema.prisma "Onboarding dialect choice").
/// ISO 639-3 codes are used where no 639-1 code exists (e.g. `hau` would
/// collide, so widely-used non-639-1 languages get a readable slug
/// instead, e.g. `wo` for Wolof (639-1) but `dyu` for Dioula (639-3)).

export interface DialectSeed {
  tag: string;
  name: string;
}

export interface CountrySeed {
  code: string;
  name: string;
  dialects: DialectSeed[];
}

export const AFRICA_COUNTRIES: CountrySeed[] = [
  {
    code: 'DZ',
    name: 'Algeria',
    dialects: [
      { tag: 'ar-dz', name: 'Arabic (Algerian)' },
      { tag: 'kab', name: 'Kabyle' },
      { tag: 'fr-dz', name: 'French' },
    ],
  },
  {
    code: 'AO',
    name: 'Angola',
    dialects: [
      { tag: 'pt-ao', name: 'Portuguese (Angola)' },
      { tag: 'umb', name: 'Umbundu' },
      { tag: 'kmb', name: 'Kimbundu' },
      { tag: 'kon-ao', name: 'Kikongo' },
    ],
  },
  {
    code: 'BJ',
    name: 'Benin',
    dialects: [
      { tag: 'fon', name: 'Fon' },
      { tag: 'yo-bj', name: 'Yoruba' },
      { tag: 'fr-bj', name: 'French' },
      { tag: 'bar', name: 'Bariba' },
    ],
  },
  {
    code: 'BW',
    name: 'Botswana',
    dialects: [
      { tag: 'tn', name: 'Setswana' },
      { tag: 'kalanga', name: 'Kalanga' },
    ],
  },
  {
    code: 'BF',
    name: 'Burkina Faso',
    dialects: [
      { tag: 'mos', name: 'Mossi (Mooré)' },
      { tag: 'dyu', name: 'Dioula' },
      { tag: 'fr-bf', name: 'French' },
      { tag: 'ff-bf', name: 'Fulfulde' },
    ],
  },
  {
    code: 'BI',
    name: 'Burundi',
    dialects: [
      { tag: 'rn', name: 'Kirundi' },
      { tag: 'fr-bi', name: 'French' },
      { tag: 'sw-bi', name: 'Swahili' },
    ],
  },
  {
    code: 'CV',
    name: 'Cabo Verde',
    dialects: [
      { tag: 'kea', name: 'Cape Verdean Creole' },
      { tag: 'pt-cv', name: 'Portuguese' },
    ],
  },
  {
    code: 'CM',
    name: 'Cameroon',
    dialects: [
      { tag: 'fr-cm', name: 'French' },
      { tag: 'ff-cm', name: 'Fulfulde' },
      { tag: 'ewo', name: 'Ewondo' },
      { tag: 'dua', name: 'Duala' },
    ],
  },
  {
    code: 'CF',
    name: 'Central African Republic',
    dialects: [
      { tag: 'sg', name: 'Sango' },
      { tag: 'fr-cf', name: 'French' },
    ],
  },
  {
    code: 'TD',
    name: 'Chad',
    dialects: [
      { tag: 'ar-td', name: 'Arabic (Chadian)' },
      { tag: 'fr-td', name: 'French' },
      { tag: 'sre', name: 'Sara' },
    ],
  },
  {
    code: 'KM',
    name: 'Comoros',
    dialects: [
      { tag: 'zdj', name: 'Comorian' },
      { tag: 'fr-km', name: 'French' },
      { tag: 'ar-km', name: 'Arabic' },
    ],
  },
  {
    code: 'CG',
    name: 'Congo, Republic of the',
    dialects: [
      { tag: 'fr-cg', name: 'French' },
      { tag: 'kon-cg', name: 'Kikongo' },
      { tag: 'lin-cg', name: 'Lingala' },
    ],
  },
  {
    code: 'CD',
    name: 'Congo, Democratic Republic of the',
    dialects: [
      { tag: 'lin-cd', name: 'Lingala' },
      { tag: 'swc', name: 'Swahili (Congo)' },
      { tag: 'kon-cd', name: 'Kikongo' },
      { tag: 'lua', name: 'Tshiluba' },
      { tag: 'fr-cd', name: 'French' },
    ],
  },
  {
    code: 'CI',
    name: "Côte d'Ivoire",
    dialects: [
      { tag: 'fr-ci', name: 'French' },
      { tag: 'dyu-ci', name: 'Dioula' },
      { tag: 'bci', name: 'Baoulé' },
    ],
  },
  {
    code: 'DJ',
    name: 'Djibouti',
    dialects: [
      { tag: 'aa', name: 'Afar' },
      { tag: 'so-dj', name: 'Somali' },
      { tag: 'ar-dj', name: 'Arabic' },
      { tag: 'fr-dj', name: 'French' },
    ],
  },
  { code: 'EG', name: 'Egypt', dialects: [{ tag: 'arz', name: 'Arabic (Egyptian)' }] },
  {
    code: 'GQ',
    name: 'Equatorial Guinea',
    dialects: [
      { tag: 'es-gq', name: 'Spanish' },
      { tag: 'fan', name: 'Fang' },
      { tag: 'fr-gq', name: 'French' },
    ],
  },
  {
    code: 'ER',
    name: 'Eritrea',
    dialects: [
      { tag: 'ti-er', name: 'Tigrinya' },
      { tag: 'ar-er', name: 'Arabic' },
      { tag: 'tig', name: 'Tigre' },
    ],
  },
  {
    code: 'SZ',
    name: 'Eswatini',
    dialects: [
      { tag: 'ss', name: 'Swati' },
    ],
  },
  {
    code: 'ET',
    name: 'Ethiopia',
    dialects: [
      { tag: 'am', name: 'Amharic' },
      { tag: 'om', name: 'Oromo' },
      { tag: 'ti-et', name: 'Tigrinya' },
      { tag: 'so-et', name: 'Somali' },
    ],
  },
  {
    code: 'GA',
    name: 'Gabon',
    dialects: [
      { tag: 'fr-ga', name: 'French' },
      { tag: 'fan-ga', name: 'Fang' },
    ],
  },
  {
    code: 'GM',
    name: 'Gambia',
    dialects: [
      { tag: 'wo-gm', name: 'Wolof' },
      { tag: 'man-gm', name: 'Mandinka' },
      { tag: 'ff-gm', name: 'Fulani' },
    ],
  },
  {
    code: 'GH',
    name: 'Ghana',
    dialects: [
      { tag: 'ak', name: 'Akan (Twi)' },
      { tag: 'ee', name: 'Ewe' },
      { tag: 'gaa', name: 'Ga' },
      { tag: 'dag', name: 'Dagbani' },
    ],
  },
  {
    code: 'GN',
    name: 'Guinea',
    dialects: [
      { tag: 'fr-gn', name: 'French' },
      { tag: 'ff-gn', name: 'Fulani (Pular)' },
      { tag: 'man-gn', name: 'Malinké' },
      { tag: 'sus', name: 'Susu' },
    ],
  },
  {
    code: 'GW',
    name: 'Guinea-Bissau',
    dialects: [
      { tag: 'pov', name: 'Guinea-Bissau Creole' },
      { tag: 'pt-gw', name: 'Portuguese' },
    ],
  },
  {
    code: 'KE',
    name: 'Kenya',
    dialects: [
      { tag: 'sw-ke', name: 'Swahili' },
      { tag: 'ki', name: 'Kikuyu' },
      { tag: 'luo', name: 'Luo' },
      { tag: 'kln', name: 'Kalenjin' },
    ],
  },
  {
    code: 'LS',
    name: 'Lesotho',
    dialects: [
      { tag: 'st', name: 'Sesotho' },
    ],
  },
  {
    code: 'LR',
    name: 'Liberia',
    dialects: [
      { tag: 'kpe', name: 'Kpelle' },
      { tag: 'vai', name: 'Vai' },
    ],
  },
  { code: 'LY', name: 'Libya', dialects: [{ tag: 'ayl', name: 'Arabic (Libyan)' }] },
  {
    code: 'MG',
    name: 'Madagascar',
    dialects: [
      { tag: 'mg', name: 'Malagasy' },
      { tag: 'fr-mg', name: 'French' },
    ],
  },
  {
    code: 'MW',
    name: 'Malawi',
    dialects: [
      { tag: 'ny', name: 'Chichewa' },
      { tag: 'tum', name: 'Tumbuka' },
    ],
  },
  {
    code: 'ML',
    name: 'Mali',
    dialects: [
      { tag: 'bm', name: 'Bambara' },
      { tag: 'fr-ml', name: 'French' },
      { tag: 'ff-ml', name: 'Fulfulde' },
    ],
  },
  {
    code: 'MR',
    name: 'Mauritania',
    dialects: [
      { tag: 'ar-mr', name: 'Arabic (Hassaniya)' },
      { tag: 'ff-mr', name: 'Fulani (Pulaar)' },
      { tag: 'wo-mr', name: 'Wolof' },
    ],
  },
  {
    code: 'MU',
    name: 'Mauritius',
    dialects: [
      { tag: 'mfe', name: 'Mauritian Creole' },
      { tag: 'fr-mu', name: 'French' },
    ],
  },
  {
    code: 'MA',
    name: 'Morocco',
    dialects: [
      { tag: 'ary', name: 'Arabic (Moroccan/Darija)' },
      { tag: 'zgh', name: 'Tamazight' },
      { tag: 'fr-ma', name: 'French' },
    ],
  },
  {
    code: 'MZ',
    name: 'Mozambique',
    dialects: [
      { tag: 'pt-mz', name: 'Portuguese' },
      { tag: 'ngl', name: 'Makhuwa' },
      { tag: 'tso', name: 'Changana' },
    ],
  },
  {
    code: 'NA',
    name: 'Namibia',
    dialects: [
      { tag: 'af-na', name: 'Afrikaans' },
      { tag: 'ndo', name: 'Oshiwambo' },
      { tag: 'her', name: 'Herero' },
    ],
  },
  {
    code: 'NE',
    name: 'Niger',
    dialects: [
      { tag: 'ha-ne', name: 'Hausa' },
      { tag: 'dje', name: 'Zarma (Djerma)' },
      { tag: 'fr-ne', name: 'French' },
      { tag: 'ff-ne', name: 'Fulfulde' },
    ],
  },
  {
    code: 'NG',
    name: 'Nigeria',
    dialects: [
      { tag: 'ig', name: 'Igbo' },
      { tag: 'yo', name: 'Yoruba' },
      { tag: 'ha', name: 'Hausa' },
      { tag: 'pcm', name: 'Nigerian Pidgin' },
      { tag: 'ibb', name: 'Ibibio' },
      { tag: 'ff-ng', name: 'Fulfulde' },
      { tag: 'igb', name: 'Igala' },
      { tag: 'kan', name: 'Kanuri' },
    ],
  },
  {
    code: 'RW',
    name: 'Rwanda',
    dialects: [
      { tag: 'rw', name: 'Kinyarwanda' },
      { tag: 'fr-rw', name: 'French' },
    ],
  },
  {
    code: 'ST',
    name: 'São Tomé and Príncipe',
    dialects: [
      { tag: 'pt-st', name: 'Portuguese' },
      { tag: 'cri', name: 'Forro' },
    ],
  },
  {
    code: 'SN',
    name: 'Senegal',
    dialects: [
      { tag: 'wo-sn', name: 'Wolof' },
      { tag: 'fr-sn', name: 'French' },
      { tag: 'ff-sn', name: 'Fulani (Pulaar)' },
      { tag: 'dyo', name: 'Jola' },
    ],
  },
  {
    code: 'SC',
    name: 'Seychelles',
    dialects: [
      { tag: 'crs', name: 'Seychellois Creole' },
      { tag: 'fr-sc', name: 'French' },
    ],
  },
  {
    code: 'SL',
    name: 'Sierra Leone',
    dialects: [
      { tag: 'kri', name: 'Krio' },
      { tag: 'men', name: 'Mende' },
      { tag: 'tem', name: 'Temne' },
    ],
  },
  {
    code: 'SO',
    name: 'Somalia',
    dialects: [
      { tag: 'so-so', name: 'Somali' },
      { tag: 'ar-so', name: 'Arabic' },
    ],
  },
  {
    code: 'ZA',
    name: 'South Africa',
    dialects: [
      { tag: 'zu', name: 'Zulu' },
      { tag: 'xh', name: 'Xhosa' },
      { tag: 'af-za', name: 'Afrikaans' },
      { tag: 'st-za', name: 'Sesotho' },
    ],
  },
  {
    code: 'SS',
    name: 'South Sudan',
    dialects: [
      { tag: 'dinka', name: 'Dinka' },
      { tag: 'nus', name: 'Nuer' },
    ],
  },
  {
    code: 'SD',
    name: 'Sudan',
    dialects: [
      { tag: 'ar-sd', name: 'Arabic (Sudanese)' },
    ],
  },
  {
    code: 'TZ',
    name: 'Tanzania',
    dialects: [
      { tag: 'sw-tz', name: 'Swahili' },
      { tag: 'suk', name: 'Sukuma' },
    ],
  },
  {
    code: 'TG',
    name: 'Togo',
    dialects: [
      { tag: 'fr-tg', name: 'French' },
      { tag: 'ee-tg', name: 'Ewe' },
      { tag: 'kbp', name: 'Kabiye' },
    ],
  },
  {
    code: 'TN',
    name: 'Tunisia',
    dialects: [
      { tag: 'aeb', name: 'Arabic (Tunisian)' },
      { tag: 'fr-tn', name: 'French' },
    ],
  },
  {
    code: 'UG',
    name: 'Uganda',
    dialects: [
      { tag: 'lg', name: 'Luganda' },
      { tag: 'sw-ug', name: 'Swahili' },
      { tag: 'nyn', name: 'Runyankole' },
    ],
  },
  {
    code: 'ZM',
    name: 'Zambia',
    dialects: [
      { tag: 'bem', name: 'Bemba' },
      { tag: 'ny-zm', name: 'Nyanja' },
      { tag: 'toi', name: 'Tonga' },
    ],
  },
  {
    code: 'ZW',
    name: 'Zimbabwe',
    dialects: [
      { tag: 'sn', name: 'Shona' },
      { tag: 'nd', name: 'Ndebele' },
    ],
  },
];
