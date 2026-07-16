const token = process.env.GITHUB_TOKEN;
const username = process.env.USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const endpoint = process.env.GITHUB_ENDPOINT || 'https://api.github.com/graphql';
const svgPath =
  process.env.PROFILE_GITBLOCK_SVG ||
  'profile-3d-contrib/profile-gitblock.svg';

const maxLanguages = Number(process.env.PROFILE_LANGUAGE_LIMIT || 7);

if (!token) {
  throw new Error('GITHUB_TOKEN is required');
}

if (!username) {
  throw new Error('USERNAME or GITHUB_REPOSITORY_OWNER is required');
}

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const compactNumber = (value) =>
  new Intl.NumberFormat('en', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);

const fetchLanguages = async () => {
  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          commitContributionsByRepository(maxRepositories: 100) {
            repository {
              primaryLanguage {
                name
                color
              }
            }
            contributions {
              totalCount
            }
          }
        }
      }
    }
  `.replace(/\s+/g, ' ');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }

  const totals = new Map();
  for (const item of payload.data.user.contributionsCollection
    .commitContributionsByRepository) {
    const language = item.repository.primaryLanguage;
    if (!language?.name) {
      continue;
    }

    const previous = totals.get(language.name) || {
      name: language.name,
      color: language.color || '#64748b',
      contributions: 0,
    };
    previous.contributions += item.contributions.totalCount;
    totals.set(language.name, previous);
  }

  return [...totals.values()]
    .sort((left, right) => right.contributions - left.contributions)
    .slice(0, maxLanguages);
};

const createLanguageGroup = (languages) => {
  const max = Math.max(...languages.map((item) => item.contributions), 1);
  const rows = languages
    .map((item, index) => {
      const y = 64 + index * 27;
      const barWidth = Math.max(12, Math.round((item.contributions / max) * 260));
      return `
        <g transform="translate(0, ${y})">
          <rect x="0" y="-12" width="18" height="18" rx="4" fill="${escapeXml(item.color)}"></rect>
          <text x="28" y="2" dominant-baseline="middle" fill="#00000f" font-size="19px" font-weight="700">${escapeXml(item.name)}</text>
          <rect x="172" y="-9" width="260" height="12" rx="6" fill="#edf2f7"></rect>
          <rect x="172" y="-9" width="${barWidth}" height="12" rx="6" fill="${escapeXml(item.color)}"></rect>
          <text x="452" y="2" dominant-baseline="middle" text-anchor="end" fill="#111133" font-size="18px" font-weight="700">${escapeXml(compactNumber(item.contributions))}</text>
        </g>`;
    })
    .join('');

  return `<g transform="translate(40, 520)">
    <text x="0" y="0" fill="#111133" font-size="26px" font-weight="800">Language Activity</text>
    <text x="0" y="28" fill="#4b5563" font-size="17px">Top commit languages</text>
    ${rows}
  </g>`;
};

const main = async () => {
  const [{ readFile, writeFile }, languages] = await Promise.all([
    import('node:fs/promises'),
    fetchLanguages(),
  ]);

  if (!languages.length) {
    console.log('No language data found; leaving profile-gitblock.svg unchanged.');
    return;
  }

  const svg = await readFile(svgPath, 'utf8');
  const startMarker = '<g transform="translate(40, 520)">';
  const endMarker =
    '<g><text style="font-size: 32px; font-weight: bold;" x="384"';
  const start = svg.indexOf(startMarker);
  const end = svg.indexOf(endMarker, start);

  if (start === -1 || end === -1) {
    throw new Error('Could not locate the language chart in profile-gitblock.svg');
  }

  const nextSvg =
    svg.slice(0, start) + createLanguageGroup(languages) + svg.slice(end);
  await writeFile(svgPath, nextSvg);
  console.log(
    `Updated ${svgPath} language chart: ${languages
      .map((item) => item.name)
      .join(', ')}`,
  );
};

await main();
