/** Помощники для переменных окружения. Файл одинаковый во всех проектах CaravanHouse: правите здесь — перенесите в остальные. */

/** Railway задаёт эти переменные во всех своих сервисах */
export const onRailway = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_NAME);

/**
 * Публичный адрес для кнопок Telegram. Railway показывает домен без схемы (my-app.up.railway.app),
 * поэтому её дописываем сами. Telegram принимает в кнопках только https: с http или кривым адресом
 * падало бы каждое сообщение с такой кнопкой, так что такой адрес отключаем и пишем предупреждение.
 */
export function httpsUrl(name: string, raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    console.warn(`${name}="${value}" — это не адрес. Кнопка отключена, укажите адрес вида https://my-app.up.railway.app`);
    return undefined;
  }
  if (url.protocol !== "https:") {
    console.warn(`${name}="${value}": Telegram принимает только https. Кнопка отключена, укажите адрес с https://`);
    return undefined;
  }
  return url.href;
}
