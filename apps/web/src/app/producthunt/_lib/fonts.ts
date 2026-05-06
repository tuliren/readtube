async function loadGoogleFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  }).then((res) => res.text());
  const match = css.match(/src: url\((https:\/\/[^)]+)\) format/);
  if (match == null) {
    throw new Error(`Could not extract font URL for ${family} ${weight}`);
  }
  return fetch(match[1]).then((res) => res.arrayBuffer());
}

export async function loadInter(text: string) {
  const [bold, regular] = await Promise.all([
    loadGoogleFont('Inter', 700, text),
    loadGoogleFont('Inter', 400, text),
  ]);
  return [
    { name: 'Inter', data: regular, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: bold, weight: 700 as const, style: 'normal' as const },
  ];
}
