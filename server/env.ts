/** Помощники для переменных окружения. Файл одинаковый во всех проектах CaravanHouse: правите здесь — перенесите в остальные. */

/** Railway задаёт эти переменные во всех своих сервисах */
export const onRailway = Boolean(process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_NAME);
